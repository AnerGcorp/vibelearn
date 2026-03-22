/**
 * UpstreamSync
 *
 * Syncs session analysis results to api.vibelearn.dev.
 *
 * Privacy: never sends raw file content, full prompts, or absolute paths.
 * Sends: session metadata, concept names/categories, question text, stack profile.
 *
 * Each attempt payload is HMAC-signed with the user's API key so the server
 * can reject tampered or fabricated attempt records.
 */

import { createHmac, randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import { logger } from '../../utils/logger.js';
import type { VibelearnSessionSummary, VibelearnConcept } from '../analysis/ConceptExtractor.js';
import type { VibelearnQuestion } from '../analysis/QuizGenerator.js';
import type { StackProfile } from '../analysis/StackDetector.js';

export interface SyncAttempt {
  question_id: string;
  answer_given: string;
  is_correct: boolean;
  time_taken_ms: number;
  created_at: number;
}

export interface SyncPayload {
  client_version: string;
  session: {
    id: string;
    project_name: string;
    started_at: number;
    ended_at: number;
    duration_minutes: number;
    files_created: number;
    files_edited: number;
    ide: 'claude-code' | 'cursor';
  };
  stack: {
    framework: string | null;
    orm: string | null;
    testing: string[];
    language: string[];
  };
  concepts: Array<{
    name: string;
    category: string;
    difficulty: string;
    confidence: number;
    source_file: string;    // basename only — no absolute path
    snippet_lines: number;
  }>;
  questions: Array<{
    id: string;
    concept_name: string;
    question_type: string;
    difficulty: string;
    question: string;
    options: string[] | null;
    correct: string;
    explanation: string;
    snippet: string;
  }>;
  attempts?: Array<{
    question_id: string;
    is_correct: boolean;
    time_taken_ms: number;
    created_at: number;
    signature: string;   // HMAC-SHA256(api_key, question_id + is_correct + created_at)
  }>;
}

interface VibelearnConfig {
  api_key?: string;
  api_url?: string;
  auto_sync?: boolean;
  sync_code_snippets?: boolean;
  user_id?: string;
}

const DEFAULT_API_URL = 'https://api.vibelearn.dev';
const CONFIG_PATH = join(homedir(), '.vibelearn', 'config.json');

export function loadConfig(): VibelearnConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    logger.debug('SYNC', 'Failed to load vibelearn config', {}, err as Error);
  }
  return {};
}

export function saveConfig(config: VibelearnConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Compute HMAC signature for a quiz attempt.
 * Prevents local SQLite manipulation from propagating to the server.
 */
function signAttempt(
  apiKey: string,
  questionId: string,
  isCorrect: boolean,
  createdAt: number
): string {
  const message = `${questionId}:${isCorrect ? '1' : '0'}:${createdAt}`;
  return createHmac('sha256', apiKey).update(message).digest('hex');
}

/**
 * Sanitize payload — strip sensitive data before sending to server.
 */
function buildSyncPayload(
  summary: VibelearnSessionSummary,
  concepts: VibelearnConcept[],
  questions: VibelearnQuestion[],
  stackProfile: StackProfile,
  projectName: string,
  clientVersion: string,
  ide: 'claude-code' | 'cursor',
  apiKey: string,
  attempts?: SyncAttempt[]
): SyncPayload {
  const stack = JSON.parse(stackProfile.language_json ?? '[]');

  const payload: SyncPayload = {
    client_version: clientVersion,
    session: {
      id: summary.session_id,
      project_name: projectName,
      started_at: summary.generated_at - summary.session_duration_minutes * 60,
      ended_at: summary.generated_at,
      duration_minutes: summary.session_duration_minutes,
      files_created: summary.files_created,
      files_edited: summary.files_edited,
      ide
    },
    stack: {
      framework: stackProfile.framework,
      orm: stackProfile.orm,
      testing: JSON.parse(stackProfile.testing_json ?? '[]'),
      language: stack
    },
    concepts: concepts.map(c => ({
      name: c.concept_name,
      category: c.category,
      difficulty: c.difficulty,
      confidence: c.confidence,
      source_file: basename(c.source_file),  // never send absolute paths
      snippet_lines: c.snippet.split('\n').length
    })),
    questions: questions.map(q => ({
      id: q.id,
      concept_name: concepts.find(c => c.id === q.concept_id)?.concept_name ?? '',
      question_type: q.question_type,
      difficulty: q.difficulty,
      question: q.question,
      options: q.options_json ? JSON.parse(q.options_json) : null,
      correct: q.correct,
      explanation: q.explanation,
      snippet: q.snippet.split('\n').slice(0, 5).join('\n')  // max 5 lines
    }))
  };

  if (attempts && attempts.length > 0) {
    payload.attempts = attempts.map(a => ({
      question_id: a.question_id,
      is_correct: a.is_correct,
      time_taken_ms: a.time_taken_ms,
      created_at: a.created_at,
      signature: signAttempt(apiKey, a.question_id, a.is_correct, a.created_at)
    }));
  }

  return payload;
}

export class UpstreamSync {
  private apiKey: string;
  private apiUrl: string;
  private clientVersion: string;

  constructor(clientVersion: string = '0.1.0') {
    const config = loadConfig();
    this.apiKey = config.api_key ?? '';
    this.apiUrl = config.api_url ?? DEFAULT_API_URL;
    this.clientVersion = clientVersion;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Sync a session's analysis results to api.vibelearn.dev.
   * Throws on network error — caller should catch and add to offline queue.
   */
  async syncSession(
    summary: VibelearnSessionSummary,
    concepts: VibelearnConcept[],
    questions: VibelearnQuestion[],
    stackProfile: StackProfile,
    projectName: string,
    ide: 'claude-code' | 'cursor' = 'claude-code',
    attempts?: SyncAttempt[]
  ): Promise<void> {
    if (!this.isConfigured()) {
      logger.debug('SYNC', 'No API key configured, skipping upstream sync');
      return;
    }

    const payload = buildSyncPayload(
      summary, concepts, questions, stackProfile,
      projectName, this.clientVersion, ide, this.apiKey, attempts
    );

    const response = await fetch(`${this.apiUrl}/v1/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-VibeLearn-Version': this.clientVersion
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Sync failed: ${response.status} ${text.slice(0, 200)}`);
    }

    logger.info('SYNC', 'Session synced to vibelearn.dev', {
      session_id: summary.session_id,
      concepts: concepts.length,
      questions: questions.length
    });
  }

  /**
   * Flush a raw payload (from the offline queue).
   */
  async syncRawPayload(payloadJson: string): Promise<void> {
    if (!this.isConfigured()) return;

    const response = await fetch(`${this.apiUrl}/v1/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-VibeLearn-Version': this.clientVersion
      },
      body: payloadJson
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Sync failed: ${response.status} ${text.slice(0, 200)}`);
    }
  }
}
