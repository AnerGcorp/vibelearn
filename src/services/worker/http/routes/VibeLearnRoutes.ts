/**
 * VibeLearnRoutes
 *
 * HTTP endpoints for the VibeLearn analysis pipeline:
 *   POST /api/vibelearn/analyze/stack     — detect tech stack, write vl_stack_profiles
 *   POST /api/vibelearn/analyze/static    — run static code analysis (in-memory, returns patterns)
 *   POST /api/vibelearn/analyze/concepts  — LLM concept extraction, write vl_concepts
 *   POST /api/vibelearn/analyze/quiz      — LLM quiz generation, write vl_questions
 *   POST /api/vibelearn/sync              — flush offline queue + sync to api.vibelearn.dev
 *   GET  /api/vibelearn/profile           — developer mastery profile
 *   GET  /api/vibelearn/questions/pending — questions not yet answered
 *   GET  /api/vibelearn/sessions/:id/summary — session summary + concepts
 */

import { readFileSync } from 'fs';
import express, { Request, Response, Application } from 'express';
import { basename } from 'path';
import { logger } from '../../../../utils/logger.js';
import { DatabaseManager } from '../../DatabaseManager.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { detectStack } from '../../../analysis/StackDetector.js';
import { analyzeFiles } from '../../../analysis/StaticAnalyzer.js';
import { extractConcepts } from '../../../analysis/ConceptExtractor.js';
import { generateQuizQuestions } from '../../../analysis/QuizGenerator.js';
import { UpstreamSync } from '../../../sync/UpstreamSync.js';
import { OfflineQueue } from '../../../sync/OfflineQueue.js';
import type { StackProfile } from '../../../analysis/StackDetector.js';
import type { CodePattern } from '../../../analysis/StaticAnalyzer.js';
import type { VibelearnConcept } from '../../../analysis/ConceptExtractor.js';
import type { VibelearnQuestion } from '../../../analysis/QuizGenerator.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Create a simple one-shot LLM prompt runner.
 * Tries providers in order: Gemini → OpenRouter → Anthropic.
 */
function createAgentRunner(): (prompt: string) => Promise<string> {
  const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);

  // Gemini
  const geminiKey = settings.VIBELEARN_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  if (geminiKey) {
    return async (prompt: string): Promise<string> => {
      const url = `${GEMINI_API_URL}/gemini-2.0-flash:generateContent?key=${geminiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
        })
      });
      if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
      const data = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    };
  }

  // OpenRouter
  const openrouterKey = settings.VIBELEARN_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
  if (openrouterKey) {
    const model = settings.VIBELEARN_OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct';
    return async (prompt: string): Promise<string> => {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 8192
        })
      });
      if (!response.ok) throw new Error(`OpenRouter API error: ${response.status}`);
      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>
      };
      return data.choices?.[0]?.message?.content ?? '';
    };
  }

  // Anthropic Messages API
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  return async (prompt: string): Promise<string> => {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`);
    const data = await response.json() as {
      content?: Array<{ text?: string }>
    };
    return data.content?.[0]?.text ?? '';
  };
}

/**
 * Get session row by content_session_id.
 */
function getSessionByContentId(db: ReturnType<DatabaseManager['getSessionStore']>['db'], contentSessionId: string): {
  id: number;
  content_session_id: string;
  memory_session_id: string | null;
  project: string;
  started_at_epoch: number;
} | null {
  return db.query<{
    id: number;
    content_session_id: string;
    memory_session_id: string | null;
    project: string;
    started_at_epoch: number;
  }, [string]>(`
    SELECT id, content_session_id, memory_session_id, project, started_at_epoch
    FROM sdk_sessions
    WHERE content_session_id = ?
    LIMIT 1
  `).get(contentSessionId) ?? null;
}

/**
 * Aggregate unique file paths (files_modified + files_read) across all observations for a session.
 */
function getSessionFilePaths(
  db: ReturnType<DatabaseManager['getSessionStore']>['db'],
  memorySessionId: string | null
): string[] {
  if (!memorySessionId) return [];

  try {
    const rows = db.query<{ files_modified: string | null; files_read: string | null }, [string]>(`
      SELECT files_modified, files_read
      FROM observations
      WHERE memory_session_id = ?
    `).all(memorySessionId);

    const paths = new Set<string>();
    for (const row of rows) {
      if (row.files_modified) {
        try {
          const arr = JSON.parse(row.files_modified) as string[];
          arr.forEach(p => paths.add(p));
        } catch { /* skip malformed */ }
      }
    }
    return [...paths];
  } catch {
    return [];
  }
}

/**
 * Read file contents for analysis, silently skip missing/large files.
 */
