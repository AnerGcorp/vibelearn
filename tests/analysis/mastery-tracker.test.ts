/**
 * MasteryTracker tests
 *
 * Tests the core mastery-score update logic that runs after each quiz attempt.
 * All tests use an in-memory database with the full migration stack.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { VibeLearnDatabase } from '../../src/services/sqlite/Database.js';
import {
  calculateMasteryScore,
  levelFromScore,
  updateMasteryAfterAttempt,
  updateDailyStreak,
} from '../../src/services/analysis/MasteryTracker.js';

// ─── calculateMasteryScore ────────────────────────────────────────────────────

describe('calculateMasteryScore', () => {
  it('returns 0 when no attempts exist', () => {
    expect(calculateMasteryScore(0, 0)).toBe(0);
  });

  it('returns 1 when all answers are correct', () => {
    expect(calculateMasteryScore(10, 0)).toBe(1);
  });

  it('returns 0 when all answers are incorrect', () => {
    expect(calculateMasteryScore(0, 5)).toBe(0);
  });

  it('returns 0.5 for equal correct and incorrect', () => {
    expect(calculateMasteryScore(5, 5)).toBe(0.5);
  });

  it('returns 0.75 for 3 correct, 1 incorrect', () => {
    expect(calculateMasteryScore(3, 1)).toBeCloseTo(0.75, 5);
  });
});

// ─── levelFromScore ───────────────────────────────────────────────────────────

describe('levelFromScore', () => {
  it('returns junior for score below 0.5', () => {
    expect(levelFromScore(0)).toBe('junior');
    expect(levelFromScore(0.49)).toBe('junior');
  });

  it('returns mid for score between 0.5 and 0.84', () => {
    expect(levelFromScore(0.5)).toBe('mid');
    expect(levelFromScore(0.7)).toBe('mid');
    expect(levelFromScore(0.84)).toBe('mid');
  });

  it('returns senior for score 0.85 and above', () => {
    expect(levelFromScore(0.85)).toBe('senior');
    expect(levelFromScore(1.0)).toBe('senior');
  });
});

// ─── updateMasteryAfterAttempt ────────────────────────────────────────────────

describe('updateMasteryAfterAttempt', () => {
  let db: Database;

  beforeEach(() => {
    db = new VibeLearnDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('creates a new profile row on first correct attempt', () => {
    const result = updateMasteryAfterAttempt(db, {
      conceptName: 'React Hooks',
      category: 'react',
      isCorrect: true,
    });

    expect(result.concept_name).toBe('React Hooks');
    expect(result.category).toBe('react');
    expect(result.correct_answers).toBe(1);
    expect(result.incorrect_answers).toBe(0);
    expect(result.encounter_count).toBe(1);
    expect(result.mastery_score).toBe(1);
    expect(result.streak_count).toBe(1);
    expect(result.current_level).toBe('senior');
  });

  it('creates a new profile row on first incorrect attempt', () => {
    const result = updateMasteryAfterAttempt(db, {
      conceptName: 'JWT Refresh Tokens',
      category: 'auth',
      isCorrect: false,
    });

    expect(result.correct_answers).toBe(0);
    expect(result.incorrect_answers).toBe(1);
    expect(result.mastery_score).toBe(0);
    expect(result.streak_count).toBe(0);
    expect(result.current_level).toBe('junior');
  });

  it('persists the profile row to the database', () => {
    updateMasteryAfterAttempt(db, {
      conceptName: 'TypeScript Generics',
      category: 'typescript',
      isCorrect: true,
    });

    const row = db.query<{ mastery_score: number }, [string]>(
      `SELECT mastery_score FROM vl_developer_profile WHERE concept_name = ?`
    ).get('TypeScript Generics');

    expect(row).not.toBeNull();
    expect(row!.mastery_score).toBe(1);
  });

  it('updates counters on a second attempt for the same concept', () => {
    updateMasteryAfterAttempt(db, {
      conceptName: 'Singleton Pattern',
      category: 'design-pattern',
      isCorrect: true,
    });

    const result = updateMasteryAfterAttempt(db, {
      conceptName: 'Singleton Pattern',
      category: 'design-pattern',
      isCorrect: false,
    });

    expect(result.correct_answers).toBe(1);
    expect(result.incorrect_answers).toBe(1);
    expect(result.encounter_count).toBe(2);
    expect(result.mastery_score).toBeCloseTo(0.5, 5);
    expect(result.streak_count).toBe(0); // reset on wrong answer
  });

  it('increments streak on consecutive correct answers', () => {
    updateMasteryAfterAttempt(db, { conceptName: 'SQL Joins', category: 'database', isCorrect: true });
    updateMasteryAfterAttempt(db, { conceptName: 'SQL Joins', category: 'database', isCorrect: true });
    const result = updateMasteryAfterAttempt(db, {
      conceptName: 'SQL Joins',
      category: 'database',
      isCorrect: true,
    });

    expect(result.streak_count).toBe(3);
  });

  it('resets streak to 0 after an incorrect answer', () => {
    updateMasteryAfterAttempt(db, { conceptName: 'SQL Joins', category: 'database', isCorrect: true });
    updateMasteryAfterAttempt(db, { conceptName: 'SQL Joins', category: 'database', isCorrect: true });
    const result = updateMasteryAfterAttempt(db, {
      conceptName: 'SQL Joins',
      category: 'database',
      isCorrect: false,
    });

    expect(result.streak_count).toBe(0);
  });

  it('transitions level as mastery improves', () => {
    // 3 incorrect → junior
    for (let i = 0; i < 3; i++) {
      updateMasteryAfterAttempt(db, { conceptName: 'Async/Await', category: 'nodejs', isCorrect: false });
    }
    let row = db.query<{ current_level: string }, [string]>(
      `SELECT current_level FROM vl_developer_profile WHERE concept_name = ?`
    ).get('Async/Await');
    expect(row!.current_level).toBe('junior');

    // Enough correct to reach mid (4 correct, 3 wrong = 0.57)
    for (let i = 0; i < 4; i++) {
      updateMasteryAfterAttempt(db, { conceptName: 'Async/Await', category: 'nodejs', isCorrect: true });
    }
    row = db.query<{ current_level: string }, [string]>(
      `SELECT current_level FROM vl_developer_profile WHERE concept_name = ?`
    ).get('Async/Await');
    expect(row!.current_level).toBe('mid');
  });

  it('handles multiple independent concepts without interference', () => {
    updateMasteryAfterAttempt(db, { conceptName: 'Concept A', category: 'react', isCorrect: true });
    updateMasteryAfterAttempt(db, { conceptName: 'Concept B', category: 'nodejs', isCorrect: false });

    const profileA = db.query<{ mastery_score: number }, [string]>(
      `SELECT mastery_score FROM vl_developer_profile WHERE concept_name = ?`
    ).get('Concept A');

    const profileB = db.query<{ mastery_score: number }, [string]>(
      `SELECT mastery_score FROM vl_developer_profile WHERE concept_name = ?`
    ).get('Concept B');

    expect(profileA!.mastery_score).toBe(1);
    expect(profileB!.mastery_score).toBe(0);
  });
});

// ─── updateDailyStreak ────────────────────────────────────────────────────────

describe('updateDailyStreak', () => {
  let db: Database;

  beforeEach(() => {
    db = new VibeLearnDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('creates a row for today on first call', () => {
    updateDailyStreak(db, true);

    const today = new Date().toISOString().slice(0, 10);
    const row = db.query<{ questions_answered: number; correct_answers: number }, [string]>(
      `SELECT questions_answered, correct_answers FROM vl_daily_streaks WHERE date = ?`
    ).get(today);

    expect(row).not.toBeNull();
    expect(row!.questions_answered).toBe(1);
    expect(row!.correct_answers).toBe(1);
  });

  it('increments question count but not correct count on wrong answer', () => {
    updateDailyStreak(db, false);

    const today = new Date().toISOString().slice(0, 10);
    const row = db.query<{ questions_answered: number; correct_answers: number }, [string]>(
      `SELECT questions_answered, correct_answers FROM vl_daily_streaks WHERE date = ?`
    ).get(today);

    expect(row!.questions_answered).toBe(1);
    expect(row!.correct_answers).toBe(0);
  });

  it('accumulates multiple answers across the day', () => {
    updateDailyStreak(db, true);
    updateDailyStreak(db, false);
    updateDailyStreak(db, true);

    const today = new Date().toISOString().slice(0, 10);
    const row = db.query<{ questions_answered: number; correct_answers: number }, [string]>(
      `SELECT questions_answered, correct_answers FROM vl_daily_streaks WHERE date = ?`
    ).get(today);

    expect(row!.questions_answered).toBe(3);
    expect(row!.correct_answers).toBe(2);
  });
});
