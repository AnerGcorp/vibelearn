/**
 * SM2Scheduler
 *
 * Simplified SM-2 spaced-repetition algorithm for quiz question scheduling.
 *
 * Rules:
 *   - First correct answer  → next review in 1 day
 *   - Second correct answer → next review in 6 days
 *   - Subsequent correct   → next review in round(prev_interval × ease_factor) days
 *   - Any wrong answer     → resets interval to 1 day, repetitions to 0
 *   - ease_factor increases by EASE_CORRECT_DELTA on correct, decreases by
 *     EASE_WRONG_DELTA on wrong — never below SM2_MIN_EASE
 *
 * The quiz filter changes from "never attempted" to
 * "next_review_at IS NULL OR next_review_at <= now" so questions resurface
 * after the scheduled interval.
 */

import type { Database } from 'bun:sqlite';

export const SM2_MIN_EASE = 1.3;
export const SM2_EASE_CORRECT_DELTA = 0.1;
export const SM2_EASE_WRONG_DELTA = 0.2;

const SECONDS_PER_DAY = 86_400;

// ─── Pure scheduling logic ────────────────────────────────────────────────────

export interface ScheduleInput {
  isCorrect: boolean;
  currentEaseFactor: number;
  currentIntervalDays: number;
  currentRepetitions: number;
  nowEpoch: number;
}

export interface ScheduleResult {
  nextReviewAt: number;  // Unix epoch seconds
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

/**
 * Calculate the next review schedule for a question given the current state.
 * Pure function — no DB access.
 */
export function scheduleNextReview(input: ScheduleInput): ScheduleResult {
  const { isCorrect, currentEaseFactor, currentIntervalDays, currentRepetitions, nowEpoch } = input;

  if (!isCorrect) {
    const newEase = Math.max(SM2_MIN_EASE, currentEaseFactor - SM2_EASE_WRONG_DELTA);
    return {
      nextReviewAt: nowEpoch + SECONDS_PER_DAY,
      easeFactor: newEase,
      intervalDays: 1,
      repetitions: 0,
    };
  }

  // Correct answer path
  const newEase = currentEaseFactor + SM2_EASE_CORRECT_DELTA;
  const newRepetitions = currentRepetitions + 1;

  let newInterval: number;
  if (newRepetitions === 1) {
    newInterval = 1;
  } else if (newRepetitions === 2) {
    newInterval = 6;
  } else {
    newInterval = Math.round(currentIntervalDays * currentEaseFactor);
  }

  return {
    nextReviewAt: nowEpoch + newInterval * SECONDS_PER_DAY,
    easeFactor: newEase,
    intervalDays: newInterval,
    repetitions: newRepetitions,
  };
}

// ─── DB write ─────────────────────────────────────────────────────────────────

export interface ScheduleUpdate {
  nextReviewAt: number;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

/**
 * Persist a schedule update for a question in vl_questions.
 */
export function applySchedule(db: Database, questionId: string, update: ScheduleUpdate): void {
  db.run(
    `UPDATE vl_questions
     SET next_review_at = ?,
         ease_factor    = ?,
         interval_days  = ?,
         repetitions    = ?
     WHERE id = ?`,
    [update.nextReviewAt, update.easeFactor, update.intervalDays, update.repetitions, questionId]
  );
}

// ─── Quiz filter ──────────────────────────────────────────────────────────────

export interface QuestionRow {
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
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  follow_up_mid?: string | null;
}

/**
 * Return questions that are due for review now (or have never been reviewed).
 * Replaces the old "WHERE id NOT IN (SELECT DISTINCT question_id FROM vl_quiz_attempts)" filter.
 *
 * @param db       Read-only or read-write database handle
 * @param nowEpoch Current Unix epoch in seconds
 * @param sessionId Optional — restrict to a single session's questions
 * @param limit    Max number of questions to return (default 20)
 */
export function getQuestionsDueNow(
  db: Database,
  nowEpoch: number,
  sessionId?: string,
  limit = 20
): QuestionRow[] {
  const sessionFilter = sessionId ? `AND q.session_id = ?` : '';
  const params: (string | number)[] = sessionId
    ? [nowEpoch, sessionId, limit]
    : [nowEpoch, limit];

  return db.query<QuestionRow, (string | number)[]>(`
    SELECT q.id, q.session_id, q.question_type, q.difficulty,
           q.question, q.options_json, q.correct, q.explanation, q.snippet,
           q.ease_factor, q.interval_days, q.repetitions, q.follow_up_mid,
           c.concept_name
    FROM vl_questions q
    LEFT JOIN vl_concepts c ON q.concept_id = c.id
    WHERE (q.next_review_at IS NULL OR q.next_review_at <= ?)
    ${sessionFilter}
    ORDER BY q.next_review_at ASC NULLS FIRST, q.created_at DESC
    LIMIT ?
  `).all(...params);
}
