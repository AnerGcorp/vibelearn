/**
 * StaticAnalyzer
 *
 * Regex-based code pattern detection for TypeScript, JavaScript, Python, Go,
 * Rust, Ruby, and C# files observed during a session.
 *
 * Pattern set is aligned with the belearn POC (notebooks 02, 06–09), covering
 * the full taxonomy of 14 concept categories. Tree-sitter is not used; all
 * detection is regex-based to avoid native module issues across platforms.
 */

import { logger } from '../../utils/logger.js';

export interface CodePattern {
  pattern_type: string;
  name: string;
  file_path: string;
  line_number?: number;
  snippet: string;
}

/** Files larger than this are skipped to keep analysis fast */
const MAX_FILE_SIZE = 100 * 1024; // 100KB
/** Max lines to inspect per file */
const MAX_LINES = 200;

// ─── TypeScript / JavaScript ──────────────────────────────────────────────────

function detectTsPatterns(filePath: string, lines: string[]): CodePattern[] {
  const patterns: CodePattern[] = [];

  // Track file-level signals for multi-line patterns
  const fullContent = lines.join('\n');
  const hasOn = /\bon\s*\(/.test(fullContent);
  const hasEmit = /\bemit\s*\(/.test(fullContent);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n');

    // ── React hooks ──────────────────────────────────────────────────────────
    const hookMatch = line.match(/^\s*(?:export\s+)?(?:default\s+)?function\s+(use[A-Z]\w*)\s*\(/);
    if (hookMatch) {
      patterns.push({ pattern_type: 'custom_hook', name: hookMatch[1], file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    if (/\buseEffect\s*\(/.test(line)) {
      patterns.push({ pattern_type: 'react_hook', name: 'useEffect', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    if (/\buseReducer\s*\(/.test(line)) {
      patterns.push({ pattern_type: 'react_hook', name: 'useReducer', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    if (/\buseState\s*\(/.test(line)) {
      patterns.push({ pattern_type: 'react_hook', name: 'useState', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    if (/\buseCallback\s*\(|\buseMemo\s*\(/.test(line)) {
      const hookName = /useCallback/.test(line) ? 'useCallback' : 'useMemo';
      patterns.push({ pattern_type: 'react_hook', name: hookName, file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // ── React Server Components ───────────────────────────────────────────────
    if (line.includes("'use server'") || line.includes('"use server"')) {
      patterns.push({ pattern_type: 'server_action', name: 'React Server Action', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    if (line.includes("'use client'") || line.includes('"use client"')) {
      patterns.push({ pattern_type: 'client_component', name: 'React Client Component', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // ── State management ─────────────────────────────────────────────────────
    if (/\bcreateSlice\s*\(/.test(line)) {
      const nameMatch = line.match(/name:\s*['"](\w+)['"]/);
      patterns.push({ pattern_type: 'redux_slice', name: nameMatch ? `Redux slice: ${nameMatch[1]}` : 'Redux slice', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    if (/\bcreate\s*\(\s*\(\s*set/.test(line)) {
      patterns.push({ pattern_type: 'zustand_store', name: 'Zustand store', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // ── API routes ───────────────────────────────────────────────────────────
    const routeMatch = line.match(/^\s*(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)/);
    if (routeMatch) {
      patterns.push({ pattern_type: 'api_route', name: `${routeMatch[1].toUpperCase()} ${routeMatch[2]}`, file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    const nextRouteMatch = line.match(/^\s*export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/);
    if (nextRouteMatch) {
      patterns.push({ pattern_type: 'api_route', name: `Next.js ${nextRouteMatch[1]} handler`, file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // ── TypeScript types ─────────────────────────────────────────────────────
    const interfaceMatch = line.match(/^\s*(?:export\s+)?interface\s+(\w+)\s*(?:<[^>]*>)?\s*(?:extends\s+[^{]+)?\s*\{?/);
    if (interfaceMatch) {
      patterns.push({ pattern_type: 'typescript_interface', name: interfaceMatch[1], file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    const typeMatch = line.match(/^\s*(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/);
    if (typeMatch) {
      patterns.push({ pattern_type: 'typescript_type', name: typeMatch[1], file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // ── Classes and OOP ──────────────────────────────────────────────────────
    const classMatch = line.match(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      patterns.push({ pattern_type: 'class_definition', name: classMatch[1], file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Layered architecture: Repository/Service/Controller/Handler suffix
    if (/class\s+\w*(Repository|Service|Controller|Handler)\b/.test(line)) {
      const archMatch = line.match(/class\s+(\w*(Repository|Service|Controller|Handler))\b/);
      if (archMatch) {
        patterns.push({ pattern_type: 'layered_architecture', name: archMatch[1], file_path: filePath, line_number: lineNum, snippet: line.trim() });
      }
    }

    // ── Design patterns ──────────────────────────────────────────────────────
    if (/static\s+getInstance\s*\(\s*\)/.test(line) || /private\s+static\s+\w+\s*:\s*\w+.*=\s*null/.test(line)) {
      patterns.push({ pattern_type: 'singleton_pattern', name: 'Singleton pattern', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // ── Async patterns ───────────────────────────────────────────────────────
    if (/\basync\s+function|\basync\s*\(/.test(line)) {
      patterns.push({ pattern_type: 'async_function', name: 'async function', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    if (/\bawait\s+\w/.test(line)) {
      patterns.push({ pattern_type: 'await_expression', name: 'await', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    if (/\bPromise\.all\s*\(|\bPromise\.allSettled\s*\(/.test(line)) {
      const promiseType = /allSettled/.test(line) ? 'Promise.allSettled' : 'Promise.all';
      patterns.push({ pattern_type: 'promise_combinator', name: promiseType, file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // ── Error handling ───────────────────────────────────────────────────────
    if (/\btry\s*\{/.test(line)) {
      const isAsync = /async/.test(context);
      patterns.push({ pattern_type: isAsync ? 'async_error_handling' : 'error_handling', name: 'try-catch block', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // ── Functional patterns ──────────────────────────────────────────────────
    if (/\.reduce\s*\(/.test(line)) {
      patterns.push({ pattern_type: 'functional_reduce', name: 'Array.reduce', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // ── Database patterns ────────────────────────────────────────────────────
    const prismaMatch = line.match(/\.(findMany|findUnique|findFirst|create|update|upsert|delete|deleteMany|count|aggregate)\s*\(/);
    if (prismaMatch) {
      patterns.push({ pattern_type: 'database_query', name: `Prisma ${prismaMatch[1]}`, file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Raw SQL
    if (/\bdb\.(query|run|exec|prepare)\s*\(/.test(line)) {
      patterns.push({ pattern_type: 'database_query', name: 'raw SQL query', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
  }

  // File-level observer pattern (needs both emit and on in same file)
  if (hasOn && hasEmit) {
    patterns.push({ pattern_type: 'observer_pattern', name: 'EventEmitter pattern', file_path: filePath, snippet: 'File uses .on() and .emit()' });
  }

  return patterns;
}

// ─── Python ───────────────────────────────────────────────────────────────────

function detectPythonPatterns(filePath: string, lines: string[]): CodePattern[] {
  const patterns: CodePattern[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Async function (async def)
    if (/^\s*async\s+def\s+/.test(line)) {
      const nameMatch = line.match(/async\s+def\s+(\w+)/);
      patterns.push({ pattern_type: 'async_function', name: nameMatch ? nameMatch[1] : 'async def', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Generator (yield)
    if (/\byield\b/.test(line)) {
      patterns.push({ pattern_type: 'generator', name: 'generator yield', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Error handling
    if (/^\s*try\s*:/.test(line)) {
      patterns.push({ pattern_type: 'error_handling', name: 'try-except block', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Comprehensions
    if (/\[.+\bfor\b.+\bin\b/.test(line) && !/^\s*#/.test(line)) {
      patterns.push({ pattern_type: 'list_comprehension', name: 'list comprehension', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Decorators
    if (/^\s*@\s*(property|staticmethod|classmethod)\b/.test(line)) {
      const decorMatch = line.match(/@\s*(\w+)/);
      patterns.push({ pattern_type: 'oop_decorator', name: decorMatch ? `@${decorMatch[1]}` : 'decorator', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    if (/^\s*@\s*(?:cache|lru_cache)\b/.test(line)) {
      patterns.push({ pattern_type: 'memoization', name: '@lru_cache / @cache', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Class definition
    const pyClassMatch = line.match(/^\s*class\s+(\w+)\s*(?:\(([^)]*)\))?:/);
    if (pyClassMatch) {
      patterns.push({ pattern_type: 'class_definition', name: pyClassMatch[1], file_path: filePath, line_number: lineNum, snippet: line.trim() });
      // Singleton signal
      if (/\b_instance\b/.test(lines.slice(i, Math.min(lines.length, i + 30)).join('\n'))) {
        patterns.push({ pattern_type: 'singleton_pattern', name: `${pyClassMatch[1]} (singleton)`, file_path: filePath, line_number: lineNum, snippet: line.trim() });
      }
    }

    // dataclass decorator
    if (/^\s*@\s*dataclass\b/.test(line)) {
      patterns.push({ pattern_type: 'dataclass', name: '@dataclass', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Type hints (function signatures with ->)
    if (/\)\s*->\s*\w/.test(line) && /^\s*(?:async\s+)?def\s+/.test(line)) {
      patterns.push({ pattern_type: 'type_annotation', name: 'typed function signature', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
  }

  return patterns;
}

// ─── Go ──────────────────────────────────────────────────────────────────────

function detectGoPatterns(filePath: string, lines: string[]): CodePattern[] {
  const patterns: CodePattern[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Goroutine spawn
    if (/\bgo\s+\w/.test(line)) {
      patterns.push({ pattern_type: 'goroutine_spawn', name: 'goroutine', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Channel send
    if (/\w+\s*<-\s*\w/.test(line)) {
      patterns.push({ pattern_type: 'channel_communication', name: 'channel send/receive', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Defer
    if (/^\s*defer\s+/.test(line)) {
      patterns.push({ pattern_type: 'defer_cleanup', name: 'defer', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Error nil check
    if (/\berr\s*!=\s*nil/.test(line)) {
      patterns.push({ pattern_type: 'error_nil_check', name: 'err != nil', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Interface definition
    if (/^\s*type\s+\w+\s+interface\s*\{/.test(line)) {
      const ifaceMatch = line.match(/type\s+(\w+)\s+interface/);
      patterns.push({ pattern_type: 'interface_definition', name: ifaceMatch ? ifaceMatch[1] : 'interface', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Context propagation
    if (/context\.Context/.test(line) || /\.WithContext\s*\(/.test(line)) {
      patterns.push({ pattern_type: 'context_propagation', name: 'context.Context', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Struct definition
    if (/^\s*type\s+\w+\s+struct\s*\{/.test(line)) {
      const structMatch = line.match(/type\s+(\w+)\s+struct/);
      patterns.push({ pattern_type: 'struct_definition', name: structMatch ? structMatch[1] : 'struct', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
  }

  return patterns;
}

// ─── Rust ─────────────────────────────────────────────────────────────────────

function detectRustPatterns(filePath: string, lines: string[]): CodePattern[] {
  const patterns: CodePattern[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Async/await
    if (/\.await\b/.test(line)) {
      patterns.push({ pattern_type: 'await_expression', name: '.await', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    if (/\basync\s+fn\b/.test(line)) {
      const fnMatch = line.match(/async\s+fn\s+(\w+)/);
      patterns.push({ pattern_type: 'async_function', name: fnMatch ? fnMatch[1] : 'async fn', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Trait implementation
    if (/^\s*impl\s+\w+\s+for\s+\w+/.test(line)) {
      patterns.push({ pattern_type: 'trait_impl', name: line.trim().replace(/\s*\{.*/, ''), file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Error propagation (? operator): matches .get()? or identifier? at end of expression
    // Excludes JS/TS patterns: `?.` (optional chaining) and `??` (nullish coalescing)
    if (/[\w)>\]]\?[^.?]/.test(line) || /[\w)>\]]\?\s*$/.test(line)) {
      patterns.push({ pattern_type: 'error_propagation', name: '? operator', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Derive macros
    if (/^\s*#\[derive\s*\(/.test(line)) {
      const deriveMatch = line.match(/#\[derive\s*\(([^)]+)\)/);
      patterns.push({ pattern_type: 'derive_macros', name: deriveMatch ? `#[derive(${deriveMatch[1]})]` : 'derive macro', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Lifetime annotations
    if (/'[a-z]/.test(line) && /fn\s+\w+/.test(line)) {
      patterns.push({ pattern_type: 'lifetime_annotations', name: 'lifetime parameter', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Concurrent spawn (tokio::spawn, thread::spawn)
    if (/\bspawn\s*\(/.test(line)) {
      patterns.push({ pattern_type: 'concurrent_spawn', name: 'spawn', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Enum definition
    if (/^\s*(?:pub\s+)?enum\s+\w+/.test(line)) {
      const enumMatch = line.match(/enum\s+(\w+)/);
      patterns.push({ pattern_type: 'enum_definition', name: enumMatch ? enumMatch[1] : 'enum', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
  }

  return patterns;
}

// ─── Ruby ─────────────────────────────────────────────────────────────────────

const RAILS_DSL_METHODS = new Set([
  'has_many', 'has_one', 'belongs_to', 'has_and_belongs_to_many',
  'validates', 'validates_presence_of', 'validates_uniqueness_of',
  'scope', 'before_save', 'after_create', 'before_validation',
  'after_commit', 'before_destroy'
]);

const RSPEC_METHODS = new Set(['describe', 'context', 'it', 'specify', 'expect', 'subject', 'let']);

function detectRubyPatterns(filePath: string, lines: string[]): CodePattern[] {
  const patterns: CodePattern[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Class inheritance
    if (/^\s*class\s+\w+\s*<\s*\w+/.test(line)) {
      const inheritMatch = line.match(/class\s+(\w+)\s*<\s*(\w+)/);
      patterns.push({ pattern_type: 'class_inheritance', name: inheritMatch ? `${inheritMatch[1]} < ${inheritMatch[2]}` : 'class inheritance', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Module mixin
    const mixinMatch = line.match(/^\s*(include|extend|prepend)\s+(\w+)/);
    if (mixinMatch) {
      patterns.push({ pattern_type: 'module_mixin', name: `${mixinMatch[1]} ${mixinMatch[2]}`, file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Block usage (do..end or { })
    if (/\bdo\s*\|/.test(line) || /\}\s*do\b/.test(line)) {
      patterns.push({ pattern_type: 'block_usage', name: 'block with do', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Rails DSL
    const railsMatch = line.match(/^\s*(\w+)\s*(?::|['"]|\s*do\b)/);
    if (railsMatch && RAILS_DSL_METHODS.has(railsMatch[1])) {
      patterns.push({ pattern_type: 'rails_dsl', name: `Rails: ${railsMatch[1]}`, file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // RSpec
    const rspecMatch = line.match(/^\s*(\w+)\s*['"]([^'"]+)['"]/);
    if (rspecMatch && RSPEC_METHODS.has(rspecMatch[1])) {
      patterns.push({ pattern_type: 'rspec_pattern', name: `${rspecMatch[1]}: ${rspecMatch[2].slice(0, 40)}`, file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
  }

  return patterns;
}

// ─── C# ──────────────────────────────────────────────────────────────────────

function detectCSharpPatterns(filePath: string, lines: string[]): CodePattern[] {
  const patterns: CodePattern[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Async/await
    if (/\bawait\s+/.test(line)) {
      patterns.push({ pattern_type: 'await_expression', name: 'await', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
    if (/\basync\s+Task\b|\basync\s+\w+Task\b/.test(line)) {
      const fnMatch = line.match(/\basync\s+(?:\w+\s+)+(\w+)\s*\(/);
      patterns.push({ pattern_type: 'async_function', name: fnMatch ? fnMatch[1] : 'async method', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Interface definition
    if (/^\s*(?:public\s+|private\s+|internal\s+)?interface\s+I[A-Z]\w+/.test(line)) {
      const ifaceMatch = line.match(/interface\s+(I[A-Z]\w+)/);
      patterns.push({ pattern_type: 'interface_definition', name: ifaceMatch ? ifaceMatch[1] : 'interface', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Attribute decoration
    if (/^\s*\[(?:HttpGet|HttpPost|HttpPut|HttpDelete|Route|Authorize|ApiController|Required|StringLength)\b/.test(line)) {
      const attrMatch = line.match(/\[(\w+)/);
      patterns.push({ pattern_type: 'attribute_decoration', name: attrMatch ? `[${attrMatch[1]}]` : 'attribute', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // LINQ
    if (/\b(?:from\s+\w+\s+in\s+|\.Where\s*\(|\.Select\s*\(|\.FirstOrDefault\s*\(|\.OrderBy\s*\()/.test(line)) {
      patterns.push({ pattern_type: 'linq_usage', name: 'LINQ query', file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }

    // Dependency injection (IInterface parameter)
    if (/\bI[A-Z]\w+\s+\w+\b/.test(line) && /(?:public|private|protected)\s+\w/.test(line)) {
      const diMatch = line.match(/\b(I[A-Z]\w+)\s+(\w+)\b/);
      if (diMatch) {
        patterns.push({ pattern_type: 'dependency_injection', name: `${diMatch[1]} (DI)`, file_path: filePath, line_number: lineNum, snippet: line.trim() });
      }
    }

    // Class definition
    const csClassMatch = line.match(/^\s*(?:public\s+|private\s+|internal\s+|sealed\s+|abstract\s+)*class\s+(\w+)/);
    if (csClassMatch) {
      patterns.push({ pattern_type: 'class_definition', name: csClassMatch[1], file_path: filePath, line_number: lineNum, snippet: line.trim() });
    }
  }

  return patterns;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function detectPatterns(filePath: string, content: string): CodePattern[] {
  const lines = content.split('\n').slice(0, MAX_LINES);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return detectTsPatterns(filePath, lines);
    case 'py':
      return detectPythonPatterns(filePath, lines);
    case 'go':
      return detectGoPatterns(filePath, lines);
    case 'rs':
      return detectRustPatterns(filePath, lines);
    case 'rb':
      return detectRubyPatterns(filePath, lines);
    case 'cs':
      return detectCSharpPatterns(filePath, lines);
    default:
      return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'rb', 'cs']);

/**
 * Analyze a set of observed files for code patterns.
 *
 * @param files Array of {file_path, content} from Write/Edit observations
 * @returns Deduplicated list of detected patterns for LLM enrichment
 */
export function analyzeFiles(
  files: Array<{ file_path: string; content: string }>
): CodePattern[] {
  const allPatterns: CodePattern[] = [];

  for (const { file_path, content } of files) {
    if (!content || content.length > MAX_FILE_SIZE) continue;

    const ext = file_path.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    try {
      const patterns = detectPatterns(file_path, content);
      allPatterns.push(...patterns);
    } catch (err) {
      logger.debug('ANALYZER', 'Pattern detection failed for file', { file_path }, err as Error);
    }
  }

  // Deduplicate by pattern_type + name + file_path
  const seen = new Set<string>();
  return allPatterns.filter(p => {
    const key = `${p.pattern_type}:${p.name}:${p.file_path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
