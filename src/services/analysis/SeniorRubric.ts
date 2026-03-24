/**
 * SeniorRubric
 *
 * LLM-based evaluation of open-ended answers to senior-level questions.
 * Uses the 5-dimension rubric validated in belearn notebook 11.
 *
 * Dimensions (scoring formula: (accuracy×2 + depth + tradeoffs + practical + completeness) / 7):
 *   1. accuracy    (weight: 2×) — technical correctness
 *   2. depth       (weight: 1×) — understanding WHY not just WHAT
 *   3. tradeoffs   (weight: 1×) — awareness of alternatives and context
 *   4. practical   (weight: 1×) — production-readiness
 *   5. completeness(weight: 1×) — coverage of all question parts
 *
 * Anti-gaming detection caps scores for: buzzword soup, overly brief answers,
 * generic advice, perpetual hedging, and copied text.
 *
 * Level thresholds:
 *   >= 4.0 → senior_validated
 *   >= 3.0 → mid_plus
 *   >= 2.0 → mid
 *   <  2.0 → needs_growth
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';
import { getPackageRoot } from '../../shared/paths.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RubricLevel = 'senior_validated' | 'mid_plus' | 'mid' | 'needs_growth';

export interface RubricScores {
  accuracy: number;      // 1–5 (technical correctness, weight 2×)
  depth: number;         // 1–5 (understanding depth)
  tradeoffs: number;     // 1–5 (trade-off awareness)
  practical: number;     // 1–5 (practical applicability)
  completeness: number;  // 1–5 (question coverage)
}

export interface RubricResult {
  scores: RubricScores;
  anti_gaming: string[];
  reasoning: string;
  raw_score: number;     // (accuracy×2 + depth + tradeoffs + practical + completeness) / 7
  level: RubricLevel;
}

// ─── Load rubric definition ───────────────────────────────────────────────────

interface SeniorRubricJson {
  system_prompt: string;
  level_thresholds: Record<string, string>;
}

let _rubric: SeniorRubricJson | null = null;

function loadRubric(): SeniorRubricJson {
  if (_rubric) return _rubric;
  try {
    const rubricPath = join(getPackageRoot(), 'senior_rubric.json');
    _rubric = JSON.parse(readFileSync(rubricPath, 'utf-8')) as SeniorRubricJson;
  } catch {
    // Minimal fallback if file is missing
    _rubric = {
      system_prompt: 'Evaluate the developer answer on 5 dimensions (1-5 each).',
      level_thresholds: { senior_validated: '>= 4.0', mid_plus: '>= 3.0', mid: '>= 2.0', needs_growth: '< 2.0' },
    };
  }
  return _rubric;
}

// ─── Scoring formula ──────────────────────────────────────────────────────────

/**
 * Compute the weighted raw score.
 * Formula: (accuracy×2 + depth + tradeoffs + practical + completeness) / 7
 */
export function computeRawScore(scores: RubricScores): number {
  return (scores.accuracy * 2 + scores.depth + scores.tradeoffs + scores.practical + scores.completeness) / 7;
}

/**
 * Convert a raw score to a level.
 */
export function levelFromRawScore(rawScore: number): RubricLevel {
  if (rawScore >= 4.0) return 'senior_validated';
  if (rawScore >= 3.0) return 'mid_plus';
  if (rawScore >= 2.0) return 'mid';
  return 'needs_growth';
}

// ─── XML parsing for rubric evaluation ───────────────────────────────────────

function parseRubricXml(xml: string): RubricResult | null {
  const getTag = (tag: string) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim();
  const getInt = (tag: string, fallback: number) => {
    const val = parseInt(getTag(tag) ?? '', 10);
    return isNaN(val) ? fallback : Math.min(5, Math.max(1, val));
  };

  const accuracy = getInt('accuracy', 3);
  const depth = getInt('depth', 3);
  const tradeoffs = getInt('tradeoffs', 3);
  const practical = getInt('practical', 3);
  const completeness = getInt('completeness', 3);
  const reasoning = getTag('reasoning') ?? '';
  const antiGamingRaw = getTag('anti_gaming') ?? '';
  const anti_gaming = antiGamingRaw
    ? antiGamingRaw.split('\n').map(s => s.trim()).filter(Boolean)
    : [];

  if (!reasoning) return null;

  const scores: RubricScores = { accuracy, depth, tradeoffs, practical, completeness };
  const raw_score = computeRawScore(scores);
  const level = levelFromRawScore(raw_score);

  return { scores, anti_gaming, reasoning, raw_score, level };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildRubricPrompt(
  question: string,
  developerAnswer: string,
  snippet: string,
  conceptName: string
): string {
  const rubric = loadRubric();

  return `${rubric.system_prompt}

---

## Concept
${conceptName}

## Code Snippet
${snippet || '(no snippet)'}

## Question
${question}

## Developer's Answer
${developerAnswer}

---

Respond ONLY with this XML (no other text):

<evaluation>
  <accuracy>1-5</accuracy>
  <depth>1-5</depth>
  <tradeoffs>1-5</tradeoffs>
  <practical>1-5</practical>
  <completeness>1-5</completeness>
  <anti_gaming>List any anti-gaming flags triggered, one per line (empty if none)</anti_gaming>
  <reasoning>Brief justification for each dimension score</reasoning>
  <raw_score>computed: (accuracy×2 + depth + tradeoffs + practical + completeness) / 7</raw_score>
  <level>senior_validated OR mid_plus OR mid OR needs_growth</level>
</evaluation>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate an open-ended answer using the 5-dimension senior rubric.
 *
 * @param question    The open-ended question text
 * @param answer      The developer's answer
 * @param snippet     Code snippet from the original question
 * @param conceptName Name of the concept being tested
 * @param agentRunner LLM caller — receives prompt, returns text response
 * @returns           RubricResult or null if LLM fails
 */
export async function evaluateOpenAnswer(
  question: string,
  answer: string,
  snippet: string,
  conceptName: string,
  agentRunner: (prompt: string) => Promise<string>
): Promise<RubricResult | null> {
  const prompt = buildRubricPrompt(question, answer, snippet, conceptName);

  try {
    const response = await agentRunner(prompt);
    const result = parseRubricXml(response);
    if (!result) {
      logger.warn('RUBRIC', 'Failed to parse rubric XML response', { conceptName });
      return null;
    }
    logger.debug('RUBRIC', 'Evaluated open answer', { conceptName, level: result.level, raw_score: result.raw_score });
    return result;
  } catch (err) {
    logger.error('RUBRIC', 'Senior rubric evaluation failed', { conceptName }, err as Error);
    return null;
  }
}
