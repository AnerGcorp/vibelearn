/**
 * AdaptiveEngine tests
 *
 * Tests the POC-validated adaptive quiz engine:
 * - promoteLevel / demoteLevel pure helpers
 * - applyAdaptiveUpdate: promotion on 3-streak, demotion on wrong, DB writes
 * - shouldInsertFollowUp: all 5 conditions
 * - makeFollowUpQuestion: output shape
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { VibeLearnDatabase } from '../../src/services/sqlite/Database.js';
import {
  promoteLevel,
  demoteLevel,
  applyAdaptiveUpdate,
  shouldInsertFollowUp,
  makeFollowUpQuestion,
  PROMOTE_STREAK_THRESHOLD,
} from '../../src/services/analysis/AdaptiveEngine.js';
import type { QuizQueueItem } from '../../src/services/analysis/AdaptiveEngine.js';

// ─── promoteLevel ─────────────────────────────────────────────────────────────

describe('promoteLevel', () => {
  it('promotes junior → mid', () => expect(promoteLevel('junior')).toBe('mid'));
  it('promotes mid → senior', () => expect(promoteLevel('mid')).toBe('senior'));
  it('stays senior at senior', () => expect(promoteLevel('senior')).toBe('senior'));
  it('handles unknown level by returning senior', () => expect(promoteLevel('unknown')).toBe('senior'));
});

// ─── demoteLevel ──────────────────────────────────────────────────────────────

describe('demoteLevel', () => {
  it('demotes senior → mid', () => expect(demoteLevel('senior')).toBe('mid'));
  it('demotes mid → junior', () => expect(demoteLevel('mid')).toBe('junior'));
  it('stays junior at junior', () => expect(demoteLevel('junior')).toBe('junior'));
  it('handles unknown level by returning junior', () => expect(demoteLevel('unknown')).toBe('junior'));
});

// ─── PROMOTE_STREAK_THRESHOLD ─────────────────────────────────────────────────

describe('PROMOTE_STREAK_THRESHOLD', () => {
  it('is exactly 3 (matches POC spec)', () => expect(PROMOTE_STREAK_THRESHOLD).toBe(3));
});

// ─── applyAdaptiveUpdate ──────────────────────────────────────────────────────

describe('applyAdaptiveUpdate', () => {
  let db: Database;

  beforeEach(() => {
    db = new VibeLearnDatabase(':memory:').db;
  });

  afterEach(() => {
    db.close();
  });

  it('creates profile on first attempt', () => {
    const result = applyAdaptiveUpdate(db, { conceptName: 'Async/Await', category: 'async_pattern', isCorrect: true });
    expect(result.profile.concept_name).toBe('Async/Await');
    expect(result.levelChanged).toBe(false);
    expect(result.promoted).toBe(false);
  });

  it('does not promote on first correct answer (streak = 1)', () => {
    const result = applyAdaptiveUpdate(db, { conceptName: 'Closures', category: 'functional_pattern', isCorrect: true });
    expect(result.promoted).toBe(false);
    expect(result.profile.current_level).toBe('senior'); // score-based: 1/1 = 1.0 → senior
  });

  it('promotes from junior when streak reaches 3 consecutive correct answers', () => {
    // Seed a junior-level profile by inserting directly
    const now = Math.floor(Date.now() / 1000);
    db.run(
      `INSERT INTO vl_developer_profile
        (concept_name, category, first_seen_at, last_seen_at, encounter_count,
         correct_answers, incorrect_answers, current_level, streak_count, mastery_score)
       VALUES (?, ?, ?, ?, 2, 1, 1, 'junior', 2, 0.5)`,
      ['SQL Joins', 'database_pattern', now, now]
    );

    // Third correct answer → streak becomes 3 → promote
    const result = applyAdaptiveUpdate(db, { conceptName: 'SQL Joins', category: 'database_pattern', isCorrect: true });

    expect(result.promoted).toBe(true);
    expect(result.previousLevel).toBe('junior');
    expect(result.profile.current_level).toBe('mid');
    expect(result.profile.streak_count).toBe(0); // reset after promotion
    expect(result.levelChanged).toBe(true);

    // Verify DB was updated
    const row = db.query<{ current_level: string; streak_count: number }, [string]>(
      `SELECT current_level, streak_count FROM vl_developer_profile WHERE concept_name = ?`
    ).get('SQL Joins');
    expect(row!.current_level).toBe('mid');
    expect(row!.streak_count).toBe(0);
  });

  it('promotes from mid to senior after 3 more consecutive correct', () => {
    const now = Math.floor(Date.now() / 1000);
    db.run(
      `INSERT INTO vl_developer_profile
        (concept_name, category, first_seen_at, last_seen_at, encounter_count,
         correct_answers, incorrect_answers, current_level, streak_count, mastery_score)
       VALUES (?, ?, ?, ?, 5, 4, 1, 'mid', 2, 0.8)`,
      ['Singleton', 'design_pattern', now, now]
    );

    const result = applyAdaptiveUpdate(db, { conceptName: 'Singleton', category: 'design_pattern', isCorrect: true });

    expect(result.promoted).toBe(true);
    expect(result.previousLevel).toBe('mid');
    expect(result.profile.current_level).toBe('senior');
  });

  it('does not promote senior beyond senior', () => {
    const now = Math.floor(Date.now() / 1000);
    db.run(
      `INSERT INTO vl_developer_profile
        (concept_name, category, first_seen_at, last_seen_at, encounter_count,
         correct_answers, incorrect_answers, current_level, streak_count, mastery_score)
       VALUES (?, ?, ?, ?, 5, 4, 1, 'senior', 2, 0.9)`,
      ['React Hooks', 'react_pattern', now, now]
    );

    const result = applyAdaptiveUpdate(db, { conceptName: 'React Hooks', category: 'react_pattern', isCorrect: true });

    expect(result.promoted).toBe(false);
    expect(result.profile.current_level).toBe('senior');
    expect(result.levelChanged).toBe(false);
  });

  it('demotes from mid to junior on wrong answer', () => {
    const now = Math.floor(Date.now() / 1000);
    db.run(
      `INSERT INTO vl_developer_profile
        (concept_name, category, first_seen_at, last_seen_at, encounter_count,
         correct_answers, incorrect_answers, current_level, streak_count, mastery_score)
       VALUES (?, ?, ?, ?, 3, 2, 0, 'mid', 2, 0.8)`,
      ['GraphQL', 'api_design', now, now]
    );

    const result = applyAdaptiveUpdate(db, { conceptName: 'GraphQL', category: 'api_design', isCorrect: false });

    expect(result.demoted).toBe(true);
    expect(result.previousLevel).toBe('mid');
    expect(result.profile.current_level).toBe('junior');
    expect(result.levelChanged).toBe(true);

    const row = db.query<{ current_level: string }, [string]>(
      `SELECT current_level FROM vl_developer_profile WHERE concept_name = ?`
    ).get('GraphQL');
    expect(row!.current_level).toBe('junior');
  });

  it('demotes from senior to mid on wrong answer', () => {
    const now = Math.floor(Date.now() / 1000);
    db.run(
      `INSERT INTO vl_developer_profile
        (concept_name, category, first_seen_at, last_seen_at, encounter_count,
         correct_answers, incorrect_answers, current_level, streak_count, mastery_score)
       VALUES (?, ?, ?, ?, 5, 5, 0, 'senior', 3, 1.0)`,
      ['CQRS', 'architecture_pattern', now, now]
    );

    const result = applyAdaptiveUpdate(db, { conceptName: 'CQRS', category: 'architecture_pattern', isCorrect: false });

    expect(result.demoted).toBe(true);
    expect(result.profile.current_level).toBe('mid');
  });

  it('does not demote junior below junior', () => {
    const now = Math.floor(Date.now() / 1000);
    db.run(
      `INSERT INTO vl_developer_profile
        (concept_name, category, first_seen_at, last_seen_at, encounter_count,
         correct_answers, incorrect_answers, current_level, streak_count, mastery_score)
       VALUES (?, ?, ?, ?, 1, 0, 0, 'junior', 0, 0.0)`,
      ['Recursion', 'design_pattern', now, now]
    );

    const result = applyAdaptiveUpdate(db, { conceptName: 'Recursion', category: 'design_pattern', isCorrect: false });

    expect(result.demoted).toBe(false);
    expect(result.profile.current_level).toBe('junior');
    expect(result.levelChanged).toBe(false);
  });
});

// ─── shouldInsertFollowUp ─────────────────────────────────────────────────────

function makeQuestion(overrides: Partial<QuizQueueItem> = {}): QuizQueueItem {
  return {
    id: 'q-1',
    concept_name: 'async/await',
    question_type: 'true_false',
    difficulty: 'junior',
    snippet: 'try { await fetch() } catch(e) {}',
    question: 'Is this error handling correct?',
    options_json: null,
    correct: 'false',
    explanation: 'Errors are silently swallowed.',
    follow_up_mid: 'How would you improve this error handler?',
    ...overrides,
  };
}

describe('shouldInsertFollowUp', () => {
  it('returns true when all conditions are met', () => {
    expect(shouldInsertFollowUp(makeQuestion(), true, 'junior', new Set())).toBe(true);
  });

  it('returns false when follow_up_mid is empty', () => {
    expect(shouldInsertFollowUp(makeQuestion({ follow_up_mid: '' }), true, 'junior', new Set())).toBe(false);
  });

  it('returns false when follow_up_mid is null', () => {
    expect(shouldInsertFollowUp(makeQuestion({ follow_up_mid: null }), true, 'junior', new Set())).toBe(false);
  });

  it('returns false when difficulty is not junior', () => {
    expect(shouldInsertFollowUp(makeQuestion({ difficulty: 'mid' }), true, 'junior', new Set())).toBe(false);
  });

  it('returns false when answer is incorrect', () => {
    expect(shouldInsertFollowUp(makeQuestion(), false, 'junior', new Set())).toBe(false);
  });

  it('returns false when concept has already been promoted (not junior anymore)', () => {
    expect(shouldInsertFollowUp(makeQuestion(), true, 'mid', new Set())).toBe(false);
  });

  it('returns false when follow-up for this question is already in queue', () => {
    expect(shouldInsertFollowUp(makeQuestion(), true, 'junior', new Set(['followup_q-1']))).toBe(false);
  });
});

// ─── makeFollowUpQuestion ─────────────────────────────────────────────────────

describe('makeFollowUpQuestion', () => {
  it('creates an open_ended mid-difficulty question from source', () => {
    const source = makeQuestion();
    const fq = makeFollowUpQuestion(source);

    expect(fq.id).toBe('followup_q-1');
    expect(fq.question_type).toBe('open_ended');
    expect(fq.difficulty).toBe('mid');
    expect(fq.question).toBe('How would you improve this error handler?');
    expect(fq.concept_name).toBe('async/await');
    expect(fq.snippet).toBe(source.snippet);
    expect(fq.correct).toBeNull();
    expect(fq.is_follow_up).toBe(true);
  });

  it('preserves snippet from source', () => {
    const source = makeQuestion({ snippet: 'const x = await db.query()' });
    const fq = makeFollowUpQuestion(source);
    expect(fq.snippet).toBe('const x = await db.query()');
  });
});
