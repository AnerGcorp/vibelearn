/**
 * SM2Scheduler tests
 *
 * Tests the simplified SM-2 spaced-repetition scheduling logic.
 * All DB tests use an in-memory database with the full migration stack.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';
import { VibeLearnDatabase } from '../../src/services/sqlite/Database.js';
import {
  scheduleNextReview,
  applySchedule,
  getQuestionsDueNow,
  SM2_MIN_EASE,
  SM2_EASE_CORRECT_DELTA,
  SM2_EASE_WRONG_DELTA,
} from '../../src/services/analysis/SM2Scheduler.js';

// ─── scheduleNextReview (pure logic) ─────────────────────────────────────────

describe('scheduleNextReview', () => {
  const BASE_NOW = 1_000_000; // deterministic epoch

  it('first correct answer: interval = 1 day', () => {
    const result = scheduleNextReview({
      isCorrect: true,
      currentEaseFactor: 2.5,
      currentIntervalDays: 0,
      currentRepetitions: 0,
      nowEpoch: BASE_NOW,
    });

    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.nextReviewAt).toBe(BASE_NOW + 86_400);
    expect(result.easeFactor).toBeCloseTo(2.5 + SM2_EASE_CORRECT_DELTA, 5);
  });

  it('second correct answer: interval = 6 days', () => {
    const result = scheduleNextReview({
      isCorrect: true,
      currentEaseFactor: 2.5,
      currentIntervalDays: 1,
      currentRepetitions: 1,
      nowEpoch: BASE_NOW,
    });

    expect(result.intervalDays).toBe(6);
    expect(result.repetitions).toBe(2);
    expect(result.nextReviewAt).toBe(BASE_NOW + 6 * 86_400);
  });

  it('third+ correct answer: interval = prev * ease_factor (rounded)', () => {
    const result = scheduleNextReview({
      isCorrect: true,
      currentEaseFactor: 2.5,
      currentIntervalDays: 6,
      currentRepetitions: 2,
      nowEpoch: BASE_NOW,
    });

    expect(result.intervalDays).toBe(Math.round(6 * 2.5));
    expect(result.repetitions).toBe(3);
  });

  it('wrong answer: resets interval to 1 day and repetitions to 0', () => {
    const result = scheduleNextReview({
      isCorrect: false,
      currentEaseFactor: 2.5,
      currentIntervalDays: 15,
      currentRepetitions: 3,
      nowEpoch: BASE_NOW,
    });

    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(0);
    expect(result.nextReviewAt).toBe(BASE_NOW + 86_400);
  });

  it('wrong answer: ease_factor decreases by SM2_EASE_WRONG_DELTA', () => {
    const result = scheduleNextReview({
      isCorrect: false,
      currentEaseFactor: 2.5,
      currentIntervalDays: 10,
      currentRepetitions: 2,
      nowEpoch: BASE_NOW,
    });

    expect(result.easeFactor).toBeCloseTo(2.5 - SM2_EASE_WRONG_DELTA, 5);
  });

  it('ease_factor never drops below SM2_MIN_EASE', () => {
    // Start near floor and apply several wrong answers
    let ef = SM2_MIN_EASE + 0.01;
    let result = scheduleNextReview({
      isCorrect: false,
      currentEaseFactor: ef,
      currentIntervalDays: 1,
      currentRepetitions: 0,
      nowEpoch: BASE_NOW,
    });

    expect(result.easeFactor).toBeGreaterThanOrEqual(SM2_MIN_EASE);
  });

  it('ease_factor correct answer increases it', () => {
    const before = 2.0;
    const result = scheduleNextReview({
      isCorrect: true,
      currentEaseFactor: before,
      currentIntervalDays: 6,
      currentRepetitions: 2,
      nowEpoch: BASE_NOW,
    });

    expect(result.easeFactor).toBeGreaterThan(before);
  });
});

// ─── applySchedule (DB write) ─────────────────────────────────────────────────

describe('applySchedule', () => {
  let db: Database;

  function insertQuestion(id: string): void {
    db.run(
      `INSERT INTO vl_questions
         (id, session_id, concept_id, question_type, question, correct, created_at)
       VALUES (?, 'sess-1', 'c-1', 'multiple_choice', 'Q?', 'A', unixepoch())`,
      [id]
    );
  }

  beforeEach(() => {
    db = new VibeLearnDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('writes next_review_at, ease_factor, interval_days, repetitions to DB', () => {
    const qid = randomUUID();
    insertQuestion(qid);

    applySchedule(db, qid, {
      nextReviewAt: 9_999_999,
      easeFactor: 2.6,
      intervalDays: 6,
      repetitions: 2,
    });

    const row = db.query<{
      next_review_at: number;
      ease_factor: number;
      interval_days: number;
      repetitions: number;
    }, [string]>(
      `SELECT next_review_at, ease_factor, interval_days, repetitions
       FROM vl_questions WHERE id = ?`
    ).get(qid);

    expect(row).not.toBeNull();
    expect(row!.next_review_at).toBe(9_999_999);
    expect(row!.ease_factor).toBeCloseTo(2.6, 5);
    expect(row!.interval_days).toBe(6);
    expect(row!.repetitions).toBe(2);
  });
});

// ─── getQuestionsDueNow ───────────────────────────────────────────────────────

describe('getQuestionsDueNow', () => {
  let db: Database;

  function insertQuestion(id: string, nextReviewAt: number | null): void {
    db.run(
      `INSERT INTO vl_questions
         (id, session_id, concept_id, question_type, question, correct, next_review_at, created_at)
       VALUES (?, 'sess-1', 'c-1', 'multiple_choice', 'Q?', 'A', ?, unixepoch())`,
      [id, nextReviewAt]
    );
  }

  beforeEach(() => {
    db = new VibeLearnDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('returns questions with next_review_at = NULL (never reviewed)', () => {
    const id = randomUUID();
    insertQuestion(id, null);

    const due = getQuestionsDueNow(db, Math.floor(Date.now() / 1000));
    expect(due.map(q => q.id)).toContain(id);
  });

  it('returns questions whose next_review_at is in the past', () => {
    const id = randomUUID();
    insertQuestion(id, 1); // epoch 1 = long past

    const due = getQuestionsDueNow(db, Math.floor(Date.now() / 1000));
    expect(due.map(q => q.id)).toContain(id);
  });

  it('does NOT return questions whose next_review_at is in the future', () => {
    const id = randomUUID();
    insertQuestion(id, Math.floor(Date.now() / 1000) + 86_400 * 7); // 7 days from now

    const due = getQuestionsDueNow(db, Math.floor(Date.now() / 1000));
    expect(due.map(q => q.id)).not.toContain(id);
  });

  it('returns only due questions when the set is mixed', () => {
    const past = randomUUID();
    const future = randomUUID();
    const never = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    insertQuestion(past, now - 100);
    insertQuestion(future, now + 86_400);
    insertQuestion(never, null);

    const due = getQuestionsDueNow(db, now);
    const ids = due.map(q => q.id);

    expect(ids).toContain(past);
    expect(ids).toContain(never);
    expect(ids).not.toContain(future);
  });

  it('respects the session filter', () => {
    const inSession = randomUUID();
    const otherSession = randomUUID();

    db.run(
      `INSERT INTO vl_questions
         (id, session_id, concept_id, question_type, question, correct, next_review_at, created_at)
       VALUES (?, 'sess-target', 'c-1', 'multiple_choice', 'Q?', 'A', NULL, unixepoch())`,
      [inSession]
    );
    db.run(
      `INSERT INTO vl_questions
         (id, session_id, concept_id, question_type, question, correct, next_review_at, created_at)
       VALUES (?, 'sess-other', 'c-1', 'multiple_choice', 'Q?', 'A', NULL, unixepoch())`,
      [otherSession]
    );

    const due = getQuestionsDueNow(db, Math.floor(Date.now() / 1000), 'sess-target');
    const ids = due.map(q => q.id);

    expect(ids).toContain(inSession);
    expect(ids).not.toContain(otherSession);
  });
});
