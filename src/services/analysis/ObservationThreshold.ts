/**
 * ObservationThreshold
 *
 * Guards the analysis pipeline against sessions with too little signal.
 * A session must have at least MIN_OBSERVATIONS_FOR_ANALYSIS write-type
 * observations (file_write or file_edit) before concept extraction and
 * quiz generation are worth running.
 *
 * Read-only observations (file_read, bash_command, etc.) are not counted
 * because they don't indicate that the developer built anything meaningful.
 */

import type { Database } from 'bun:sqlite';

/**
 * Minimum number of file-write observations required before the
 * analysis pipeline will run for a session.
 */
export const MIN_OBSERVATIONS_FOR_ANALYSIS = 2;

/**
 * Count write-type observations for the given memory session.
 * Uses the actual types the SDK memory agent stores (from plugin/modes/code.json):
 *   bugfix, feature, refactor, change — developer actively changed code
 *   discovery, decision — read-only / thinking, excluded
 */
export function countWriteObservations(db: Database, memorySessionId: string): number {
  const row = db.query<{ count: number }, [string, string, string, string, string]>(`
    SELECT COUNT(*) as count
    FROM observations
    WHERE memory_session_id = ?
      AND type IN (?, ?, ?, ?)
  `).get(memorySessionId, 'bugfix', 'feature', 'refactor', 'change');

  return row?.count ?? 0;
}

/**
 * Return true if the session has enough write observations to warrant
 * running the full analysis pipeline (concept extraction + quiz generation).
 */
export function hasEnoughObservationsForAnalysis(db: Database, memorySessionId: string): boolean {
  return countWriteObservations(db, memorySessionId) >= MIN_OBSERVATIONS_FOR_ANALYSIS;
}
