/**
 * DatabaseManager: Single long-lived database connection
 *
 * Responsibility:
 * - Manage single database connection for worker lifetime
 * - Provide centralized access to SessionStore and SessionSearch
 * - High-level database operations
 */

import { SessionStore } from '../sqlite/SessionStore.js';
import { SessionSearch } from '../sqlite/SessionSearch.js';
import { logger } from '../../utils/logger.js';
import type { DBSession } from '../worker-types.js';

export class DatabaseManager {
  private sessionStore: SessionStore | null = null;
  private sessionSearch: SessionSearch | null = null;

  /**
   * Initialize database connection (once, stays open)
   */
  async initialize(): Promise<void> {
    this.sessionStore = new SessionStore();
    this.sessionSearch = new SessionSearch();
    logger.info('DB', 'Database initialized');
  }

  /**
   * Close database connection and cleanup all resources
   */
  async close(): Promise<void> {
    if (this.sessionStore) {
      this.sessionStore.close();
      this.sessionStore = null;
    }
    if (this.sessionSearch) {
      this.sessionSearch.close();
      this.sessionSearch = null;
    }
    logger.info('DB', 'Database closed');
  }

  /**
   * Get SessionStore instance (throws if not initialized)
   */
  getSessionStore(): SessionStore {
    if (!this.sessionStore) {
      throw new Error('Database not initialized');
    }
    return this.sessionStore;
  }

  /**
   * Get SessionSearch instance (throws if not initialized)
   */
  getSessionSearch(): SessionSearch {
    if (!this.sessionSearch) {
      throw new Error('Database not initialized');
    }
    return this.sessionSearch;
  }

  /**
   * Stub for callers that previously used getChromaSync().
   * Chroma has been removed from VibeLearn — always returns null.
   */
  getChromaSync(): null {
    return null;
  }

  /**
   * Get session by ID (throws if not found)
   */
  getSessionById(sessionDbId: number): {
    id: number;
    content_session_id: string;
    memory_session_id: string | null;
    project: string;
    user_prompt: string;
  } {
    const session = this.getSessionStore().getSessionById(sessionDbId);
    if (!session) {
      throw new Error(`Session ${sessionDbId} not found`);
    }
    return session;
  }

}