function readFilesForAnalysis(filePaths: string[]): Array<{ file_path: string; content: string }> {
  const MAX_FILE_BYTES = 100 * 1024;
  const result: Array<{ file_path: string; content: string }> = [];

  for (const fp of filePaths) {
    try {
      const content = readFileSync(fp, 'utf-8');
      if (content.length <= MAX_FILE_BYTES) {
        result.push({ file_path: fp, content });
      }
    } catch { /* skip */ }
  }

  return result;
}

export class VibeLearnRoutes extends BaseRouteHandler {
  private upstreamSync: UpstreamSync;
  private offlineQueue: OfflineQueue;

  constructor(private dbManager: DatabaseManager) {
    super();
    this.upstreamSync = new UpstreamSync();
    this.offlineQueue = new OfflineQueue(dbManager.getSessionStore().db);
  }

  setupRoutes(app: Application): void {
    app.post('/api/vibelearn/analyze/stack', this.wrapHandler(this.handleStack.bind(this)));
    app.post('/api/vibelearn/analyze/static', this.wrapHandler(this.handleStatic.bind(this)));
    app.post('/api/vibelearn/analyze/concepts', this.wrapHandler(this.handleConcepts.bind(this)));
    app.post('/api/vibelearn/analyze/quiz', this.wrapHandler(this.handleQuiz.bind(this)));
    app.post('/api/vibelearn/sync', this.wrapHandler(this.handleSync.bind(this)));
    app.get('/api/vibelearn/profile', this.wrapHandler(this.handleProfile.bind(this)));
    app.get('/api/vibelearn/questions/pending', this.wrapHandler(this.handlePendingQuestions.bind(this)));
    app.get('/api/vibelearn/sessions/:sessionId/summary', this.wrapHandler(this.handleSessionSummary.bind(this)));
  }

  // ─── Analysis: Stack Detection ────────────────────────────────────────────

