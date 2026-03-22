/**
 * POC data asset integrity tests
 *
 * Validates the structure of concept_taxonomy.json and senior_rubric.json
 * copied from the belearn POC project. These are the canonical data sources
 * used by ConceptExtractor, QuizGenerator, and SeniorRubric.
 */

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(import.meta.url), '../../..');
const DATA_DIR = join(__dirname, 'src/data');

// ─── concept_taxonomy.json ────────────────────────────────────────────────────

describe('concept_taxonomy.json', () => {
  const raw = readFileSync(join(DATA_DIR, 'concept_taxonomy.json'), 'utf-8');
  const taxonomy = JSON.parse(raw);

  it('parses as valid JSON', () => {
    expect(taxonomy).toBeDefined();
  });

  it('has version field', () => {
    expect(taxonomy.version).toBeDefined();
  });

  it('has total_concepts >= 60', () => {
    expect(taxonomy.total_concepts).toBeGreaterThanOrEqual(60);
  });

  it('concepts array length matches total_concepts', () => {
    expect(Array.isArray(taxonomy.concepts)).toBe(true);
    expect(taxonomy.concepts.length).toBe(taxonomy.total_concepts);
  });

  it('has the 14 canonical categories', () => {
    const expected = [
      'async_pattern', 'error_handling', 'design_pattern', 'architecture_pattern',
      'oop_pattern', 'functional_pattern', 'concurrency', 'database_pattern',
      'api_design', 'testing', 'security', 'state_management', 'type_system', 'react_pattern'
    ];
    for (const cat of expected) {
      expect(taxonomy.categories).toContain(cat);
    }
  });

  it('has the 7 question types', () => {
    const expected = [
      'multiple_choice', 'code_reading', 'spot_the_bug',
      'fill_in_the_blank', 'open_ended', 'true_false', 'ordering'
    ];
    for (const qt of expected) {
      expect(taxonomy.question_types).toContain(qt);
    }
  });

  it('difficulty_levels are junior/mid/senior', () => {
    expect(taxonomy.difficulty_levels).toContain('junior');
    expect(taxonomy.difficulty_levels).toContain('mid');
    expect(taxonomy.difficulty_levels).toContain('senior');
  });

  it('each concept has required fields', () => {
    for (const concept of taxonomy.concepts) {
      expect(typeof concept.id).toBe('string');
      expect(typeof concept.concept_name).toBe('string');
      expect(typeof concept.category).toBe('string');
      expect(typeof concept.description).toBe('string');
      expect(Array.isArray(concept.languages)).toBe(true);
      expect(Array.isArray(concept.detection_signals)).toBe(true);
      expect(typeof concept.question_types).toBe('object');
      expect(concept.question_types).toHaveProperty('junior');
      expect(concept.question_types).toHaveProperty('mid');
      expect(concept.question_types).toHaveProperty('senior');
    }
  });

  it('all concept categories are in the category list', () => {
    const validCats = new Set(taxonomy.categories);
    for (const concept of taxonomy.concepts) {
      expect(validCats.has(concept.category)).toBe(true);
    }
  });

  it('all concept question_types reference valid types', () => {
    const validTypes = new Set(taxonomy.question_types);
    for (const concept of taxonomy.concepts) {
      for (const [difficulty, qtype] of Object.entries(concept.question_types)) {
        expect(validTypes.has(qtype as string)).toBe(true);
      }
    }
  });

  it('no duplicate concept ids', () => {
    const ids = taxonomy.concepts.map((c: { id: string }) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ─── senior_rubric.json ───────────────────────────────────────────────────────

describe('senior_rubric.json', () => {
  const raw = readFileSync(join(DATA_DIR, 'senior_rubric.json'), 'utf-8');
  const rubric = JSON.parse(raw);

  it('parses as valid JSON', () => {
    expect(rubric).toBeDefined();
  });

  it('has system_prompt', () => {
    expect(typeof rubric.system_prompt).toBe('string');
    expect(rubric.system_prompt.length).toBeGreaterThan(100);
  });

  it('has tool_schema with evaluate_senior_answer', () => {
    expect(rubric.tool_schema).toBeDefined();
    expect(rubric.tool_schema.name).toBe('evaluate_senior_answer');
  });

  it('tool_schema has all 5 scoring dimensions', () => {
    const props = rubric.tool_schema.input_schema.properties;
    expect(props).toHaveProperty('accuracy');
    expect(props).toHaveProperty('depth');
    expect(props).toHaveProperty('tradeoffs');
    expect(props).toHaveProperty('practical');
    expect(props).toHaveProperty('completeness');
  });

  it('tool_schema has anti_gaming and level fields', () => {
    const props = rubric.tool_schema.input_schema.properties;
    expect(props).toHaveProperty('anti_gaming');
    expect(props).toHaveProperty('level');
    expect(props.level.enum).toContain('senior_validated');
    expect(props.level.enum).toContain('mid_plus');
    expect(props.level.enum).toContain('mid');
    expect(props.level.enum).toContain('needs_growth');
  });

  it('level_thresholds are defined', () => {
    expect(rubric.level_thresholds).toBeDefined();
    expect(rubric.level_thresholds).toHaveProperty('senior_validated');
  });

  it('calibration_results show ordering_correct = 3', () => {
    expect(rubric.calibration_results.ordering_correct).toBe(3);
    expect(rubric.calibration_results.total_questions).toBe(3);
  });
});
