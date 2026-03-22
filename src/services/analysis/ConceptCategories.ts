/**
 * ConceptCategories
 *
 * Single source of truth for all concept categories used in the
 * ConceptExtractor LLM prompt and in normalizeCategory().
 *
 * Adding a category here automatically propagates it to:
 *   1. The LLM prompt (via CONCEPT_CATEGORIES_PROMPT_STRING)
 *   2. The normalizeCategory() fallback used when parsing LLM output
 */

// ─── Canonical category list ──────────────────────────────────────────────────

export const CONCEPT_CATEGORIES: readonly string[] = [
  // Frontend frameworks
  'react',
  'vue',
  'angular',
  'svelte',
  // Languages
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'java',
  'csharp',
  // Runtime / platform
  'nodejs',
  // Patterns & architecture
  'design-pattern',
  'algorithms',
  'data-structures',
  // Data layer
  'database',
  'state-management',
  // APIs & networking
  'api',
  'networking',
  // Infrastructure
  'docker',
  'devops',
  // Cross-cutting concerns
  'auth',
  'security',
  'performance',
  'testing',
  // Tooling
  'css',
  'git',
  // Catch-all
  'general',
] as const;

// ─── Alias map ────────────────────────────────────────────────────────────────

/**
 * Map raw LLM output (or user input) to a canonical category name.
 * Keys should be lowercase.
 */
const ALIASES: Record<string, string> = {
  // nodejs aliases
  'node': 'nodejs',
  'node.js': 'nodejs',
  // typescript aliases
  'ts': 'typescript',
  // javascript aliases
  'js': 'javascript',
  // design-pattern aliases
  'pattern': 'design-pattern',
  'patterns': 'design-pattern',
  'design_pattern': 'design-pattern',
  // docker / container aliases
  'kubernetes': 'docker',
  'k8s': 'docker',
  'containerization': 'docker',
  'containers': 'docker',
  // devops / CI-CD aliases
  'ci': 'devops',
  'cd': 'devops',
  'ci-cd': 'devops',
  'ci/cd': 'devops',
  'cicd': 'devops',
  // c# aliases
  'c#': 'csharp',
  'dotnet': 'csharp',
  '.net': 'csharp',
};

// ─── Normalizer ───────────────────────────────────────────────────────────────

const VALID_SET = new Set(CONCEPT_CATEGORIES);

/**
 * Normalize a raw category string from LLM output to a canonical category.
 *
 * 1. Lowercase + trim
 * 2. Check alias map
 * 3. Check canonical set
 * 4. Fall back to 'general'
 */
export function normalizeCategory(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return 'general';
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return 'general';
  if (VALID_SET.has(normalized)) return normalized;
  if (ALIASES[normalized]) return ALIASES[normalized];
  return 'general';
}

// ─── Prompt helper ────────────────────────────────────────────────────────────

/**
 * Comma-separated category list for inclusion in the LLM extraction prompt.
 * Does not include 'general' — that's the fallback, not a prompt option.
 */
export const CONCEPT_CATEGORIES_PROMPT_STRING: string = CONCEPT_CATEGORIES
  .filter(c => c !== 'general')
  .join(', ');
