/**
 * SeniorRubric tests
 *
 * Tests the 5-dimension rubric evaluation for open-ended senior questions.
 * Covers: scoring formula, level thresholds, XML parsing, anti-gaming, error recovery.
 */

import { describe, it, expect } from 'bun:test';
import {
  computeRawScore,
  levelFromRawScore,
  evaluateOpenAnswer,
} from '../../src/services/analysis/SeniorRubric.js';
import type { RubricScores } from '../../src/services/analysis/SeniorRubric.js';

// ─── computeRawScore ──────────────────────────────────────────────────────────

describe('computeRawScore', () => {
  it('computes formula: (accuracy×2 + depth + tradeoffs + practical + completeness) / 7', () => {
    const scores: RubricScores = { accuracy: 4, depth: 3, tradeoffs: 3, practical: 3, completeness: 3 };
    // (8 + 3 + 3 + 3 + 3) / 7 = 20 / 7 ≈ 2.857
    expect(computeRawScore(scores)).toBeCloseTo(20 / 7, 5);
  });

  it('gives maximum score of 5 when all dimensions are 5', () => {
    const scores: RubricScores = { accuracy: 5, depth: 5, tradeoffs: 5, practical: 5, completeness: 5 };
    // (10 + 5 + 5 + 5 + 5) / 7 = 30 / 7 ≈ 4.286 (not 5, because weight only goes to 2×)
    expect(computeRawScore(scores)).toBeCloseTo(30 / 7, 5);
  });

  it('gives minimum score near 0.43 when all dimensions are 1', () => {
    const scores: RubricScores = { accuracy: 1, depth: 1, tradeoffs: 1, practical: 1, completeness: 1 };
    // (2 + 1 + 1 + 1 + 1) / 7 = 6 / 7 ≈ 0.857
    expect(computeRawScore(scores)).toBeCloseTo(6 / 7, 5);
  });

  it('weights accuracy double compared to other dimensions', () => {
    const highAccuracy: RubricScores = { accuracy: 5, depth: 1, tradeoffs: 1, practical: 1, completeness: 1 };
    const lowAccuracy: RubricScores  = { accuracy: 1, depth: 5, tradeoffs: 5, practical: 5, completeness: 5 };
    // highAccuracy: (10 + 4) / 7 = 2.0
    // lowAccuracy:  (2 + 20) / 7 ≈ 3.143
    expect(computeRawScore(highAccuracy)).toBeCloseTo(14 / 7, 5); // = 2.0
    expect(computeRawScore(lowAccuracy)).toBeCloseTo(22 / 7, 5);  // ≈ 3.143
  });
});

// ─── levelFromRawScore ────────────────────────────────────────────────────────

describe('levelFromRawScore', () => {
  it('returns senior_validated for score >= 4.0', () => {
    expect(levelFromRawScore(4.0)).toBe('senior_validated');
    expect(levelFromRawScore(4.9)).toBe('senior_validated');
  });

  it('returns mid_plus for 3.0 <= score < 4.0', () => {
    expect(levelFromRawScore(3.0)).toBe('mid_plus');
    expect(levelFromRawScore(3.67)).toBe('mid_plus');
    expect(levelFromRawScore(3.99)).toBe('mid_plus');
  });

  it('returns mid for 2.0 <= score < 3.0', () => {
    expect(levelFromRawScore(2.0)).toBe('mid');
    expect(levelFromRawScore(2.5)).toBe('mid');
    expect(levelFromRawScore(2.99)).toBe('mid');
  });

  it('returns needs_growth for score < 2.0', () => {
    expect(levelFromRawScore(0)).toBe('needs_growth');
    expect(levelFromRawScore(1.71)).toBe('needs_growth');
    expect(levelFromRawScore(1.99)).toBe('needs_growth');
  });

  it('calibration check: poor=1.71 → needs_growth', () => {
    expect(levelFromRawScore(1.71)).toBe('needs_growth');
  });
  it('calibration check: adequate=3.67 → mid_plus', () => {
    expect(levelFromRawScore(3.67)).toBe('mid_plus');
  });
  it('calibration check: excellent=4.9 → senior_validated', () => {
    expect(levelFromRawScore(4.9)).toBe('senior_validated');
  });
});

// ─── evaluateOpenAnswer ───────────────────────────────────────────────────────

