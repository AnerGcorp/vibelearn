#!/usr/bin/env bun
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
 *   vl login <api-key>   Save API key to ~/.vibelearn/config.json
 *   vl login --status    Show auth status
 */

import { createInterface } from 'readline';
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { updateMasteryAfterAttempt, updateDailyStreak } from '../../services/analysis/MasteryTracker.js';

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

  let query = `
    SELECT q.id, q.session_id, q.question_type, q.difficulty,
           q.question, q.options_json, q.correct, q.explanation, q.snippet,
           c.concept_name
    FROM vl_questions q
    LEFT JOIN vl_concepts c ON q.concept_id = c.id
    WHERE q.id NOT IN (SELECT DISTINCT question_id FROM vl_quiz_attempts)
  `;

  if (sessionOnly) {
    // Get the most recent session
    const lastSession = db.query<{ session_id: string }, []>(`
      SELECT session_id FROM vibelearn_session_summaries
      ORDER BY generated_at DESC LIMIT 1
    `).get();

    if (!lastSession) {
      console.log('\nNo sessions found. Run a coding session first!\n');
      db.close();
      return;
    }
    query += ` AND q.session_id = '${lastSession.session_id}'`;
  }

  query += ` ORDER BY q.created_at DESC LIMIT 20`;

  const questions = db.query<{
    id: string;
    session_id: string;
    question_type: string;
    difficulty: string;
    question: string;
    options_json: string | null;
    correct: string;
    explanation: string;
    snippet: string;
    concept_name: string | null;
  }, []>(query).all();

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

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  VibeLearn Quiz — ${questions.length} questions`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const num = `Q${i + 1}/${questions.length}`;
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
    } else {
      // explain_code — free text
      console.log('  (Type your explanation, then press Enter)');
      userAnswer = (await ask('  Your answer: ')).trim();
    }

    const timeTaken = Date.now() - startTime;
    const isCorrect = userAnswer.toLowerCase() === q.correct.toLowerCase();

    if (isCorrect) {
      console.log('\n  ✓ Correct!\n');
      correct++;
    } else {
      console.log(`\n  ✗ Incorrect. Correct answer: ${q.correct}\n`);
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

      // Update per-concept mastery score in vl_developer_profile
      if (q.concept_name) {
        // Resolve the concept's category from vl_concepts
        const conceptRow = writeDb.query<{ category: string }, [string]>(
          `SELECT category FROM vl_concepts WHERE concept_name = ? LIMIT 1`
        ).get(q.concept_name);
        updateMasteryAfterAttempt(writeDb, {
          conceptName: q.concept_name,
          category: conceptRow?.category ?? 'general',
          isCorrect,
        });
      }

      // Update today's row in vl_daily_streaks
      updateDailyStreak(writeDb, isCorrect);
    } catch { /* silently skip attempt recording errors */ }
  }

  rl.close();
  writeDb.close();

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Quiz complete: ${correct}/${total} correct (${pct}%)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
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

    default:
      console.log(`
VibeLearn CLI — learn from your coding sessions

Usage:
  vl quiz              Interactive quiz (all pending questions)
  vl quiz --session    Quiz only the last session's questions
  vl status            Sessions analyzed, concepts by category
  vl gaps              Concepts you haven't mastered yet
  vl login <api-key>   Connect to vibelearn.dev
  vl login --status    Check login status
`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
