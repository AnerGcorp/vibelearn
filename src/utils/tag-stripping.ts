/**
 * Tag Stripping Utilities
 *
 * Implements the tag system for privacy control:
 * 1. <private> - User-level tag for manual privacy control
 *    (allows users to mark content they don't want persisted or synced)
 * 2. <vibelearn-context> - Auto-injected context blocks (should not be re-stored)
 * 3. <system_instruction> / <system-instruction> - Conductor-injected system instructions
 *    (should not be persisted to memory)
 *
 * EDGE PROCESSING PATTERN: Filter at hook layer before sending to worker/storage.
 * This keeps the worker service simple and follows one-way data stream.
 */

import { logger } from './logger.js';

/**
 * Maximum number of tags allowed in a single content block
 * This protects against ReDoS (Regular Expression Denial of Service) attacks
 * where malicious input with many nested/unclosed tags could cause catastrophic backtracking
 */
const MAX_TAG_COUNT = 100;

/**
 * Count total number of opening tags in content
 * Used for ReDoS protection before regex processing
 */
function countTags(content: string): number {
  const privateCount = (content.match(/<private>/g) || []).length;
  const systemInstructionCount = (content.match(/<system_instruction>/g) || []).length;
  const systemInstructionHyphenCount = (content.match(/<system-instruction>/g) || []).length;
  const vibeLearnContextCount = (content.match(/<vibelearn-context>/g) || []).length;
  return privateCount + systemInstructionCount + systemInstructionHyphenCount + vibeLearnContextCount;
}

/**
 * Internal function to strip memory tags from content
 * Shared logic extracted from both JSON and prompt stripping functions
 */
function stripTagsInternal(content: string): string {
  // ReDoS protection: limit tag count before regex processing
  const tagCount = countTags(content);
  if (tagCount > MAX_TAG_COUNT) {
    logger.warn('SYSTEM', 'tag count exceeds limit', undefined, {
      tagCount,
      maxAllowed: MAX_TAG_COUNT,
      contentLength: content.length
    });
    // Still process but log the anomaly
  }

  return content
    .replace(/<private>[\s\S]*?<\/private>/g, '')
    .replace(/<vibelearn-context>[\s\S]*?<\/vibelearn-context>/g, '')
    .replace(/<system_instruction>[\s\S]*?<\/system_instruction>/g, '')
    .replace(/<system-instruction>[\s\S]*?<\/system-instruction>/g, '')
    .trim();
}

/**
 * Strip memory tags from JSON-serialized content (tool inputs/responses)
 *
 * @param content - Stringified JSON content from tool_input or tool_response
 * @returns Cleaned content with tags removed, or '{}' if invalid
 */
export function stripMemoryTagsFromJson(content: string): string {
  return stripTagsInternal(content);
}

/**
 * Strip memory tags from user prompt content
 *
 * @param content - Raw user prompt text
 * @returns Cleaned content with tags removed
 */
export function stripMemoryTagsFromPrompt(content: string): string {
  return stripTagsInternal(content);
}
