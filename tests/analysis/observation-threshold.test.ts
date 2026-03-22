/**
 * ObservationThreshold tests
 *
 * Verifies the minimum-observation guard that prevents the analysis pipeline
 * from running on sessions with too little signal.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { VibeLearnDatabase } from '../../src/services/sqlite/Database.js';
import {
  MIN_OBSERVATIONS_FOR_ANALYSIS,
  countWriteObservations,
  hasEnoughObservationsForAnalysis,
} from '../../src/services/analysis/ObservationThreshold.js';

describe('MIN_OBSERVATIONS_FOR_ANALYSIS', () => {
  it('is a positive integer', () => {
    expect(typeof MIN_OBSERVATIONS_FOR_ANALYSIS).toBe('number');
    expect(Number.isInteger(MIN_OBSERVATIONS_FOR_ANALYSIS)).toBe(true);
    expect(MIN_OBSERVATIONS_FOR_ANALYSIS).toBeGreaterThan(0);
  });
});

describe('countWriteObservations', () => {
  let db: Database;

  function insertSession(db: Database, memorySessionId: string): void {
    db.run(
      `INSERT INTO sdk_sessions
         (content_session_id, memory_session_id, project, started_at, started_at_epoch, status)
       VALUES (?, ?, 'test-project', '2026-01-01', 1735689600, 'active')`,
      [memorySessionId, memorySessionId]
    );
  }

  function insertObservation(db: Database, memorySessionId: string, type: string): void {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO observations
         (memory_session_id, project, type, created_at, created_at_epoch)
       VALUES (?, 'test-project', ?, ?, unixepoch())`,
      [memorySessionId, type, now]
    );
  }

  beforeEach(() => {
    db = new VibeLearnDatabase(':memory:').db;
    insertSession(db, 'test-session-1');
  });

  afterEach(() => {
    db.close();
  });

  it('returns 0 for a session with no observations', () => {
    expect(countWriteObservations(db, 'test-session-1')).toBe(0);
  });

  it('counts file_write observations', () => {
    insertObservation(db, 'test-session-1', 'file_write');
    insertObservation(db, 'test-session-1', 'file_write');
    expect(countWriteObservations(db, 'test-session-1')).toBe(2);
  });

  it('counts file_edit observations', () => {
    insertObservation(db, 'test-session-1', 'file_edit');
    expect(countWriteObservations(db, 'test-session-1')).toBe(1);
  });

  it('does NOT count file_read observations', () => {
    insertObservation(db, 'test-session-1', 'file_read');
    insertObservation(db, 'test-session-1', 'file_read');
    expect(countWriteObservations(db, 'test-session-1')).toBe(0);
  });

  it('does NOT count bash_command observations', () => {
    insertObservation(db, 'test-session-1', 'bash_command');
    expect(countWriteObservations(db, 'test-session-1')).toBe(0);
  });

  it('counts both file_write and file_edit together', () => {
    insertObservation(db, 'test-session-1', 'file_write');
    insertObservation(db, 'test-session-1', 'file_edit');
    insertObservation(db, 'test-session-1', 'file_read'); // not counted
    expect(countWriteObservations(db, 'test-session-1')).toBe(2);
  });

  it('returns 0 for a non-existent session', () => {
    expect(countWriteObservations(db, 'no-such-session')).toBe(0);
  });

  it('isolates counts per session', () => {
    insertSession(db, 'test-session-2');
    insertObservation(db, 'test-session-1', 'file_write');
    insertObservation(db, 'test-session-1', 'file_write');
    insertObservation(db, 'test-session-2', 'file_write');

    expect(countWriteObservations(db, 'test-session-1')).toBe(2);
    expect(countWriteObservations(db, 'test-session-2')).toBe(1);
  });
});

describe('hasEnoughObservationsForAnalysis', () => {
  let db: Database;

  function insertSession(db: Database, memorySessionId: string): void {
    db.run(
      `INSERT INTO sdk_sessions
         (content_session_id, memory_session_id, project, started_at, started_at_epoch, status)
       VALUES (?, ?, 'test-project', '2026-01-01', 1735689600, 'active')`,
      [memorySessionId, memorySessionId]
    );
  }

  function insertObservation(db: Database, memorySessionId: string, type: string): void {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO observations
         (memory_session_id, project, type, created_at, created_at_epoch)
       VALUES (?, 'test-project', ?, ?, unixepoch())`,
      [memorySessionId, type, now]
    );
  }

  beforeEach(() => {
    db = new VibeLearnDatabase(':memory:').db;
    insertSession(db, 'sess-threshold');
  });

  afterEach(() => {
    db.close();
  });

  it('returns false when observations < MIN_OBSERVATIONS_FOR_ANALYSIS', () => {
    // Insert one fewer than minimum
    for (let i = 0; i < MIN_OBSERVATIONS_FOR_ANALYSIS - 1; i++) {
      insertObservation(db, 'sess-threshold', 'file_write');
    }
    expect(hasEnoughObservationsForAnalysis(db, 'sess-threshold')).toBe(false);
  });

  it('returns true when observations === MIN_OBSERVATIONS_FOR_ANALYSIS', () => {
    for (let i = 0; i < MIN_OBSERVATIONS_FOR_ANALYSIS; i++) {
      insertObservation(db, 'sess-threshold', 'file_write');
    }
    expect(hasEnoughObservationsForAnalysis(db, 'sess-threshold')).toBe(true);
  });

  it('returns true when observations > MIN_OBSERVATIONS_FOR_ANALYSIS', () => {
    for (let i = 0; i < MIN_OBSERVATIONS_FOR_ANALYSIS + 5; i++) {
      insertObservation(db, 'sess-threshold', 'file_edit');
    }
    expect(hasEnoughObservationsForAnalysis(db, 'sess-threshold')).toBe(true);
  });

  it('returns false for a session with only read observations', () => {
    for (let i = 0; i < MIN_OBSERVATIONS_FOR_ANALYSIS + 10; i++) {
      insertObservation(db, 'sess-threshold', 'file_read');
    }
    expect(hasEnoughObservationsForAnalysis(db, 'sess-threshold')).toBe(false);
  });
});
