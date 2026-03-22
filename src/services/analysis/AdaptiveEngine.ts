/**
 * AdaptiveEngine
 *
 * Implements the POC-validated adaptive quiz logic from belearn notebook 05:
 *
 *   Promotion:  3 consecutive correct answers → advance one level (junior→mid→senior)
 *               Streak resets to 0 after promotion.
 *   Demotion:   Any wrong answer → drop one level (senior→mid→junior).
 *               Level cannot go below junior.
 *
 * Works on top of MasteryTracker — calls updateMasteryAfterAttempt for score/streak
 * bookkeeping, then applies the streak-based level override.
 *
 * Follow-up insertion:
 *   When a junior-difficulty question with a follow_up_mid text is answered correctly,
 *   a synthetic mid-level open_ended question is inserted at the front of the quiz queue.
 *   Conditions (all must hold):
 *     1. question.follow_up_mid is non-empty
 *     2. question.difficulty === 'junior'
 *     3. Follow-up for this question_id not already in the queue
 *     4. Concept is still at junior level after this answer
 */

import type { Database } from 'bun:sqlite';
import { updateMasteryAfterAttempt } from './MasteryTracker.js';
import type { ProfileRow } from './MasteryTracker.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_ORDER = ['junior', 'mid', 'senior'] as const;
type Level = typeof LEVEL_ORDER[number];

/** Number of consecutive correct answers required for promotion */
export const PROMOTE_STREAK_THRESHOLD = 3;

// ─── Pure level helpers ───────────────────────────────────────────────────────

/**
 * Return the next level up; returns 'senior' if already at senior.
 */
export function promoteLevel(current: string): string {
  const idx = LEVEL_ORDER.indexOf(current as Level);
  if (idx === -1 || idx >= LEVEL_ORDER.length - 1) return 'senior';
  return LEVEL_ORDER[idx + 1];
}

/**
 * Return the next level down; returns 'junior' if already at junior.
 */
export function demoteLevel(current: string): string {
  const idx = LEVEL_ORDER.indexOf(current as Level);
  if (idx <= 0) return 'junior';
  return LEVEL_ORDER[idx - 1];
}

// ─── Adaptive result type ─────────────────────────────────────────────────────

export interface AdaptiveResult {
  profile: ProfileRow;
  levelChanged: boolean;
  previousLevel: string;
  promoted: boolean;
  demoted: boolean;
}

// ─── Core adaptive update ─────────────────────────────────────────────────────

/**
 * Apply a quiz attempt result with adaptive level promotion/demotion.
 *
 * 1. Calls updateMasteryAfterAttempt (updates mastery_score, streak_count, correct/incorrect)
 * 2. If correct AND streak >= PROMOTE_STREAK_THRESHOLD → promote level, reset streak
 * 3. If wrong AND level > junior → demote level
 *
 * Returns the final profile row and metadata about the level change.
 */
export function applyAdaptiveUpdate(
  db: Database,
  opts: { conceptName: string; category: string; isCorrect: boolean }
): AdaptiveResult {
  // Capture level BEFORE updateMasteryAfterAttempt so we promote/demote from
  // the level the developer was at, not from the score-recalculated value.
  const existing = db.query<{ current_level: string }, [string]>(
    `SELECT current_level FROM vl_developer_profile WHERE concept_name = ?`
  ).get(opts.conceptName);
  const isFirstAttempt = !existing;
  const previousLevel = existing?.current_level ?? 'junior';

  // Update mastery score, streak, and encounter counters
  const profile = updateMasteryAfterAttempt(db, opts);

  let newLevel = profile.current_level; // score-based value from MasteryTracker
  let promoted = false;
  let demoted = false;

  if (!isFirstAttempt) {
    // For existing concepts, current_level is always driven by the adaptive engine,
    // not by the mastery score. Determine the new adaptive level:
    if (opts.isCorrect && profile.streak_count >= PROMOTE_STREAK_THRESHOLD) {
      // Streak threshold hit → promote from the PRE-attempt level
      const candidate = promoteLevel(previousLevel);
      if (candidate !== previousLevel) {
        newLevel = candidate;
        promoted = true;
        // Override level and reset streak in DB
        db.run(
          `UPDATE vl_developer_profile SET current_level = ?, streak_count = 0 WHERE concept_name = ?`,
          [newLevel, opts.conceptName]
        );
        profile.streak_count = 0;
      } else {
        // Already at top level — restore adaptive level (don't let score override)
        newLevel = previousLevel;
        db.run(`UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?`, [newLevel, opts.conceptName]);
      }
    } else if (!opts.isCorrect) {
      // Any wrong answer → demote from the PRE-attempt level
      const candidate = demoteLevel(previousLevel);
      if (candidate !== previousLevel) {
        newLevel = candidate;
        demoted = true;
        // Override level in DB (streak already reset to 0 by updateMasteryAfterAttempt)
        db.run(
          `UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?`,
          [newLevel, opts.conceptName]
        );
      }
      // If already at junior, restore it (in case score changed it)
      else {
        newLevel = previousLevel;
        db.run(`UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?`, [newLevel, opts.conceptName]);
      }
    } else {
      // Correct answer but streak not yet at threshold — hold current adaptive level
      newLevel = previousLevel;
      db.run(`UPDATE vl_developer_profile SET current_level = ? WHERE concept_name = ?`, [newLevel, opts.conceptName]);
    }
  }

  const finalProfile: ProfileRow = { ...profile, current_level: newLevel };
  return {
    profile: finalProfile,
    // levelChanged is only meaningful for existing concepts
    levelChanged: !isFirstAttempt && newLevel !== previousLevel,
    previousLevel,
    promoted,
    demoted,
  };
}

// ─── Follow-up question logic ─────────────────────────────────────────────────

export interface QuizQueueItem {
  id: string;
  concept_name: string | null;
  question_type: string;
  difficulty: string;
  snippet: string | null;
  question: string;
  options_json: string | null;
  correct: string | null;
  explanation: string;
  follow_up_mid?: string | null;
  ease_factor?: number;
  interval_days?: number;
  repetitions?: number;
  is_follow_up?: boolean;
}

/**
 * Returns true when a follow-up question should be inserted for this question.
 *
 * Conditions (all from POC notebook 05):
 *   1. question.follow_up_mid is non-empty
 *   2. question.difficulty === 'junior'
 *   3. Answer was correct
 *   4. Concept is still at junior level (has not just been promoted)
 *   5. Follow-up for this question ID is not already in the queue
 */
export function shouldInsertFollowUp(
  question: QuizQueueItem,
  isCorrect: boolean,
  conceptCurrentLevel: string,
  queueIds: Set<string>
): boolean {
  if (!question.follow_up_mid || !question.follow_up_mid.trim()) return false;
  if (question.difficulty !== 'junior') return false;
  if (!isCorrect) return false;
  if (conceptCurrentLevel !== 'junior') return false; // already promoted
  const followUpId = `followup_${question.id}`;
  if (queueIds.has(followUpId)) return false;
  return true;
}

/**
 * Create a synthetic follow-up question to insert at the front of the quiz queue.
 * The follow-up is open_ended at mid difficulty.
 */
export function makeFollowUpQuestion(source: QuizQueueItem): QuizQueueItem {
  return {
    id: `followup_${source.id}`,
    concept_name: source.concept_name,
    question_type: 'open_ended',
    difficulty: 'mid',
    snippet: source.snippet ?? null,
    question: source.follow_up_mid ?? '',
    options_json: null,
    correct: null,
    explanation: '(Follow-up — no single correct answer. Reflect on your understanding.)',
    follow_up_mid: null,
    is_follow_up: true,
  };
}
