/**
 * ConceptExtractor category validation tests
 *
 * Verifies that the CONCEPT_CATEGORIES list is comprehensive and that
 * normalizeCategory correctly handles known values, aliases, and unknowns.
 */

import { describe, it, expect } from 'bun:test';
import { CONCEPT_CATEGORIES, normalizeCategory } from '../../src/services/analysis/ConceptCategories.js';

describe('CONCEPT_CATEGORIES', () => {
  it('contains the original 12 categories', () => {
    const original = [
      'design-pattern', 'react', 'typescript', 'nodejs',
      'database', 'auth', 'testing', 'api',
      'state-management', 'performance', 'security', 'algorithms',
    ];
    for (const cat of original) {
      expect(CONCEPT_CATEGORIES).toContain(cat);
    }
  });

  it('contains python', () => expect(CONCEPT_CATEGORIES).toContain('python'));
  it('contains go', () => expect(CONCEPT_CATEGORIES).toContain('go'));
  it('contains rust', () => expect(CONCEPT_CATEGORIES).toContain('rust'));
  it('contains vue', () => expect(CONCEPT_CATEGORIES).toContain('vue'));
  it('contains angular', () => expect(CONCEPT_CATEGORIES).toContain('angular'));
  it('contains devops', () => expect(CONCEPT_CATEGORIES).toContain('devops'));
  it('contains docker', () => expect(CONCEPT_CATEGORIES).toContain('docker'));
  it('contains data-structures', () => expect(CONCEPT_CATEGORIES).toContain('data-structures'));
  it('contains networking', () => expect(CONCEPT_CATEGORIES).toContain('networking'));
  it('contains css', () => expect(CONCEPT_CATEGORIES).toContain('css'));
  it('contains git', () => expect(CONCEPT_CATEGORIES).toContain('git'));

  it('has no duplicates', () => {
    const set = new Set(CONCEPT_CATEGORIES);
    expect(set.size).toBe(CONCEPT_CATEGORIES.length);
  });

  it('all entries are lowercase kebab-case', () => {
    for (const cat of CONCEPT_CATEGORIES) {
      expect(cat).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});

describe('normalizeCategory', () => {
  it('returns the category unchanged when it is valid', () => {
    expect(normalizeCategory('react')).toBe('react');
    expect(normalizeCategory('typescript')).toBe('typescript');
    expect(normalizeCategory('python')).toBe('python');
  });

  it('is case-insensitive', () => {
    expect(normalizeCategory('React')).toBe('react');
    expect(normalizeCategory('TYPESCRIPT')).toBe('typescript');
    expect(normalizeCategory('NodeJS')).toBe('nodejs');
  });

  it('maps common aliases to canonical names', () => {
    expect(normalizeCategory('node')).toBe('nodejs');
    expect(normalizeCategory('node.js')).toBe('nodejs');
    expect(normalizeCategory('ts')).toBe('typescript');
    expect(normalizeCategory('js')).toBe('javascript');
    expect(normalizeCategory('javascript')).toBe('javascript');
    expect(normalizeCategory('pattern')).toBe('design-pattern');
    expect(normalizeCategory('patterns')).toBe('design-pattern');
    expect(normalizeCategory('ci')).toBe('devops');
    expect(normalizeCategory('ci-cd')).toBe('devops');
    expect(normalizeCategory('ci/cd')).toBe('devops');
    expect(normalizeCategory('kubernetes')).toBe('docker');
    expect(normalizeCategory('k8s')).toBe('docker');
    expect(normalizeCategory('containerization')).toBe('docker');
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
