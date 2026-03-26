/**
 * Observation Handler - PostToolUse
 *
 * Captures structured tool usage for VibeLearn analysis pipeline.
 * Enriches observations with tool type, file paths, and package installs
 * so the analysis pipeline can run stack detection and static analysis.
 */

import type { EventHandler, NormalizedHookInput, HookResult } from '../types.js';
import { ensureWorkerRunning, workerHttpRequest } from '../../shared/worker-utils.js';
import { logger } from '../../utils/logger.js';
import { HOOK_EXIT_CODES } from '../../shared/hook-constants.js';
import { isProjectExcluded } from '../../utils/project-filter.js';
import { SettingsDefaultsManager } from '../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../shared/paths.js';

const MAX_CONTENT_BYTES = 10 * 1024; // 10KB cap on file content per observation

/** Package install command patterns across ecosystems */
const PACKAGE_INSTALL_RE = /^(npm\s+install|npm\s+i|yarn\s+add|pnpm\s+add|pip\s+install|pip3\s+install|go\s+get|cargo\s+add|bundle\s+add)\s+/;

/**
 * Classify a tool call and extract structured fields for analysis.
 * Returns an enriched payload ready for POST /api/sessions/observations.
 */
function enrichObservation(
  sessionId: string,
  toolName: string,
  toolInput: unknown,
  toolResponse: unknown,
  cwd: string
): Record<string, unknown> {
  const input = (toolInput ?? {}) as Record<string, unknown>;

  // Always include raw tool_input/tool_response — the worker passes these
  // directly to the SDK agent. Without them the agent sees empty objects and
  // produces no observations (the enriched custom fields are silently ignored).
  const base = {
    contentSessionId: sessionId,
    tool_name: toolName,
    cwd,
    tool_input: toolInput,
    tool_response: toolResponse,
  };

  // Write / Edit — capture file path + content (truncated)
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'NotebookEdit') {
    const filePath = (input.file_path ?? input.path ?? '') as string;
    let content = (input.content ?? input.new_string ?? '') as string;
    if (content.length > MAX_CONTENT_BYTES) {
      content = content.slice(0, MAX_CONTENT_BYTES) + '\n// [truncated]';
    }
    return {
      ...base,
      tool_type: toolName === 'Write' ? 'file_write' : 'file_edit',
      file_path: filePath,
      content
    };
  }

  // Read — capture file path only, no content (to avoid bloat)
  if (toolName === 'Read') {
    return {
      ...base,
      tool_type: 'file_read',
      file_path: (input.file_path ?? input.path ?? '') as string
    };
  }

  // Bash — detect package installs, otherwise store command + slim output
  if (toolName === 'Bash') {
    const command = (input.command ?? input.cmd ?? '') as string;
    const isInstall = PACKAGE_INSTALL_RE.test(command.trim());

    if (isInstall) {
      const packageNames = command.trim().split(/\s+/).slice(2);
      return {
        ...base,
        tool_type: 'package_install',
        command,
        package_names: packageNames
      };
    }

    // Regular bash — store command, slim down output to avoid overwhelming the DB
    const output = String(toolResponse ?? '').slice(0, 2000);
    return {
      ...base,
      tool_type: 'bash_command',
      command,
      output
    };
  }

  // All other tools — lightweight record
  return {
    ...base,
    tool_type: 'other_tool'
  };
}

export const observationHandler: EventHandler = {
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    const workerReady = await ensureWorkerRunning();
    if (!workerReady) {
      return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
    }

    const { sessionId, cwd, toolName, toolInput, toolResponse } = input;

    if (!toolName) {
      return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
    }

    if (!cwd) {
      throw new Error(`Missing cwd in PostToolUse hook input for session ${sessionId}, tool ${toolName}`);
    }

    // Check if project is excluded from tracking
    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    if (isProjectExcluded(cwd, settings.VIBELEARN_EXCLUDED_PROJECTS)) {
      logger.debug('HOOK', 'Project excluded from tracking, skipping observation', { cwd, toolName });
      return { continue: true, suppressOutput: true };
    }

    const payload = enrichObservation(sessionId, toolName, toolInput, toolResponse, cwd);

    logger.dataIn('HOOK', `PostToolUse: ${toolName} [${payload.tool_type}]`, {});

    try {
      const response = await workerHttpRequest('/api/sessions/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        logger.warn('HOOK', 'Observation storage failed, skipping', { status: response.status, toolName });
        return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
      }

      logger.debug('HOOK', 'Observation sent successfully', { toolName, type: payload.tool_type });
    } catch (error) {
      logger.warn('HOOK', 'Observation fetch error, skipping', {
        error: error instanceof Error ? error.message : String(error)
      });
      return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
    }

    return { continue: true, suppressOutput: true };
  }
};
