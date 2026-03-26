/**
 * SettingsDefaultsManager
 *
 * Single source of truth for all default configuration values.
 * Provides methods to get defaults with optional environment variable overrides.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
// NOTE: Do NOT import logger here - it creates a circular dependency
// logger.ts depends on SettingsDefaultsManager for its initialization

export interface SettingsDefaults {
  VIBELEARN_MODEL: string;
  VIBELEARN_WORKER_PORT: string;
  VIBELEARN_WORKER_HOST: string;
  VIBELEARN_SKIP_TOOLS: string;
  // AI Provider Configuration
  VIBELEARN_PROVIDER: string;  // 'claude' | 'gemini' | 'openrouter'
  VIBELEARN_CLAUDE_AUTH_METHOD: string;  // 'cli' | 'api' - how Claude provider authenticates
  VIBELEARN_GEMINI_API_KEY: string;
  VIBELEARN_GEMINI_MODEL: string;
  VIBELEARN_GEMINI_RATE_LIMITING_ENABLED: string;  // 'true' | 'false'
  VIBELEARN_OPENROUTER_API_KEY: string;
  VIBELEARN_OPENROUTER_MODEL: string;
  VIBELEARN_OPENROUTER_SITE_URL: string;
  VIBELEARN_OPENROUTER_APP_NAME: string;
  VIBELEARN_OPENROUTER_MAX_CONTEXT_MESSAGES: string;
  VIBELEARN_OPENROUTER_MAX_TOKENS: string;
  // System Configuration
  VIBELEARN_DATA_DIR: string;
  VIBELEARN_LOG_LEVEL: string;
  VIBELEARN_PYTHON_VERSION: string;
  CLAUDE_CODE_PATH: string;
  // Process Management
  VIBELEARN_MAX_CONCURRENT_AGENTS: string;
  // Exclusion Settings
  VIBELEARN_EXCLUDED_PROJECTS: string;  // Comma-separated glob patterns
  // Context Configuration
  VIBELEARN_CONTEXT_OBSERVATIONS: string;
  VIBELEARN_CONTEXT_FULL_COUNT: string;
  VIBELEARN_CONTEXT_FULL_FIELD: string;
  VIBELEARN_CONTEXT_SESSION_COUNT: string;
  VIBELEARN_CONTEXT_SHOW_READ_TOKENS: string;
  VIBELEARN_CONTEXT_SHOW_WORK_TOKENS: string;
  VIBELEARN_CONTEXT_SHOW_SAVINGS_AMOUNT: string;
  VIBELEARN_CONTEXT_SHOW_SAVINGS_PERCENT: string;
  VIBELEARN_CONTEXT_SHOW_LAST_SUMMARY: string;
  VIBELEARN_CONTEXT_SHOW_LAST_MESSAGE: string;
  VIBELEARN_CONTEXT_OBSERVATION_TYPES: string;
  VIBELEARN_CONTEXT_OBSERVATION_CONCEPTS: string;
  // Folder Configuration
  VIBELEARN_FOLDER_CLAUDEMD_ENABLED: string;
  VIBELEARN_FOLDER_MD_EXCLUDE: string;
  // Upstream Sync
  VIBELEARN_API_KEY: string;         // API key for vibelearn.dev
  VIBELEARN_API_URL: string;         // Upstream API endpoint
  VIBELEARN_AUTO_SYNC: string;       // 'true' | 'false' — sync after each session
  VIBELEARN_SYNC_SNIPPETS: string;   // 'true' | 'false' — include code snippets in sync
}

export class SettingsDefaultsManager {
  /**
   * Default values for all settings
   */
  private static readonly DEFAULTS: SettingsDefaults = {
    VIBELEARN_MODEL: 'claude-sonnet-4-5',
    VIBELEARN_WORKER_PORT: '37778',
    VIBELEARN_WORKER_HOST: '127.0.0.1',
    VIBELEARN_SKIP_TOOLS: 'ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion',
    // AI Provider Configuration
    VIBELEARN_PROVIDER: 'claude',
    VIBELEARN_CLAUDE_AUTH_METHOD: 'cli',
    VIBELEARN_GEMINI_API_KEY: '',
    VIBELEARN_GEMINI_MODEL: 'gemini-2.5-flash-lite',
    VIBELEARN_GEMINI_RATE_LIMITING_ENABLED: 'true',
    VIBELEARN_OPENROUTER_API_KEY: '',
    VIBELEARN_OPENROUTER_MODEL: 'xiaomi/mimo-v2-flash:free',
    VIBELEARN_OPENROUTER_SITE_URL: '',
    VIBELEARN_OPENROUTER_APP_NAME: 'vibelearn',
    VIBELEARN_OPENROUTER_MAX_CONTEXT_MESSAGES: '20',
    VIBELEARN_OPENROUTER_MAX_TOKENS: '100000',
    // System Configuration
    VIBELEARN_DATA_DIR: join(homedir(), '.vibelearn'),
    VIBELEARN_LOG_LEVEL: 'INFO',
    VIBELEARN_PYTHON_VERSION: '3.13',
    CLAUDE_CODE_PATH: '',
    // Process Management
    VIBELEARN_MAX_CONCURRENT_AGENTS: '2',
    // Exclusion Settings
    VIBELEARN_EXCLUDED_PROJECTS: '',
    // Context Configuration
    VIBELEARN_CONTEXT_OBSERVATIONS: '50',
    VIBELEARN_CONTEXT_FULL_COUNT: '3',
    VIBELEARN_CONTEXT_FULL_FIELD: 'narrative',
    VIBELEARN_CONTEXT_SESSION_COUNT: '10',
    VIBELEARN_CONTEXT_SHOW_READ_TOKENS: 'true',
    VIBELEARN_CONTEXT_SHOW_WORK_TOKENS: 'true',
    VIBELEARN_CONTEXT_SHOW_SAVINGS_AMOUNT: 'true',
    VIBELEARN_CONTEXT_SHOW_SAVINGS_PERCENT: 'true',
    VIBELEARN_CONTEXT_SHOW_LAST_SUMMARY: 'true',
    VIBELEARN_CONTEXT_SHOW_LAST_MESSAGE: 'true',
    VIBELEARN_CONTEXT_OBSERVATION_TYPES: '',
    VIBELEARN_CONTEXT_OBSERVATION_CONCEPTS: '',
    // Folder Configuration
    VIBELEARN_FOLDER_CLAUDEMD_ENABLED: 'false',
    VIBELEARN_FOLDER_MD_EXCLUDE: '[]',
    // Upstream Sync
    VIBELEARN_API_KEY: '',
    VIBELEARN_API_URL: 'https://vibelearn.dev',
    VIBELEARN_AUTO_SYNC: 'true',
    VIBELEARN_SYNC_SNIPPETS: 'true',
  };

  /**
   * Get all defaults as an object
   */
  static getAllDefaults(): SettingsDefaults {
    return { ...this.DEFAULTS };
  }

  /**
   * Get a setting value with environment variable override.
   * Priority: process.env > hardcoded default
   *
   * For full priority (env > settings file > default), use loadFromFile().
   * This method is safe to call at module-load time (no file I/O) and still
   * respects environment variable overrides that were previously ignored.
   */
  static get(key: keyof SettingsDefaults): string {
    return process.env[key] ?? this.DEFAULTS[key];
  }

  /**
   * Get an integer default value
   */
  static getInt(key: keyof SettingsDefaults): number {
    const value = this.get(key);
    return parseInt(value, 10);
  }

  /**
   * Get a boolean default value
   * Handles both string 'true' and boolean true from JSON
   */
  static getBool(key: keyof SettingsDefaults): boolean {
    const value = this.get(key);
    return value === 'true' || value === true;
  }

  /**
   * Apply environment variable overrides to settings
   * Environment variables take highest priority over file and defaults
   */
  private static applyEnvOverrides(settings: SettingsDefaults): SettingsDefaults {
    const result = { ...settings };
    for (const key of Object.keys(this.DEFAULTS) as Array<keyof SettingsDefaults>) {
      if (process.env[key] !== undefined) {
        result[key] = process.env[key]!;
      }
    }
    return result;
  }

  /**
   * Load settings from file with fallback to defaults
   * Returns merged settings with proper priority: process.env > settings file > defaults
   * Handles all errors (missing file, corrupted JSON, permissions) gracefully
   *
   * Configuration Priority:
   *   1. Environment variables (highest priority)
   *   2. Settings file (~/.vibelearn/settings.json)
   *   3. Default values (lowest priority)
   */
  static loadFromFile(settingsPath: string): SettingsDefaults {
    try {
      if (!existsSync(settingsPath)) {
        const defaults = this.getAllDefaults();
        try {
          const dir = dirname(settingsPath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(settingsPath, JSON.stringify(defaults, null, 2), 'utf-8');
          // Use console instead of logger to avoid circular dependency
          console.log('[SETTINGS] Created settings file with defaults:', settingsPath);
        } catch (error) {
          console.warn('[SETTINGS] Failed to create settings file, using in-memory defaults:', settingsPath, error);
        }
        // Still apply env var overrides even when file doesn't exist
        return this.applyEnvOverrides(defaults);
      }

      const settingsData = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(settingsData);

      // MIGRATION: Handle old nested schema { env: {...} }
      let flatSettings = settings;
      if (settings.env && typeof settings.env === 'object') {
        // Migrate from nested to flat schema
        flatSettings = settings.env;

        // Auto-migrate the file to flat schema
        try {
          writeFileSync(settingsPath, JSON.stringify(flatSettings, null, 2), 'utf-8');
          console.log('[SETTINGS] Migrated settings file from nested to flat schema:', settingsPath);
        } catch (error) {
          console.warn('[SETTINGS] Failed to auto-migrate settings file:', settingsPath, error);
          // Continue with in-memory migration even if write fails
        }
      }

      // Merge file settings with defaults (flat schema)
      const result: SettingsDefaults = { ...this.DEFAULTS };
      for (const key of Object.keys(this.DEFAULTS) as Array<keyof SettingsDefaults>) {
        if (flatSettings[key] !== undefined) {
          result[key] = flatSettings[key];
        }
      }

      // Apply environment variable overrides (highest priority)
      return this.applyEnvOverrides(result);
    } catch (error) {
      console.warn('[SETTINGS] Failed to load settings, using defaults:', settingsPath, error);
      // Still apply env var overrides even on error
      return this.applyEnvOverrides(this.getAllDefaults());
    }
  }
}
