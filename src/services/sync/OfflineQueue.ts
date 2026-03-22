/**
 * OfflineQueue
 *
 * Wraps the vl_sync_queue table to retry failed upstream syncs.
 * Enqueue on sync failure; flush processes up to 50 pending entries
 * at the start of every subsequent sync attempt.
 */

import { logger } from '../../utils/logger.js';
import type { UpstreamSync } from './UpstreamSync.js';
import type { Database } from 'bun:sqlite';

const MAX_FLUSH_BATCH = 50;
const MAX_ATTEMPTS = 5;

export class OfflineQueue {
  constructor(private db: Database) {}

  /**
   * Add a failed payload to the offline queue for later retry.
   */
  enqueue(payloadType: string, payloadJson: string): void {
    try {
      this.db.run(`
        INSERT INTO vl_sync_queue (payload_type, payload_json, created_at, attempts, last_attempted_at)
        VALUES (?, ?, ?, 0, NULL)
      `, [payloadType, payloadJson, Math.floor(Date.now() / 1000)]);
      logger.debug('QUEUE', 'Enqueued payload for offline retry', { payloadType });
    } catch (err) {
      logger.error('QUEUE', 'Failed to enqueue payload', { payloadType }, err as Error);
    }
  }

  /**
   * Flush up to MAX_FLUSH_BATCH pending entries.
   * Entries that succeed are deleted; entries that fail have their attempt
   * count incremented. Entries that exceed MAX_ATTEMPTS are dropped.
   */
  async flush(upstreamSync: UpstreamSync): Promise<void> {
    if (!upstreamSync.isConfigured()) return;

    const rows = this.db.query<{
      id: number;
      payload_json: string;
      attempts: number;
    }, []>(`
      SELECT id, payload_json, attempts
      FROM vl_sync_queue
      WHERE status = 'pending' AND attempts < ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(MAX_ATTEMPTS, MAX_FLUSH_BATCH);

    if (rows.length === 0) return;

    logger.debug('QUEUE', `Flushing ${rows.length} offline queue entries`);

    for (const row of rows) {
      try {
        await upstreamSync.syncRawPayload(row.payload_json);
        // Success — remove from queue
        this.db.run(`DELETE FROM vl_sync_queue WHERE id = ?`, [row.id]);
      } catch (err) {
        const newAttempts = row.attempts + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          // Too many failures — mark as failed and stop retrying
          this.db.run(`
            UPDATE vl_sync_queue
            SET status = 'failed', attempts = ?, last_attempted_at = ?
            WHERE id = ?
          `, [newAttempts, Math.floor(Date.now() / 1000), row.id]);
          logger.warn('QUEUE', 'Dropping queue entry after max attempts', { id: row.id });
        } else {
          this.db.run(`
            UPDATE vl_sync_queue
            SET attempts = ?, last_attempted_at = ?
            WHERE id = ?
          `, [newAttempts, Math.floor(Date.now() / 1000), row.id]);
          logger.debug('QUEUE', 'Retry failed, will try again later', { id: row.id, attempts: newAttempts });
        }
      }
    }
  }

  /**
   * Count pending entries in the queue.
   */
  pendingCount(): number {
    const row = this.db.query<{ count: number }, []>(
      `SELECT COUNT(*) as count FROM vl_sync_queue WHERE status = 'pending'`
    ).get();
    return row?.count ?? 0;
  }
}