  private async handleStack(req: Request, res: Response): Promise<void> {
    const { contentSessionId } = req.body;
    if (!contentSessionId) return this.badRequest(res, 'Missing contentSessionId');

    const db = this.dbManager.getSessionStore().db;
    const session = getSessionByContentId(db, contentSessionId);
    if (!session) return this.notFound(res, 'Session not found');

    const filePaths = getSessionFilePaths(db, session.memory_session_id);
    const cwd = session.project;

    const stackProfile = detectStack(contentSessionId, filePaths, cwd);

    db.run(`
      INSERT OR REPLACE INTO vl_stack_profiles
      (session_id, language_json, framework, orm, state_management, testing_json, auth, styling_json, confidence_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      contentSessionId,
      stackProfile.language_json,
      stackProfile.framework,
      stackProfile.orm,
      stackProfile.state_management,
      stackProfile.testing_json,
      stackProfile.auth,
      stackProfile.styling_json,
      stackProfile.confidence_json
    ]);

    logger.info('VL', 'Stack detected', {
      sessionId: contentSessionId,
      framework: stackProfile.framework,
      languages: stackProfile.language_json
    });

    res.json({ status: 'ok', stack: stackProfile });
  }

  // ─── Analysis: Static Analysis ────────────────────────────────────────────

  private async handleStatic(req: Request, res: Response): Promise<void> {
    const { contentSessionId } = req.body;
    if (!contentSessionId) return this.badRequest(res, 'Missing contentSessionId');

    const db = this.dbManager.getSessionStore().db;
    const session = getSessionByContentId(db, contentSessionId);
    if (!session) return this.notFound(res, 'Session not found');

    const filePaths = getSessionFilePaths(db, session.memory_session_id);
    const files = readFilesForAnalysis(filePaths);
    const patterns = analyzeFiles(files);

    logger.info('VL', 'Static analysis complete', {
      sessionId: contentSessionId,
      files: files.length,
      patterns: patterns.length
    });

    res.json({ status: 'ok', patterns_count: patterns.length });
  }

  // ─── Analysis: Concept Extraction (LLM) ───────────────────────────────────

  private async handleConcepts(req: Request, res: Response): Promise<void> {
    const { contentSessionId, last_assistant_message } = req.body;
    if (!contentSessionId) return this.badRequest(res, 'Missing contentSessionId');

    const db = this.dbManager.getSessionStore().db;
    const session = getSessionByContentId(db, contentSessionId);
    if (!session) return this.notFound(res, 'Session not found');

    // Get stack profile (stored by analyze/stack step)
    const stackProfile: StackProfile = db.query<StackProfile, [string]>(`
      SELECT * FROM vl_stack_profiles WHERE session_id = ? LIMIT 1
    `).get(contentSessionId) ?? {
      session_id: contentSessionId,
      language_json: '[]',
      framework: null,
      orm: null,
      state_management: null,
      testing_json: '[]',
      auth: null,
      styling_json: '[]',
      confidence_json: '{}'
    };

    // Static analysis for context
    const filePaths = getSessionFilePaths(db, session.memory_session_id);
    const files = readFilesForAnalysis(filePaths);
    const patterns: CodePattern[] = analyzeFiles(files);

    // Compute session duration
    const durationMinutes = Math.max(1, Math.round((Date.now() - session.started_at_epoch) / 60000));
    const projectName = basename(session.project);

    const agentRunner = createAgentRunner();
    const { summary, concepts } = await extractConcepts(
      contentSessionId,
      projectName,
      last_assistant_message ?? '',
      stackProfile,
      patterns,
      { created: 0, edited: filePaths.length },
      durationMinutes,
      agentRunner
    );

    // Persist session summary
    db.run(`
      INSERT OR REPLACE INTO vibelearn_session_summaries
      (session_id, what_was_built, developer_intent, architecture_decisions_json,
       concepts_json, stack_confirmed_json, session_duration_minutes,
       files_created, files_edited, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      contentSessionId,
      summary.what_was_built,
      summary.developer_intent,
      summary.architecture_decisions_json,
      summary.concepts_json,
      summary.stack_confirmed_json,
      summary.session_duration_minutes,
      summary.files_created,
      summary.files_edited,
      summary.generated_at
    ]);

    // Persist concepts
    const insertConcept = db.prepare(`
      INSERT OR IGNORE INTO vl_concepts
      (id, session_id, concept_name, category, difficulty, source_file,
       snippet, why_it_matters, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of concepts) {
      insertConcept.run(
        c.id, c.session_id, c.concept_name, c.category, c.difficulty,
        c.source_file, c.snippet, c.why_it_matters, c.confidence, c.created_at
      );
    }

    logger.info('VL', 'Concepts extracted', {
      sessionId: contentSessionId,
      concepts: concepts.length
    });

    res.json({ status: 'ok', concepts_count: concepts.length });
  }

  // ─── Analysis: Quiz Generation (LLM) ──────────────────────────────────────

  private async handleQuiz(req: Request, res: Response): Promise<void> {
    const { contentSessionId } = req.body;
    if (!contentSessionId) return this.badRequest(res, 'Missing contentSessionId');

    const db = this.dbManager.getSessionStore().db;

    // Load concepts for this session
    const concepts: VibelearnConcept[] = db.query<VibelearnConcept, [string]>(`
      SELECT * FROM vl_concepts WHERE session_id = ?
    `).all(contentSessionId);

    if (concepts.length === 0) {
      res.json({ status: 'ok', questions_count: 0, reason: 'no_concepts' });
      return;
    }

    // Get mastered concept names (mastery_score > 0.85)
    const masteredRows = db.query<{ concept_name: string }, []>(`
      SELECT concept_name FROM vl_developer_profile WHERE mastery_score > 0.85
    `).all();
    const mastered = new Set(masteredRows.map(r => r.concept_name));

    const agentRunner = createAgentRunner();
    const questions = await generateQuizQuestions(concepts, mastered, contentSessionId, agentRunner);

    // Persist questions
    const insertQ = db.prepare(`
      INSERT OR IGNORE INTO vl_questions
      (id, session_id, concept_id, question_type, difficulty, snippet,
       question, options_json, correct, explanation, follow_up_mid, tags_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const q of questions) {
      insertQ.run(
        q.id, q.session_id, q.concept_id, q.question_type, q.difficulty,
        q.snippet, q.question, q.options_json, q.correct, q.explanation,
        q.follow_up_mid, q.tags_json, q.created_at
      );
    }

    logger.info('VL', 'Quiz questions generated', {
      sessionId: contentSessionId,
      questions: questions.length
    });

    res.json({ status: 'ok', questions_count: questions.length });
  }

  // ─── Sync ─────────────────────────────────────────────────────────────────

  private async handleSync(req: Request, res: Response): Promise<void> {
    const { contentSessionId } = req.body;
    if (!contentSessionId) return this.badRequest(res, 'Missing contentSessionId');

    const db = this.dbManager.getSessionStore().db;

    // Flush any pending offline queue entries first
    try {
      await this.offlineQueue.flush(this.upstreamSync);
    } catch (err) {
      logger.warn('VL', 'Offline queue flush failed', {}, err as Error);
    }

    if (!this.upstreamSync.isConfigured()) {
      res.json({ status: 'skipped', reason: 'no_api_key' });
      return;
    }

    // Load all session data needed for sync
    const summary = db.query<{
      session_id: string;
      what_was_built: string;
      developer_intent: string;
      architecture_decisions_json: string;
      concepts_json: string;
      stack_confirmed_json: string;
      session_duration_minutes: number;
      files_created: number;
      files_edited: number;
      generated_at: number;
    }, [string]>(`
      SELECT * FROM vibelearn_session_summaries WHERE session_id = ? LIMIT 1
    `).get(contentSessionId);

    if (!summary) {
      res.json({ status: 'skipped', reason: 'no_summary' });
      return;
    }

    const concepts: VibelearnConcept[] = db.query<VibelearnConcept, [string]>(`
      SELECT * FROM vl_concepts WHERE session_id = ?
    `).all(contentSessionId);

    const questions: VibelearnQuestion[] = db.query<VibelearnQuestion, [string]>(`
      SELECT * FROM vl_questions WHERE session_id = ?
    `).all(contentSessionId);

    const stackProfile: StackProfile = db.query<StackProfile, [string]>(`
      SELECT * FROM vl_stack_profiles WHERE session_id = ? LIMIT 1
    `).get(contentSessionId) ?? {
      session_id: contentSessionId,
      language_json: '[]',
      framework: null,
      orm: null,
      state_management: null,
      testing_json: '[]',
      auth: null,
      styling_json: '[]',
      confidence_json: '{}'
    };

    const session = getSessionByContentId(db, contentSessionId);
    const projectName = session ? basename(session.project) : 'unknown';

    const vlSummary = {
      session_id: summary.session_id,
      what_was_built: summary.what_was_built,
      developer_intent: summary.developer_intent,
      architecture_decisions_json: summary.architecture_decisions_json,
      concepts_json: summary.concepts_json,
      stack_confirmed_json: summary.stack_confirmed_json,
      session_duration_minutes: summary.session_duration_minutes,
      files_created: summary.files_created,
      files_edited: summary.files_edited,
      generated_at: summary.generated_at
    };

    try {
      await this.upstreamSync.syncSession(
        vlSummary,
        concepts,
        questions,
        stackProfile,
        projectName
      );

      // Mark session as synced
      db.run(`
        UPDATE vibelearn_session_summaries SET synced_at = ? WHERE session_id = ?
      `, [Math.floor(Date.now() / 1000), contentSessionId]);

      res.json({ status: 'ok', synced: true });
    } catch (err) {
      // Enqueue for retry
      const payload = JSON.stringify({ session_id: contentSessionId });
      this.offlineQueue.enqueue('session', payload);
      logger.warn('VL', 'Sync failed, queued for offline retry', { sessionId: contentSessionId }, err as Error);
      res.json({ status: 'queued', reason: (err as Error).message });
    }
  }

  // ─── Profile & Query Endpoints ────────────────────────────────────────────

  private handleProfile(_req: Request, res: Response): void {
    const db = this.dbManager.getSessionStore().db;

    const profile = db.query<{
      concept_name: string;
      category: string;
      mastery_score: number;
      encounter_count: number;
      correct_answers: number;
      last_seen_at: number;
    }, []>(`
      SELECT concept_name, category, mastery_score, encounter_count, correct_answers, last_seen_at
      FROM vl_developer_profile
      ORDER BY last_seen_at DESC
      LIMIT 100
    `).all();

    res.json({ profile });
  }

  private handlePendingQuestions(_req: Request, res: Response): void {
    const db = this.dbManager.getSessionStore().db;

    // Questions not yet attempted
    const questions = db.query<{
      id: string;
      session_id: string;
      concept_id: string;
      question_type: string;
      difficulty: string;
      question: string;
      options_json: string | null;
      correct: string;
      explanation: string;
      snippet: string;
    }, []>(`
      SELECT q.id, q.session_id, q.concept_id, q.question_type, q.difficulty,
             q.question, q.options_json, q.correct, q.explanation, q.snippet
      FROM vl_questions q
      WHERE q.id NOT IN (SELECT DISTINCT question_id FROM vl_quiz_attempts)
      ORDER BY q.created_at DESC
      LIMIT 20
    `).all();

    res.json({ questions });
  }

  private handleSessionSummary(req: Request, res: Response): void {
    const { sessionId } = req.params;
    const db = this.dbManager.getSessionStore().db;

    const summary = db.query<{
      session_id: string;
      what_was_built: string;
      developer_intent: string;
      session_duration_minutes: number;
      generated_at: number;
    }, [string]>(`
      SELECT session_id, what_was_built, developer_intent,
             session_duration_minutes, generated_at
      FROM vibelearn_session_summaries
      WHERE session_id = ?
      LIMIT 1
    `).get(sessionId);

    if (!summary) return this.notFound(res, 'Summary not found');

    const concepts = db.query<{
      concept_name: string;
      category: string;
      difficulty: string;
      confidence: number;
    }, [string]>(`
      SELECT concept_name, category, difficulty, confidence
      FROM vl_concepts
      WHERE session_id = ?
      ORDER BY confidence DESC
    `).all(sessionId);

    res.json({ summary, concepts });
  }
}
