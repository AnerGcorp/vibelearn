/**
 * ConceptExtractor tests
 *
 * Tests the XML parsing, confidence filtering, and concept extraction pipeline.
 * All tests use the public extractConcepts() function with a mock agentRunner.
 */

import { describe, it, expect } from 'bun:test';
import { extractConcepts } from '../../src/services/analysis/ConceptExtractor.js';
import type { StackProfile } from '../../src/services/analysis/StackDetector.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STACK: StackProfile = {
  session_id: 'test-session',
  framework: 'Next.js',
  orm: 'Prisma',
  testing: null,
  auth: null,
  styling: null,
  language_json: '["TypeScript"]',
  confidence: 1.0,
  detected_at: Math.floor(Date.now() / 1000),
};

const FILE_STATS = { created: 2, edited: 3 };
const CODE_PATTERNS = [
  { pattern_type: 'async_error_handling', name: 'try-catch in async context', file_path: 'src/api.ts', line_number: 12, snippet: 'try { await db.query() }' },
  { pattern_type: 'typescript_interface', name: 'UserProfile', file_path: 'src/types.ts', line_number: 5, snippet: 'export interface UserProfile {' },
];

function makeXml(concepts: string, decisions = '<decision>Used Prisma ORM</decision>') {
  return `<analysis>
  <session_summary>
    <what_was_built>A REST API with authentication</what_was_built>
    <developer_intent>Build user management endpoints</developer_intent>
    <architecture_decisions>${decisions}</architecture_decisions>
  </session_summary>
  <concepts>
${concepts}
  </concepts>
</analysis>`;
}

function conceptXml(overrides: Record<string, string> = {}) {
  const defaults = {
    name: 'async/await error handling',
    category: 'error_handling',
    difficulty: 'mid',
    source_file: 'src/api.ts',
    snippet: 'try { await db.query() } catch(e) {}',
    why_it_matters: 'Async errors are silently swallowed without explicit catch.',
    confidence: '0.85',
  };
  const vals = { ...defaults, ...overrides };
  return `    <concept>
      <name>${vals.name}</name>
      <category>${vals.category}</category>
      <difficulty>${vals.difficulty}</difficulty>
      <source_file>${vals.source_file}</source_file>
      <snippet>${vals.snippet}</snippet>
      <why_it_matters>${vals.why_it_matters}</why_it_matters>
      <confidence>${vals.confidence}</confidence>
    </concept>`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extractConcepts — parsing', () => {
  it('parses a valid XML response into concepts and summary', async () => {
    const xml = makeXml(conceptXml());
    const runner = async () => xml;

    const result = await extractConcepts('s1', 'MyApp', 'last msg', STACK, CODE_PATTERNS, FILE_STATS, 30, runner);

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].concept_name).toBe('async/await error handling');
    expect(result.concepts[0].category).toBe('error_handling');
    expect(result.concepts[0].difficulty).toBe('mid');
    expect(result.concepts[0].confidence).toBeCloseTo(0.85, 2);
  });

  it('parses session summary fields', async () => {
    const xml = makeXml(conceptXml());
    const runner = async () => xml;

    const result = await extractConcepts('s1', 'MyApp', 'last msg', STACK, CODE_PATTERNS, FILE_STATS, 45, runner);

    expect(result.summary.what_was_built).toBe('A REST API with authentication');
    expect(result.summary.developer_intent).toBe('Build user management endpoints');
    expect(JSON.parse(result.summary.architecture_decisions_json)).toContain('Used Prisma ORM');
    expect(result.summary.session_duration_minutes).toBe(45);
    expect(result.summary.files_created).toBe(2);
    expect(result.summary.files_edited).toBe(3);
  });

  it('normalizes category via alias map', async () => {
    const xml = makeXml(conceptXml({ category: 'typescript' }));
    const result = await extractConcepts('s1', 'MyApp', '', STACK, CODE_PATTERNS, FILE_STATS, 10, async () => xml);
    expect(result.concepts[0].category).toBe('type_system');
  });

  it('normalizes alias in category field', async () => {
    const xml = makeXml(conceptXml({ category: 'auth' }));
    const result = await extractConcepts('s1', 'MyApp', '', STACK, CODE_PATTERNS, FILE_STATS, 10, async () => xml);
    expect(result.concepts[0].category).toBe('security');
  });

  it('falls back to "general" for unknown category', async () => {
    const xml = makeXml(conceptXml({ category: 'unknownstuff' }));
    const result = await extractConcepts('s1', 'MyApp', '', STACK, CODE_PATTERNS, FILE_STATS, 10, async () => xml);
    expect(result.concepts[0].category).toBe('general');
  });

  it('uses "mid" as default difficulty for unrecognized values', async () => {
    const xml = makeXml(conceptXml({ difficulty: 'intermediate' })); // old value
    const result = await extractConcepts('s1', 'MyApp', '', STACK, CODE_PATTERNS, FILE_STATS, 10, async () => xml);
    expect(result.concepts[0].difficulty).toBe('mid');
  });

  it('accepts junior difficulty', async () => {
    const xml = makeXml(conceptXml({ difficulty: 'junior' }));
    const result = await extractConcepts('s1', 'MyApp', '', STACK, CODE_PATTERNS, FILE_STATS, 10, async () => xml);
    expect(result.concepts[0].difficulty).toBe('junior');
  });

  it('accepts senior difficulty', async () => {
    const xml = makeXml(conceptXml({ difficulty: 'senior' }));
    const result = await extractConcepts('s1', 'MyApp', '', STACK, CODE_PATTERNS, FILE_STATS, 10, async () => xml);
    expect(result.concepts[0].difficulty).toBe('senior');
  });

  it('parses confidence with trailing text (e.g. "0.9 — highly certain")', async () => {
    const xml = makeXml(conceptXml({ confidence: '0.9 — highly certain it appeared' }));
    const result = await extractConcepts('s1', 'MyApp', '', STACK, CODE_PATTERNS, FILE_STATS, 10, async () => xml);
    expect(result.concepts[0].confidence).toBeCloseTo(0.9, 1);
  });

  it('parses multiple concepts', async () => {
    const xml = makeXml(
      conceptXml({ name: 'Concept A', confidence: '0.9' }) + '\n' +
      conceptXml({ name: 'Concept B', confidence: '0.7' })
    );
    const result = await extractConcepts('s1', 'MyApp', '', STACK, CODE_PATTERNS, FILE_STATS, 10, async () => xml);
    expect(result.concepts).toHaveLength(2);
    expect(result.concepts.map(c => c.concept_name)).toContain('Concept A');
    expect(result.concepts.map(c => c.concept_name)).toContain('Concept B');
  });
});

