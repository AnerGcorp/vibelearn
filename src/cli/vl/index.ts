/**
 * vl — VibeLearn CLI
 *
 * Interactive terminal tool for reviewing learning content captured during coding sessions.
 *
 * Commands:
 *   vl quiz              Interactive quiz (all pending questions)
 *   vl quiz --session    Quiz only the last session's questions
 *   vl status            Sessions analyzed, concepts by category, streak
 *   vl gaps              Concepts seen but not yet mastered (mastery < 0.5)
 *   vl sync              Re-run full analysis pipeline on the latest session
 *   vl sync <session-id> Re-run full analysis pipeline on a specific session
 *   vl login <api-key>   Save API key to ~/.vibelearn/config.json
 *   vl login --status    Show auth status
 */

import { createInterface } from 'readline';
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { updateDailyStreak } from '../../services/analysis/MasteryTracker.js';
import { scheduleNextReview, applySchedule, getQuestionsDueNow } from '../../services/analysis/SM2Scheduler.js';
import {
  applyAdaptiveUpdate,
  shouldInsertFollowUp,
  makeFollowUpQuestion,
  type QuizQueueItem,
} from '../../services/analysis/AdaptiveEngine.js';

declare const __DEFAULT_PACKAGE_VERSION__: string;
const VL_VERSION = typeof __DEFAULT_PACKAGE_VERSION__ !== 'undefined' ? __DEFAULT_PACKAGE_VERSION__ : '0.0.0-dev';

const DATA_DIR = process.env.VIBELEARN_DATA_DIR
  ? process.env.VIBELEARN_DATA_DIR.replace('~', homedir())
  : join(homedir(), '.vibelearn');

const DB_PATH = join(DATA_DIR, 'vibelearn.db');
const CONFIG_PATH = join(DATA_DIR, 'config.json');

// ─── Config Helpers ───────────────────────────────────────────────────────────