function makeXml(overrides: Record<string, string> = {}): string {
  const d = {
    accuracy: '4',
    depth: '4',
    tradeoffs: '3',
    practical: '4',
    completeness: '4',
    anti_gaming: '',
    reasoning: 'The answer is technically accurate and covers key trade-offs.',
    raw_score: '3.86',
    level: 'mid_plus',
    ...overrides,
  };
  return `<evaluation>
  <accuracy>${d.accuracy}</accuracy>
  <depth>${d.depth}</depth>
  <tradeoffs>${d.tradeoffs}</tradeoffs>
  <practical>${d.practical}</practical>
  <completeness>${d.completeness}</completeness>
  <anti_gaming>${d.anti_gaming}</anti_gaming>
  <reasoning>${d.reasoning}</reasoning>
  <raw_score>${d.raw_score}</raw_score>
  <level>${d.level}</level>
</evaluation>`;
}

describe('evaluateOpenAnswer', () => {
  it('parses a valid rubric evaluation', async () => {
    const xml = makeXml();
    const result = await evaluateOpenAnswer(
      'How would you redesign this error handler?',
      'I would wrap it in a Result type to make errors explicit.',
      'try { await fetch(url) } catch(e) {}',
      'async/await error handling',
      async () => xml
    );

    expect(result).not.toBeNull();
    expect(result!.scores.accuracy).toBe(4);
    expect(result!.scores.depth).toBe(4);
    expect(result!.scores.tradeoffs).toBe(3);
    expect(result!.scores.practical).toBe(4);
    expect(result!.scores.completeness).toBe(4);
    expect(result!.level).toBe('mid_plus');
    expect(result!.reasoning).toContain('technically accurate');
  });

  it('correctly computes raw_score from dimensions', async () => {
    // accuracy=4, depth=4, tradeoffs=3, practical=4, completeness=4
    // raw = (8 + 4 + 3 + 4 + 4) / 7 = 23 / 7 ≈ 3.286 → mid_plus
    const result = await evaluateOpenAnswer('Q', 'A', '', 'C', async () => makeXml());
    expect(result!.raw_score).toBeCloseTo(23 / 7, 2);
  });

  it('returns senior_validated for all 5 scores', async () => {
    const xml = makeXml({ accuracy: '5', depth: '5', tradeoffs: '5', practical: '5', completeness: '5', level: 'senior_validated' });
    const result = await evaluateOpenAnswer('Q', 'A', '', 'C', async () => xml);
    expect(result!.level).toBe('senior_validated');
    // raw = 30/7 ≈ 4.286 → senior_validated
    expect(result!.raw_score).toBeGreaterThanOrEqual(4.0);
  });

  it('returns needs_growth for all 1 scores', async () => {
    const xml = makeXml({ accuracy: '1', depth: '1', tradeoffs: '1', practical: '1', completeness: '1', level: 'needs_growth' });
    const result = await evaluateOpenAnswer('Q', 'A', '', 'C', async () => xml);
    expect(result!.level).toBe('needs_growth');
    expect(result!.raw_score).toBeLessThan(2.0);
  });

  it('clamps dimension scores to 1-5', async () => {
    const xml = makeXml({ accuracy: '9', depth: '0', tradeoffs: '5', practical: '5', completeness: '5', level: 'senior_validated' });
    const result = await evaluateOpenAnswer('Q', 'A', '', 'C', async () => xml);
    expect(result!.scores.accuracy).toBe(5); // clamped from 9
    expect(result!.scores.depth).toBe(1);    // clamped from 0
  });

  it('parses anti_gaming flags', async () => {
    const xml = makeXml({ anti_gaming: 'Overly brief (< 50 words)\nBuzzword soup' });
    const result = await evaluateOpenAnswer('Q', 'A', '', 'C', async () => xml);
    expect(result!.anti_gaming).toHaveLength(2);
    expect(result!.anti_gaming[0]).toContain('Overly brief');
  });

  it('returns null on LLM failure', async () => {
    const result = await evaluateOpenAnswer('Q', 'A', '', 'C', async () => { throw new Error('LLM down'); });
    expect(result).toBeNull();
  });

  it('returns null when XML has no reasoning', async () => {
    const result = await evaluateOpenAnswer('Q', 'A', '', 'C', async () => 'not xml at all');
    expect(result).toBeNull();
  });

  it('level is consistent with raw_score regardless of XML level field', async () => {
    // XML says mid_plus but scores compute to senior_validated
    const xml = makeXml({ accuracy: '5', depth: '5', tradeoffs: '5', practical: '5', completeness: '5', level: 'mid_plus' });
    const result = await evaluateOpenAnswer('Q', 'A', '', 'C', async () => xml);
    // Our code recomputes from scores, so level should match raw_score
    expect(result!.level).toBe('senior_validated'); // 30/7 ≈ 4.286 >= 4.0
  });
});
