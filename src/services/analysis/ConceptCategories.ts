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
  // Catch-all
  'general',
] as const;

// ─── Alias map ────────────────────────────────────────────────────────────────

/**
 * Map raw LLM output (or user input) to a canonical category name.
 * Keys should be lowercase.
 */
const ALIASES: Record<string, string> = {
  // Frontend framework aliases
  'react': 'react_pattern',
  'css': 'react_pattern',
  'vue': 'react_pattern',
  'angular': 'react_pattern',
  'svelte': 'react_pattern',
  'hooks': 'react_pattern',
  // Type system aliases
  'typescript': 'type_system',
  'ts': 'type_system',
  // Architecture / platform aliases
  'nodejs': 'architecture_pattern',
  'node': 'architecture_pattern',
  'node.js': 'architecture_pattern',
  'js': 'architecture_pattern',
  'javascript': 'architecture_pattern',
  'performance': 'architecture_pattern',
  'docker': 'architecture_pattern',
  'devops': 'architecture_pattern',
  'ci': 'architecture_pattern',
  'ci-cd': 'architecture_pattern',
  'ci/cd': 'architecture_pattern',
  'kubernetes': 'architecture_pattern',
  'k8s': 'architecture_pattern',
  'containerization': 'architecture_pattern',
  'python': 'architecture_pattern',
  'rust': 'architecture_pattern',
  'csharp': 'architecture_pattern',
  'c#': 'architecture_pattern',
  // Design / algorithm pattern aliases
  'pattern': 'design_pattern',
  'patterns': 'design_pattern',
  'design-pattern': 'design_pattern',
  'algorithms': 'design_pattern',
  'algorithm': 'design_pattern',
  'data-structures': 'design_pattern',
  'data_structures': 'design_pattern',
  // Database aliases
  'database': 'database_pattern',
  'db': 'database_pattern',
  // Security aliases
  'auth': 'security',
  'authentication': 'security',
  // API aliases
  'api': 'api_design',
  'rest': 'api_design',
  'graphql': 'api_design',
  'networking': 'api_design',
  // State management aliases
  'redux': 'state_management',
  // Async aliases
  'async': 'async_pattern',
  'async_await': 'async_pattern',
  'async-await': 'async_pattern',
  // Concurrency aliases
  'concurrent': 'concurrency',
  'thread': 'concurrency',
  'parallel': 'concurrency',
  'go': 'concurrency',
  // OOP aliases
  'oop': 'oop_pattern',
  'class': 'oop_pattern',
  // Functional aliases
  'functional': 'functional_pattern',
  'fp': 'functional_pattern',
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
