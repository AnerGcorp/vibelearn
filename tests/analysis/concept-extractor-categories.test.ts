/**
 * ConceptExtractor category validation tests
 *
 * Verifies that the CONCEPT_CATEGORIES list is comprehensive and that
 * normalizeCategory correctly handles known values, aliases, and unknowns.
 */

import { describe, it, expect } from 'bun:test';
import { CONCEPT_CATEGORIES, normalizeCategory } from '../../src/services/analysis/ConceptCategories.js';

describe('CONCEPT_CATEGORIES', () => {
  it('contains all 14 taxonomy categories', () => {
    const taxonomy = [
      'async_pattern',
      'error_handling',
      'design_pattern',
      'architecture_pattern',
      'oop_pattern',
      'functional_pattern',
      'concurrency',
      'database_pattern',
      'api_design',
      'testing',
      'security',
      'state_management',
      'type_system',
      'react_pattern',
    ];
    for (const cat of taxonomy) {
      expect(CONCEPT_CATEGORIES).toContain(cat);
    }
  });

  it('contains async_pattern', () => expect(CONCEPT_CATEGORIES).toContain('async_pattern'));
  it('contains error_handling', () => expect(CONCEPT_CATEGORIES).toContain('error_handling'));
  it('contains design_pattern', () => expect(CONCEPT_CATEGORIES).toContain('design_pattern'));
  it('contains architecture_pattern', () => expect(CONCEPT_CATEGORIES).toContain('architecture_pattern'));
  it('contains oop_pattern', () => expect(CONCEPT_CATEGORIES).toContain('oop_pattern'));
  it('contains functional_pattern', () => expect(CONCEPT_CATEGORIES).toContain('functional_pattern'));
  it('contains concurrency', () => expect(CONCEPT_CATEGORIES).toContain('concurrency'));
  it('contains database_pattern', () => expect(CONCEPT_CATEGORIES).toContain('database_pattern'));
  it('contains api_design', () => expect(CONCEPT_CATEGORIES).toContain('api_design'));
  it('contains testing', () => expect(CONCEPT_CATEGORIES).toContain('testing'));
  it('contains security', () => expect(CONCEPT_CATEGORIES).toContain('security'));
  it('contains state_management', () => expect(CONCEPT_CATEGORIES).toContain('state_management'));
  it('contains type_system', () => expect(CONCEPT_CATEGORIES).toContain('type_system'));
  it('contains react_pattern', () => expect(CONCEPT_CATEGORIES).toContain('react_pattern'));

  it('has no duplicates', () => {
    const set = new Set(CONCEPT_CATEGORIES);
    expect(set.size).toBe(CONCEPT_CATEGORIES.length);
  });

  it('all entries are lowercase snake_case or simple lowercase', () => {
    for (const cat of CONCEPT_CATEGORIES) {
      expect(cat).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('normalizeCategory', () => {
  it('returns the category unchanged when it is a valid taxonomy value', () => {
    expect(normalizeCategory('async_pattern')).toBe('async_pattern');
    expect(normalizeCategory('type_system')).toBe('type_system');
    expect(normalizeCategory('react_pattern')).toBe('react_pattern');
    expect(normalizeCategory('concurrency')).toBe('concurrency');
    expect(normalizeCategory('testing')).toBe('testing');
    expect(normalizeCategory('security')).toBe('security');
  });

  it('is case-insensitive', () => {
    expect(normalizeCategory('Testing')).toBe('testing');
    expect(normalizeCategory('SECURITY')).toBe('security');
    expect(normalizeCategory('Concurrency')).toBe('concurrency');
  });

  it('maps language/framework aliases to taxonomy categories', () => {
    expect(normalizeCategory('react')).toBe('react_pattern');
    expect(normalizeCategory('typescript')).toBe('type_system');
    expect(normalizeCategory('ts')).toBe('type_system');
    expect(normalizeCategory('nodejs')).toBe('architecture_pattern');
    expect(normalizeCategory('node')).toBe('architecture_pattern');
    expect(normalizeCategory('node.js')).toBe('architecture_pattern');
    expect(normalizeCategory('js')).toBe('architecture_pattern');
    expect(normalizeCategory('javascript')).toBe('architecture_pattern');
    expect(normalizeCategory('python')).toBe('architecture_pattern');
    expect(normalizeCategory('go')).toBe('concurrency');
    expect(normalizeCategory('rust')).toBe('architecture_pattern');
    expect(normalizeCategory('csharp')).toBe('architecture_pattern');
    expect(normalizeCategory('c#')).toBe('architecture_pattern');
  });

  it('maps design/algorithm aliases', () => {
    expect(normalizeCategory('pattern')).toBe('design_pattern');
    expect(normalizeCategory('patterns')).toBe('design_pattern');
    expect(normalizeCategory('design-pattern')).toBe('design_pattern');
    expect(normalizeCategory('algorithms')).toBe('design_pattern');
    expect(normalizeCategory('algorithm')).toBe('design_pattern');
    expect(normalizeCategory('data-structures')).toBe('design_pattern');
    expect(normalizeCategory('data_structures')).toBe('design_pattern');
  });

  it('maps database aliases', () => {
    expect(normalizeCategory('database')).toBe('database_pattern');
    expect(normalizeCategory('db')).toBe('database_pattern');
  });

  it('maps security aliases', () => {
    expect(normalizeCategory('auth')).toBe('security');
    expect(normalizeCategory('authentication')).toBe('security');
  });

  it('maps API aliases', () => {
    expect(normalizeCategory('api')).toBe('api_design');
    expect(normalizeCategory('rest')).toBe('api_design');
    expect(normalizeCategory('graphql')).toBe('api_design');
    expect(normalizeCategory('networking')).toBe('api_design');
  });

  it('maps infrastructure aliases to architecture_pattern', () => {
    expect(normalizeCategory('docker')).toBe('architecture_pattern');
    expect(normalizeCategory('devops')).toBe('architecture_pattern');
    expect(normalizeCategory('ci')).toBe('architecture_pattern');
    expect(normalizeCategory('ci-cd')).toBe('architecture_pattern');
    expect(normalizeCategory('ci/cd')).toBe('architecture_pattern');
    expect(normalizeCategory('kubernetes')).toBe('architecture_pattern');
    expect(normalizeCategory('k8s')).toBe('architecture_pattern');
    expect(normalizeCategory('containerization')).toBe('architecture_pattern');
    expect(normalizeCategory('performance')).toBe('architecture_pattern');
  });

  it('maps async aliases', () => {
    expect(normalizeCategory('async')).toBe('async_pattern');
    expect(normalizeCategory('async_await')).toBe('async_pattern');
    expect(normalizeCategory('async-await')).toBe('async_pattern');
  });

  it('maps concurrency aliases', () => {
    expect(normalizeCategory('concurrent')).toBe('concurrency');
    expect(normalizeCategory('thread')).toBe('concurrency');
    expect(normalizeCategory('parallel')).toBe('concurrency');
  });

  it('maps OOP aliases', () => {
    expect(normalizeCategory('oop')).toBe('oop_pattern');
    expect(normalizeCategory('class')).toBe('oop_pattern');
  });

  it('maps functional aliases', () => {
    expect(normalizeCategory('functional')).toBe('functional_pattern');
    expect(normalizeCategory('fp')).toBe('functional_pattern');
  });

  it('maps state management aliases', () => {
    expect(normalizeCategory('redux')).toBe('state_management');
  });

  it('maps frontend framework aliases to react_pattern', () => {
    expect(normalizeCategory('vue')).toBe('react_pattern');
    expect(normalizeCategory('angular')).toBe('react_pattern');
    expect(normalizeCategory('svelte')).toBe('react_pattern');
    expect(normalizeCategory('css')).toBe('react_pattern');
    expect(normalizeCategory('hooks')).toBe('react_pattern');
  });

  it('returns "general" for completely unknown categories', () => {
    expect(normalizeCategory('foobar')).toBe('general');
    expect(normalizeCategory('')).toBe('general');
    expect(normalizeCategory('   ')).toBe('general');
  });

  it('returns "general" for undefined/null-like input', () => {
    expect(normalizeCategory(undefined as unknown as string)).toBe('general');
  });
});
