/**
 * StaticAnalyzer
 *
 * AST-parses TypeScript/JavaScript/Python files from session observations
 * to detect code patterns without relying on LLM for structural facts.
 *
 * Falls back to regex-based detection if tree-sitter fails to load.
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

/**
 * Regex-based pattern detection (always available as fallback).
 */
function detectPatternsRegex(filePath: string, content: string): CodePattern[] {
  const patterns: CodePattern[] = [];
  const lines = content.split('\n').slice(0, MAX_LINES);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Custom React hooks (function useXxx)
    const hookMatch = line.match(/^\s*(?:export\s+)?(?:default\s+)?function\s+(use[A-Z]\w*)\s*\(/);
    if (hookMatch) {
      patterns.push({
        pattern_type: 'custom_hook',
        name: hookMatch[1],
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }

    // API route handlers (Express/Hono/Fastify style)
    const routeMatch = line.match(/^\s*(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)/);
    if (routeMatch) {
      patterns.push({
        pattern_type: 'api_route',
        name: `${routeMatch[1].toUpperCase()} ${routeMatch[2]}`,
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }

    // Next.js App Router route handlers
    const nextRouteMatch = line.match(/^\s*export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/);
    if (nextRouteMatch) {
      patterns.push({
        pattern_type: 'api_route',
        name: `Next.js ${nextRouteMatch[1]} handler`,
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }

    // TypeScript interfaces
    const interfaceMatch = line.match(/^\s*(?:export\s+)?interface\s+(\w+)\s*(?:<[^>]*>)?\s*\{?/);
    if (interfaceMatch) {
      patterns.push({
        pattern_type: 'typescript_interface',
        name: interfaceMatch[1],
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }

    // TypeScript types
    const typeMatch = line.match(/^\s*(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/);
    if (typeMatch) {
      patterns.push({
        pattern_type: 'typescript_type',
        name: typeMatch[1],
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }

    // Class definitions
    const classMatch = line.match(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      patterns.push({
        pattern_type: 'class_definition',
        name: classMatch[1],
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }

    // Async error handling patterns (try/catch with async)
    if (/\btry\s*\{/.test(line) && i > 0 && /async/.test(lines.slice(Math.max(0, i - 3), i).join(''))) {
      patterns.push({
        pattern_type: 'async_error_handling',
        name: 'try-catch in async context',
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }

    // Singleton pattern
    if (/private\s+static\s+(?:readonly\s+)?instance/.test(line) ||
        /getInstance\s*\(\s*\)/.test(line)) {
      patterns.push({
        pattern_type: 'singleton_pattern',
        name: 'Singleton pattern',
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }

    // React Server Component markers
    if (line.includes("'use server'") || line.includes('"use server"')) {
      patterns.push({
        pattern_type: 'server_action',
        name: 'React Server Action',
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }
    if (line.includes("'use client'") || line.includes('"use client"')) {
      patterns.push({
        pattern_type: 'client_component',
        name: 'React Client Component',
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }

    // Database query patterns (Prisma)
    const prismaMatch = line.match(/\.\s*(findMany|findUnique|findFirst|create|update|upsert|delete|count)\s*\(/);
    if (prismaMatch) {
      patterns.push({
        pattern_type: 'database_query',
        name: `Prisma ${prismaMatch[1]}`,
        file_path: filePath,
        line_number: lineNum,
        snippet: line.trim()
      });
    }
  }

  return patterns;
}

/**
 * Analyze a set of observed files for code patterns.
 *
 * @param files Array of {file_path, content} from Write/Edit observations
 * @returns Array of detected patterns for LLM enrichment
 */
export function analyzeFiles(
  files: Array<{ file_path: string; content: string }>
): CodePattern[] {
  const allPatterns: CodePattern[] = [];

  for (const { file_path, content } of files) {
    if (!content || content.length > MAX_FILE_SIZE) continue;

    // Only analyze TypeScript, JavaScript, Python, and related files
    const ext = file_path.split('.').pop()?.toLowerCase() ?? '';
    const supportedExts = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs'];
    if (!supportedExts.includes(ext)) continue;

    try {
      const patterns = detectPatternsRegex(file_path, content);
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
