/**
 * MasteryTracker
 *
 * Updates vl_developer_profile and vl_daily_streaks after each quiz attempt.
 * Called by `vl quiz` immediately after the developer answers a question.
 *
 * Mastery score formula: correct / (correct + incorrect)
 * This is intentionally simple — the server recalculates from accepted attempts.
 * The local score drives vl gaps display only.
 */

import type { Database } from 'bun:sqlite';

export interface ProfileUpdate {
  conceptName: string;
  category: string;
  isCorrect: boolean;
}

export interface ProfileRow {
  concept_name: string;
  category: string;
  first_seen_at: number;
  last_seen_at: number;
  encounter_count: number;
  correct_answers: number;
  incorrect_answers: number;
  current_level: string;
  streak_count: number;
  mastery_score: number;
}

/**
 * Calculate mastery score from raw attempt counts.
 * Returns a value in [0, 1]. Returns 0 when no attempts exist.
 */
export function calculateMasteryScore(correctAnswers: number, incorrectAnswers: number): number {
  const total = correctAnswers + incorrectAnswers;
  if (total === 0) return 0;
  return correctAnswers / total;
}

/**
 * Map a mastery score to a human-readable level.
 */
export function levelFromScore(score: number): string {
  if (score >= 0.85) return 'senior';
  if (score >= 0.5) return 'mid';
  return 'junior';
}

/**
 * Upsert a developer profile entry after a quiz attempt.
 * Creates the row if it doesn't exist; updates counters and derived fields if it does.
 * Returns the updated (or freshly created) profile row.
 */
export function updateMasteryAfterAttempt(db: Database, update: ProfileUpdate): ProfileRow {
  const now = Math.floor(Date.now() / 1000);

  const existing = db.query<ProfileRow, [string]>(
    `SELECT * FROM vl_developer_profile WHERE concept_name = ?`
  ).get(update.conceptName);

  if (!existing) {
    const correctAnswers = update.isCorrect ? 1 : 0;
    const incorrectAnswers = update.isCorrect ? 0 : 1;
    const masteryScore = calculateMasteryScore(correctAnswers, incorrectAnswers);
    const streakCount = update.isCorrect ? 1 : 0;
    const level = levelFromScore(masteryScore);

    db.run(
      `INSERT INTO vl_developer_profile
        (concept_name, category, first_seen_at, last_seen_at, encounter_count,
         correct_answers, incorrect_answers, current_level, streak_count, mastery_score)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      [
        update.conceptName, update.category, now, now,
        correctAnswers, incorrectAnswers, level, streakCount, masteryScore,
      ]
    );

    return {
      concept_name: update.conceptName,
      category: update.category,
      first_seen_at: now,
      last_seen_at: now,
      encounter_count: 1,
      correct_answers: correctAnswers,
      incorrect_answers: incorrectAnswers,
      current_level: level,
      streak_count: streakCount,
      mastery_score: masteryScore,
    };
  }

  // Existing row — update all derived fields
  const correctAnswers = existing.correct_answers + (update.isCorrect ? 1 : 0);
  const incorrectAnswers = existing.incorrect_answers + (update.isCorrect ? 0 : 1);
  const masteryScore = calculateMasteryScore(correctAnswers, incorrectAnswers);
  const streakCount = update.isCorrect ? existing.streak_count + 1 : 0;
  const level = levelFromScore(masteryScore);

  db.run(
    `UPDATE vl_developer_profile SET
       last_seen_at       = ?,
       encounter_count    = encounter_count + 1,
       correct_answers    = ?,
       incorrect_answers  = ?,
       current_level      = ?,
       streak_count       = ?,
       mastery_score      = ?
     WHERE concept_name = ?`,
    [now, correctAnswers, incorrectAnswers, level, streakCount, masteryScore, update.conceptName]
  );

  return {
    ...existing,
    last_seen_at: now,
    encounter_count: existing.encounter_count + 1,
    correct_answers: correctAnswers,
    incorrect_answers: incorrectAnswers,
    current_level: level,
    streak_count: streakCount,
    mastery_score: masteryScore,
  };
}

/**
 * Upsert today's row in vl_daily_streaks.
 * Increments questions_answered; increments correct_answers only when correct.
 * The server is authoritative for streak computation — this is a display cache.
 */
export function updateDailyStreak(db: Database, isCorrect: boolean): void {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const existing = db.query<{ questions_answered: number; correct_answers: number }, [string]>(
    `SELECT questions_answered, correct_answers FROM vl_daily_streaks WHERE date = ?`
  ).get(today);

  if (!existing) {
    db.run(
      `INSERT INTO vl_daily_streaks (date, questions_answered, correct_answers, streak_continues)
       VALUES (?, 1, ?, 1)`,
      [today, isCorrect ? 1 : 0]
    );
  } else {
    db.run(
      `UPDATE vl_daily_streaks SET
         questions_answered = questions_answered + 1,
         correct_answers    = correct_answers + ?
       WHERE date = ?`,
      [isCorrect ? 1 : 0, today]
    );
  }
}
