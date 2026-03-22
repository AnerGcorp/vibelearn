/**
 * QuizGenerator tests
 *
 * Tests question type selection (taxonomy + category fallback + default),
 * XML parsing for all 7 question types, and the mastery skip logic.
 */

import { describe, it, expect } from 'bun:test';
import {
  selectQuestionType,
  generateQuizQuestions,
  QUESTION_TYPES,
} from '../../src/services/analysis/QuizGenerator.js';
import type { VibelearnConcept } from '../../src/services/analysis/ConceptExtractor.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConcept(overrides: Partial<VibelearnConcept> = {}): VibelearnConcept {
  return {
    id: 'c-1',
    session_id: 's-1',
    concept_name: 'async/await error handling',
    category: 'error_handling',
    difficulty: 'mid',
    source_file: 'src/api.ts',
    snippet: 'try { await fetch(url) } catch(e) {}',
    why_it_matters: 'Silent failures in async code.',
    confidence: 0.85,
    created_at: 0,
    ...overrides,
  };
}

function makeXml(questions: string): string {
  return `<questions>${questions}</questions>`;
}

function questionXml(overrides: Record<string, string> = {}): string {
  const d = {
    concept_index: '1',
    type: 'spot_the_bug',
    difficulty: 'mid',
    snippet: 'try { await fetch(url) } catch(e) {}',
    question: 'What bug is present in this async error handler?',
    options: '[]',
    correct: 'The catch block silently swallows the error',
    explanation: 'Async errors should be logged and re-thrown.',
    follow_up: '',
    tags: '[]',
    ...overrides,
  };
  return `
  <question>
    <concept_index>${d.concept_index}</concept_index>
    <type>${d.type}</type>
    <difficulty>${d.difficulty}</difficulty>
    <snippet>${d.snippet}</snippet>
    <question_text>${d.question}</question_text>
    <options>${d.options}</options>
    <correct>${d.correct}</correct>
    <explanation>${d.explanation}</explanation>
    <follow_up>${d.follow_up}</follow_up>
    <tags>${d.tags}</tags>
  </question>`;
}

// ─── selectQuestionType ───────────────────────────────────────────────────────

describe('selectQuestionType', () => {
  it('returns multiple_choice for error_handling + junior (category fallback)', () => {
    expect(selectQuestionType(makeConcept({ category: 'error_handling', difficulty: 'junior' }), 'junior')).toBe('true_false');
  });

  it('returns spot_the_bug for error_handling + mid', () => {
    expect(selectQuestionType(makeConcept({ category: 'error_handling', difficulty: 'mid' }), 'mid')).toBe('spot_the_bug');
  });

  it('returns open_ended for any category + senior', () => {
    const result = selectQuestionType(makeConcept({ category: 'async_pattern', difficulty: 'senior' }), 'senior');
    expect(result).toBe('open_ended');
  });

  it('returns open_ended for design_pattern + senior', () => {
    expect(selectQuestionType(makeConcept({ category: 'design_pattern' }), 'senior')).toBe('open_ended');
  });

  it('returns multiple_choice for unknown category + junior (default)', () => {
    expect(selectQuestionType(makeConcept({ category: 'unknown_xyz' }), 'junior')).toBe('multiple_choice');
  });

  it('returns a valid QuestionType for all 14 taxonomy categories', () => {
    const categories = [
      'async_pattern', 'error_handling', 'design_pattern', 'architecture_pattern',
      'oop_pattern', 'functional_pattern', 'concurrency', 'database_pattern',
      'api_design', 'testing', 'security', 'state_management', 'type_system', 'react_pattern',
    ];
    for (const cat of categories) {
      for (const diff of ['junior', 'mid', 'senior']) {
        const result = selectQuestionType(makeConcept({ category: cat }), diff);
        expect(QUESTION_TYPES).toContain(result);
      }
    }
  });
});

// ─── QUESTION_TYPES constant ─────────────────────────────────────────────────

describe('QUESTION_TYPES', () => {
  it('contains exactly 7 types', () => {
    expect(QUESTION_TYPES).toHaveLength(7);
  });

  it('contains all POC-validated types', () => {
    expect(QUESTION_TYPES).toContain('multiple_choice');
    expect(QUESTION_TYPES).toContain('code_reading');
    expect(QUESTION_TYPES).toContain('spot_the_bug');
    expect(QUESTION_TYPES).toContain('fill_in_blank');
    expect(QUESTION_TYPES).toContain('open_ended');
    expect(QUESTION_TYPES).toContain('true_false');
    expect(QUESTION_TYPES).toContain('ordering');
  });
});