function loadConfig(): Record<string, string> {
  try {
    if (existsSync(CONFIG_PATH)) return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch { /* ignore */ }
  return {};
}

function saveConfig(config: Record<string, string>): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

function openDb(): Database | null {
  if (!existsSync(DB_PATH)) {
    console.log('No VibeLearn database found. Start a coding session first!');
    return null;
  }
  return new Database(DB_PATH, { readonly: true });
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdStatus(): Promise<void> {
  const db = openDb();
  if (!db) return;

  const totalSessions = (db.query<{ count: number }, []>(
    `SELECT COUNT(*) as count FROM vibelearn_session_summaries`
  ).get())?.count ?? 0;

  const totalConcepts = (db.query<{ count: number }, []>(
    `SELECT COUNT(*) as count FROM vl_concepts`
  ).get())?.count ?? 0;

  const totalQuestions = (db.query<{ count: number }, []>(
    `SELECT COUNT(*) as count FROM vl_questions`
  ).get())?.count ?? 0;

  const pendingQuestions = (db.query<{ count: number }, []>(`
    SELECT COUNT(*) as count FROM vl_questions
    WHERE id NOT IN (SELECT DISTINCT question_id FROM vl_quiz_attempts)
  `).get())?.count ?? 0;

  const conceptsByCategory = db.query<{ category: string; count: number }, []>(`
    SELECT category, COUNT(*) as count
    FROM vl_concepts
    GROUP BY category
    ORDER BY count DESC
    LIMIT 10
  `).all();

  const masteredCount = (db.query<{ count: number }, []>(`
    SELECT COUNT(*) as count FROM vl_developer_profile WHERE mastery_score > 0.85
  `).get())?.count ?? 0;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  VibeLearn Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Sessions analyzed : ${totalSessions}`);
  console.log(`  Concepts captured : ${totalConcepts}`);
  console.log(`  Quiz questions    : ${totalQuestions} (${pendingQuestions} pending)`);
  console.log(`  Mastered concepts : ${masteredCount}`);

  if (conceptsByCategory.length > 0) {
    console.log('\n  Top categories:');
    conceptsByCategory.forEach(row => {
      console.log(`    ${row.category.padEnd(20)} ${row.count}`);
    });
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  db.close();
}

async function cmdGaps(): Promise<void> {
  const db = openDb();
  if (!db) return;

  const gaps = db.query<{
    concept_name: string;
    category: string;
    mastery_score: number;
    times_seen: number;
  }, []>(`
    SELECT concept_name, category, mastery_score, encounter_count as times_seen
    FROM vl_developer_profile
    WHERE mastery_score < 0.5
    ORDER BY mastery_score ASC, times_seen DESC
    LIMIT 20
  `).all();

  if (gaps.length === 0) {
    console.log('\nNo knowledge gaps found. Keep coding and learning!\n');
    db.close();
    return;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Knowledge Gaps (mastery < 50%)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  gaps.forEach(gap => {
    const bar = '█'.repeat(Math.round(gap.mastery_score * 10)) + '░'.repeat(10 - Math.round(gap.mastery_score * 10));
    const pct = Math.round(gap.mastery_score * 100);
    console.log(`  ${gap.concept_name.padEnd(30)} [${bar}] ${String(pct).padStart(3)}%  (${gap.category})`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  db.close();
}

async function cmdQuiz(sessionOnly: boolean): Promise<void> {
  const db = openDb();
  if (!db) return;

  const nowEpoch = Math.floor(Date.now() / 1000);

  let sessionId: string | undefined;
  if (sessionOnly) {
    const lastSession = db.query<{ session_id: string }, []>(`
      SELECT session_id FROM vibelearn_session_summaries
      ORDER BY generated_at DESC LIMIT 1
    `).get();

    if (!lastSession) {
      console.log('\nNo sessions found. Run a coding session first!\n');
      db.close();
      return;
    }
    sessionId = lastSession.session_id;
  }

  // Use SM2 filter: show questions due now (never reviewed or past their next_review_at)
  const questions = getQuestionsDueNow(db, nowEpoch, sessionId, 20);

  db.close();

  if (questions.length === 0) {
    console.log('\nNo pending questions! Great job staying on top of your learning.\n');
    return;
  }

  // Open writable DB for recording attempts
  const writeDb = new Database(DB_PATH);
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q: string): Promise<string> =>
    new Promise(resolve => rl.question(q, resolve));

  let correct = 0;
  let total = 0;

  // Mutable queue — adaptive engine may insert follow-up questions
  const queue: QuizQueueItem[] = [...questions as QuizQueueItem[]];
  // Track IDs already in queue to prevent duplicate follow-ups
  const queueIds = new Set(queue.map(q => q.id));

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  VibeLearn Quiz — ${queue.length} questions`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  let questionIndex = 0;
  while (questionIndex < queue.length) {
    const q = queue[questionIndex];
    const num = `Q${questionIndex + 1}/${queue.length}`;
    const concept = q.concept_name ? ` [${q.concept_name}]` : '';

    console.log(`\n${num} (${q.difficulty})${concept}`);

    if (q.snippet && q.snippet.trim()) {
      console.log('\n  Code:\n');
      q.snippet.split('\n').forEach(line => console.log(`    ${line}`));
      console.log('');
    }

    console.log(`  ${q.question}\n`);

    let userAnswer = '';
    const startTime = Date.now();

    if (q.question_type === 'multiple_choice' && q.options_json) {
      try {
        const options = JSON.parse(q.options_json) as string[];
        options.forEach((opt, idx) => {
          const letter = String.fromCharCode(65 + idx); // A, B, C, D
          console.log(`  ${letter}) ${opt}`);
        });
        console.log('');
        userAnswer = (await ask('  Your answer (A/B/C/D): ')).trim().toUpperCase();
      } catch {
        userAnswer = (await ask('  Your answer: ')).trim();
      }
    } else if (q.question_type === 'fill_in_blank') {
      userAnswer = (await ask('  Fill in: ')).trim();
    } else if (q.question_type === 'ordering' && q.options_json) {
      try {
        const steps = JSON.parse(q.options_json) as string[];
        steps.forEach((step, idx) => console.log(`  ${idx + 1}. ${step}`));
        console.log('');
        userAnswer = (await ask('  Enter correct order (e.g. 2,4,1,3): ')).trim();
      } catch {
        userAnswer = (await ask('  Your answer: ')).trim();
      }
    } else if (q.question_type === 'true_false') {
      userAnswer = (await ask('  True or False? ')).trim().toLowerCase();
    } else {
      // open_ended, spot_the_bug, code_reading — free text
      if (q.question_type === 'open_ended') {
        console.log('  (Open-ended — describe your reasoning, then press Enter)');
      }
      userAnswer = (await ask('  Your answer: ')).trim();
    }

    const timeTaken = Date.now() - startTime;

    // For open_ended questions there is no definitive correct/wrong
    const isOpenEnded = q.question_type === 'open_ended';
    let isCorrect = false;
    if (!isOpenEnded && q.correct !== null) {
      isCorrect = userAnswer.toLowerCase() === q.correct.toLowerCase();
    }

    if (isOpenEnded) {
      console.log('\n  ✎ Open-ended noted.\n');
    } else if (isCorrect) {
      console.log('\n  ✓ Correct!\n');
      correct++;
    } else {
      console.log(`\n  ✗ Incorrect. Correct answer: ${q.correct ?? '(see explanation)'}\n`);
    }

    console.log(`  Explanation: ${q.explanation}\n`);
    console.log('  ─────────────────────────────────────────────');

    total++;

    // Record attempt and update mastery / daily streak
    try {
      const { randomUUID } = await import('crypto');
      writeDb.run(`
        INSERT INTO vl_quiz_attempts (id, question_id, answer_given, is_correct, time_taken_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [randomUUID(), q.id, userAnswer, isCorrect ? 1 : 0, timeTaken, Math.floor(Date.now() / 1000)]);

      // Update spaced-repetition schedule (skip for synthetic follow-up questions)
      if (!q.is_follow_up) {
        const schedule = scheduleNextReview({
          isCorrect,
          currentEaseFactor: q.ease_factor ?? 2.5,
          currentIntervalDays: q.interval_days ?? 0,
          currentRepetitions: q.repetitions ?? 0,
          nowEpoch: Math.floor(Date.now() / 1000),
        });
        applySchedule(writeDb, q.id, schedule);
      }

      // Apply adaptive level promotion/demotion (wraps updateMasteryAfterAttempt)
      if (q.concept_name && !isOpenEnded) {
        const conceptRow = writeDb.query<{ category: string }, [string]>(
          `SELECT category FROM vl_concepts WHERE concept_name = ? LIMIT 1`
        ).get(q.concept_name);

        const adaptResult = applyAdaptiveUpdate(writeDb, {
          conceptName: q.concept_name,
          category: conceptRow?.category ?? 'general',
          isCorrect,
        });

        if (adaptResult.promoted) {
          console.log(`  🎉 Level up! ${q.concept_name}: ${adaptResult.previousLevel} → ${adaptResult.profile.current_level}\n`);
        } else if (adaptResult.demoted) {
          console.log(`  📉 Level dropped: ${q.concept_name}: ${adaptResult.previousLevel} → ${adaptResult.profile.current_level}\n`);
        }

        // Insert follow-up question at queue front if conditions met
        if (shouldInsertFollowUp(q, isCorrect, adaptResult.profile.current_level, queueIds)) {
          const followUp = makeFollowUpQuestion(q);
          queue.splice(questionIndex + 1, 0, followUp);
          queueIds.add(followUp.id);
          console.log(`  ➕ Follow-up added: ${followUp.question.slice(0, 60)}...\n`);
        }
      }

      // Update today's row in vl_daily_streaks
      updateDailyStreak(writeDb, isCorrect);
    } catch { /* silently skip attempt recording errors */ }

    questionIndex++;
  }

  rl.close();
  writeDb.close();

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Quiz complete: ${correct}/${total} correct (${pct}%)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

async function cmdSync(sessionId: string | null): Promise<void> {
  const WORKER_PORT = 37778;
  const BASE_URL = `http://localhost:${WORKER_PORT}`;

  async function post(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: unknown }> {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: { error: (err as Error).message } };
    }
  }

  // Resolve session ID — use provided or fall back to latest
  let targetSession = sessionId;
  if (!targetSession) {
    const db = openDb();
    if (!db) return;
    const row = db.query<{ content_session_id: string; project: string; started_at: string }, []>(
      `SELECT content_session_id, project, started_at FROM sdk_sessions ORDER BY started_at_epoch DESC LIMIT 1`
    ).get();
    db.close();
    if (!row) {
      console.log('\nNo sessions found in database.\n');
      return;
    }
    targetSession = row.content_session_id;
    console.log(`\n  Using latest session: ${row.project} (${row.started_at.slice(0, 16)})`);
    console.log(`  Session ID: ${targetSession}`);
  }

  const id = targetSession;
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  VibeLearn Sync — running analysis pipeline');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const steps: Array<{ label: string; path: string; body: Record<string, unknown> }> = [
    { label: 'stack detection', path: '/api/vibelearn/analyze/stack', body: { contentSessionId: id } },
    { label: 'static analysis', path: '/api/vibelearn/analyze/static', body: { contentSessionId: id } },
    { label: 'concept extraction', path: '/api/vibelearn/analyze/concepts', body: { contentSessionId: id } },
    { label: 'quiz generation', path: '/api/vibelearn/analyze/quiz', body: { contentSessionId: id } },
    { label: 'cloud sync', path: '/api/vibelearn/sync', body: { contentSessionId: id } },
  ];

  for (const step of steps) {
    process.stdout.write(`  ${step.label.padEnd(22)} ... `);
    const result = await post(step.path, step.body);
    if (result.ok) {
      const d = result.data as Record<string, unknown>;
      if (d.status === 'skipped') {
        console.log(`skipped (${d.reason ?? 'unknown reason'})`);
      } else {
        console.log('ok');
      }
    } else if (result.status === 0) {
      console.log('failed — worker not running? Start a session to restart it.');
      break;
    } else {
      console.log(`failed (HTTP ${result.status})`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function cmdLogin(apiKey: string | null, checkStatus: boolean): Promise<void> {
  if (checkStatus) {
    const config = loadConfig();
    if (config.api_key) {
      const masked = config.api_key.slice(0, 6) + '...' + config.api_key.slice(-4);
      console.log(`\n  Logged in: API key ${masked}\n`);
    } else {
      console.log('\n  Not logged in. Run: vl login <api-key>\n');
    }
    return;
  }

  if (!apiKey) {
    console.error('\n  Usage: vl login <api-key>\n');
    process.exit(1);
  }

  const config = loadConfig();
  config.api_key = apiKey;
  saveConfig(config);
  console.log('\n  API key saved to ~/.vibelearn/config.json\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case '-v':
    case '--version':
      console.log(`vl ${VL_VERSION}`);
      break;

    case 'quiz':
      await cmdQuiz(args.includes('--session'));
      break;

    case 'status':
      await cmdStatus();
      break;

    case 'gaps':
      await cmdGaps();
      break;

    case 'login': {
      const flagStatus = args.includes('--status');
      const apiKey = flagStatus ? null : (args[1] ?? null);
      await cmdLogin(apiKey, flagStatus);
      break;
    }

    case 'sync':
      await cmdSync(args[1] ?? null);
      break;

    default:
      console.log(`
VibeLearn CLI — learn from your coding sessions

Usage:
  vl quiz              Interactive quiz (all pending questions)
  vl quiz --session    Quiz only the last session's questions
  vl status            Sessions analyzed, concepts by category
  vl gaps              Concepts you haven't mastered yet
  vl sync              Re-run analysis + cloud sync on latest session
  vl sync <session-id> Re-run analysis + cloud sync on a specific session
  vl login <api-key>   Connect to vibelearn.dev
  vl login --status    Check login status
  vl --version         Show version
`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