describe('extractConcepts — confidence filtering', () => {
  it('includes concepts with confidence >= 0.4', async () => {
    const xml = makeXml(conceptXml({ confidence: '0.4' }));
    const result = await extractConcepts('s1', 'MyApp', '', STACK, [], FILE_STATS, 10, async () => xml);
    expect(result.concepts).toHaveLength(1);
  });

  it('excludes concepts below confidence 0.4', async () => {
    const xml = makeXml(conceptXml({ confidence: '0.3' }));
    const result = await extractConcepts('s1', 'MyApp', '', STACK, [], FILE_STATS, 10, async () => xml);
    expect(result.concepts).toHaveLength(0);
  });

  it('excludes confidence exactly 0.39', async () => {
    const xml = makeXml(conceptXml({ confidence: '0.39' }));
    const result = await extractConcepts('s1', 'MyApp', '', STACK, [], FILE_STATS, 10, async () => xml);
    expect(result.concepts).toHaveLength(0);
  });

  it('clamps confidence above 1.0 to 1.0', async () => {
    const xml = makeXml(conceptXml({ confidence: '1.5' }));
    const result = await extractConcepts('s1', 'MyApp', '', STACK, [], FILE_STATS, 10, async () => xml);
    expect(result.concepts[0].confidence).toBe(1.0);
  });
});

describe('extractConcepts — error recovery', () => {
  it('returns empty result on LLM failure', async () => {
    const runner = async (): Promise<string> => { throw new Error('LLM timeout'); };
    const result = await extractConcepts('s1', 'MyApp', '', STACK, [], FILE_STATS, 10, runner);

    expect(result.concepts).toHaveLength(0);
    expect(result.summary.concepts_json).toBe('[]');
    expect(result.summary.what_was_built).toContain('Analysis failed');
  });

  it('returns empty result on malformed XML', async () => {
    const runner = async () => 'not xml at all';
    const result = await extractConcepts('s1', 'MyApp', '', STACK, [], FILE_STATS, 10, runner);

    // Malformed XML still parses with regex — summary gets defaults, concepts empty
    expect(result.concepts).toHaveLength(0);
    expect(result.summary).toBeDefined();
  });

  it('assigns unique IDs to each concept', async () => {
    const xml = makeXml(
      conceptXml({ name: 'A', confidence: '0.8' }) + '\n' +
      conceptXml({ name: 'B', confidence: '0.8' })
    );
    const result = await extractConcepts('s1', 'MyApp', '', STACK, [], FILE_STATS, 10, async () => xml);
    const ids = result.concepts.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