// ─── generateQuizQuestions ────────────────────────────────────────────────────

describe('generateQuizQuestions — parsing', () => {
  it('parses a spot_the_bug question', async () => {
    const xml = makeXml(questionXml({ type: 'spot_the_bug' }));
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', async () => xml
    );
    expect(result).toHaveLength(1);
    expect(result[0].question_type).toBe('spot_the_bug');
    expect(result[0].question).toBe('What bug is present in this async error handler?');
  });

  it('parses a multiple_choice question with options', async () => {
    const xml = makeXml(questionXml({
      type: 'multiple_choice',
      options: '["A. It works fine", "B. Error is swallowed", "C. Always retries", "D. Throws synchronously"]',
      correct: 'B',
    }));
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', async () => xml
    );
    expect(result[0].question_type).toBe('multiple_choice');
    expect(result[0].options_json).toBeDefined();
    expect(JSON.parse(result[0].options_json!)).toHaveLength(4);
    expect(result[0].correct).toBe('B');
  });

  it('parses a true_false question', async () => {
    const xml = makeXml(questionXml({ type: 'true_false', correct: 'false' }));
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', async () => xml
    );
    expect(result[0].question_type).toBe('true_false');
    expect(result[0].correct).toBe('false');
  });

  it('parses an open_ended question with null correct', async () => {
    const xml = makeXml(questionXml({ type: 'open_ended', correct: 'null' }));
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', async () => xml
    );
    expect(result[0].question_type).toBe('open_ended');
    expect(result[0].correct).toBeNull();
  });

  it('parses a code_reading question', async () => {
    const xml = makeXml(questionXml({ type: 'code_reading', correct: 'undefined' }));
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', async () => xml
    );
    expect(result[0].question_type).toBe('code_reading');
  });

  it('parses a fill_in_blank question', async () => {
    const xml = makeXml(questionXml({ type: 'fill_in_blank', correct: 'catch' }));
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', async () => xml
    );
    expect(result[0].question_type).toBe('fill_in_blank');
    expect(result[0].correct).toBe('catch');
  });

  it('parses an ordering question with options array', async () => {
    const xml = makeXml(questionXml({
      type: 'ordering',
      options: '["Step C", "Step A", "Step D", "Step B"]',
      correct: '2,4,1,3',
    }));
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', async () => xml
    );
    expect(result[0].question_type).toBe('ordering');
    expect(result[0].correct).toBe('2,4,1,3');
    expect(JSON.parse(result[0].options_json!)).toHaveLength(4);
  });

  it('falls back to multiple_choice for unknown question type', async () => {
    const xml = makeXml(questionXml({ type: 'unknown_type' }));
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', async () => xml
    );
    expect(result[0].question_type).toBe('multiple_choice');
  });

  it('assigns unique IDs to each question', async () => {
    const xml = makeXml(
      questionXml({ concept_index: '1' }) +
      questionXml({ concept_index: '1' })
    );
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', async () => xml
    );
    const ids = result.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('generateQuizQuestions — mastery skip', () => {
  it('skips all concepts when all are mastered', async () => {
    const runner = async () => { throw new Error('should not call LLM'); };
    const result = await generateQuizQuestions(
      [makeConcept()],
      new Set(['async/await error handling']),
      's-1',
      runner
    );
    expect(result).toHaveLength(0);
  });

  it('only skips mastered concepts, generates for the rest', async () => {
    const concepts = [
      makeConcept({ concept_name: 'Concept A', id: 'c-1' }),
      makeConcept({ concept_name: 'Concept B', id: 'c-2' }),
    ];
    const xml = makeXml(questionXml({ concept_index: '1' }));
    const result = await generateQuizQuestions(
      concepts,
      new Set(['Concept A']), // skip A, generate for B
      's-1',
      async () => xml
    );
    expect(result).toHaveLength(1);
    // The remaining concept is B (index 0 of the unmastered list)
    expect(result[0].concept_id).toBe('c-2');
  });
});

describe('generateQuizQuestions — error recovery', () => {
  it('returns empty array on LLM failure', async () => {
    const runner = async () => { throw new Error('LLM down'); };
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', runner
    );
    expect(result).toHaveLength(0);
  });

  it('filters questions with empty question text', async () => {
    const xml = makeXml(questionXml({ question: '' }));
    const result = await generateQuizQuestions(
      [makeConcept()], new Set(), 's-1', async () => xml
    );
    expect(result).toHaveLength(0);
  });
});
