/**
 * Summarize Handler — VibeLearn Analysis Pipeline
 *
 * Dispatches the 5-step analysis pipeline to the worker after a session ends:
 *   1. Stack detection  (/api/vibelearn/analyze/stack)
 *   2. Static analysis  (/api/vibelearn/analyze/static)
 *   3. Concept extraction via LLM (/api/vibelearn/analyze/concepts)
 *   4. Quiz generation via LLM  (/api/vibelearn/analyze/quiz)
 *   5. Upstream sync            (/api/vibelearn/sync)
 *
 * Each step is independent — a failure in one step is logged but does not
 * prevent subsequent steps. The hook always exits 0 (never blocks Claude).
 */

import type { EventHandler, NormalizedHookInput, HookResult } from '../types.js';
import { ensureWorkerRunning, workerHttpRequest } from '../../shared/worker-utils.js';
import { logger } from '../../utils/logger.js';
import { extractLastMessage } from '../../shared/transcript-parser.js';
import { HOOK_EXIT_CODES } from '../../shared/hook-constants.js';

const PIPELINE_TIMEOUT_MS = 120_000;

async function runStep(
  path: string,
  body: Record<string, unknown>,
  label: string
): Promise<boolean> {
  try {
    const response = await workerHttpRequest(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: PIPELINE_TIMEOUT_MS
    });
    if (!response.ok) {
      logger.warn('HOOK', `Pipeline step ${label} returned ${response.status}`);
      return false;
    }
    logger.debug('HOOK', `Pipeline step ${label} OK`);
    return true;
  } catch (err) {
    logger.warn('HOOK', `Pipeline step ${label} failed`, {}, err as Error);
    return false;
  }
}

export const summarizeHandler: EventHandler = {
  async execute(input: NormalizedHookInput): Promise<HookResult> {
    const workerReady = await ensureWorkerRunning();
    if (!workerReady) {
      return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
    }

    const { sessionId, transcriptPath } = input;

    if (!transcriptPath) {
      logger.debug('HOOK', `No transcriptPath for session ${sessionId} — skipping analysis`);
      return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
    }

    const lastAssistantMessage = extractLastMessage(transcriptPath, 'assistant', true) ?? '';

    logger.dataIn('HOOK', 'Running VibeLearn analysis pipeline', { sessionId });

    // Run each step sequentially — stop early if session is unknown but don't block
    await runStep('/api/vibelearn/analyze/stack', { contentSessionId: sessionId }, 'stack');
    await runStep('/api/vibelearn/analyze/static', { contentSessionId: sessionId }, 'static');
    await runStep(
      '/api/vibelearn/analyze/concepts',
      { contentSessionId: sessionId, last_assistant_message: lastAssistantMessage },
      'concepts'
    );
    await runStep('/api/vibelearn/analyze/quiz', { contentSessionId: sessionId }, 'quiz');
    await runStep('/api/vibelearn/sync', { contentSessionId: sessionId }, 'sync');

    return { continue: true, suppressOutput: true, exitCode: HOOK_EXIT_CODES.SUCCESS };
  }
};
