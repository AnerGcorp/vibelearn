/**
 * ConceptExtractor
 *
 * Single LLM call that produces both:
 * 1. A structured session summary (→ vibelearn_session_summaries)
 * 2. A list of learning concepts encountered (→ vl_concepts)
 *
 * Uses the existing SDKAgent/GeminiAgent/OpenRouterAgent infrastructure.
 */

import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';
import type { CodePattern } from './StaticAnalyzer.js';
import type { StackProfile } from './StackDetector.js';
import { CONCEPT_CATEGORIES_PROMPT_STRING, normalizeCategory } from './ConceptCategories.js';

export interface VibelearnSessionSummary {
  session_id: string;
  what_was_built: string;
  developer_intent: string;
  architecture_decisions_json: string;
  concepts_json: string;
  stack_confirmed_json: string;
  session_duration_minutes: number;
  files_created: number;
  files_edited: number;
  generated_at: number;
}

export interface VibelearnConcept {
  id: string;
  session_id: string;
  concept_name: string;
  category: string;
  difficulty: 'junior' | 'mid' | 'senior';
  source_file: string;
  snippet: string;
  why_it_matters: string;
  confidence: number;
  created_at: number;
}

interface ExtractionResult {
  summary: VibelearnSessionSummary;
  concepts: VibelearnConcept[];
}

/**
 * Group CodePattern[] into a structured signal summary for the LLM prompt.
 * Format: { tag, files, count } — mirrors the belearn POC signal format.
 */
function groupSignals(patterns: CodePattern[]): Array<{ tag: string; files: string[]; count: number }> {
  const byType = new Map<string, { files: Set<string>; count: number }>();
  for (const p of patterns) {
    const entry = byType.get(p.pattern_type) ?? { files: new Set(), count: 0 };
    entry.files.add(p.file_path);
    entry.count++;
    byType.set(p.pattern_type, entry);
  }
  return [...byType.entries()].map(([tag, { files, count }]) => ({
    tag,
    files: [...files],
    count,
  }));
}

// ─── System prompt (calibrated from belearn POC notebook 03) ─────────────────

const EXTRACTION_SYSTEM = `You are an expert software engineering educator analysing a vibe-coded development session.

Your role is to identify 3–8 concepts the developer encountered — especially ones they
may have USED without fully understanding. These become the foundation for quiz questions
that close the gap between "it ran" and "I understand why it ran."

Evaluation criteria for a GOOD concept extraction:
1. The concept actually appeared in the code (backed by a static signal or transcript quote)
2. It is something a junior developer plausibly used without understanding
3. It has a name — concepts without names can't be taught
4. It is specific: "async/await error handling" > "error handling"

Do NOT extract:
- Trivially obvious things (e.g. "using variables", "calling a function")
- Framework boilerplate the junior didn't author
- Concepts with confidence below 0.4`;

/**
 * Build the extraction prompt for the LLM.
 * Structured to match the calibrated belearn POC prompt from notebook 03.
 */
function buildExtractionPrompt(
  sessionId: string,
  projectName: string,
  lastAssistantMessage: string,
  stackProfile: StackProfile,
  codePatterns: CodePattern[],
  fileStats: { created: number; edited: number }
): string {
  const stack = JSON.parse(stackProfile.language_json ?? '[]');

  const stackSummary = {
    languages: stack,
    framework: stackProfile.framework ?? null,
    orm: stackProfile.orm ?? null,
    testing: JSON.parse(stackProfile.testing_json ?? '[]'),
  };

  // Unique files touched this session
  const sessionFiles = [...new Set(codePatterns.map(p => p.file_path))].slice(0, 20);

  // Grouped signals (POC format: tag + files + count)
  const signals = groupSignals(codePatterns).slice(0, 25);

  // Top representative snippets (one per pattern type, max 8)
  const snippetsByType = new Map<string, CodePattern>();
  for (const p of codePatterns) {
    if (!snippetsByType.has(p.pattern_type)) snippetsByType.set(p.pattern_type, p);
  }
  const snippets = [...snippetsByType.values()].slice(0, 8);
  const snippetBlock = snippets
    .map(p => `[${p.pattern_type}] ${p.file_path}${p.line_number ? `:${p.line_number}` : ''}\n${p.snippet}`)
    .join('\n\n');

  return `${EXTRACTION_SYSTEM}

---

## Stack Profile
${JSON.stringify(stackSummary, null, 2)}

## Files Modified This Session (${fileStats.created} created, ${fileStats.edited} edited)
${sessionFiles.length ? sessionFiles.join('\n') : '(none recorded)'}

## Static Analysis Signals
${signals.length ? JSON.stringify(signals, null, 2) : '(no patterns detected)'}

## Representative Code Snippets
${snippetBlock || '(no snippets available)'}

## Session Transcript (last assistant turn)
${lastAssistantMessage.slice(0, 1500)}

---

Respond ONLY with this XML structure (no other text):

<analysis>
  <session_summary>
    <what_was_built>A concise 1-2 sentence description of what was built</what_was_built>
    <developer_intent>What the developer was trying to accomplish</developer_intent>
    <architecture_decisions>
      <decision>Each key architectural or design decision made</decision>
    </architecture_decisions>
  </session_summary>
  <concepts>
    <concept>
      <name>Specific concept name (e.g., "async/await error handling", "Singleton Pattern", "JWT Refresh Tokens")</name>
      <category>One of: ${CONCEPT_CATEGORIES_PROMPT_STRING}</category>
      <difficulty>One of: junior, mid, senior</difficulty>
      <source_file>Primary file where this concept appears (relative path)</source_file>
      <snippet>2-5 lines of the most illustrative code (from the snippets above if possible)</snippet>
      <why_it_matters>One sentence: why a junior developer should understand this, not just use it</why_it_matters>
      <confidence>0.0 to 1.0 — set honestly; 0.9+ means highly certain it appeared AND is worth teaching</confidence>
    </concept>
  </concepts>
</analysis>

Include 3-8 concepts. Omit concepts with confidence below 0.4.
Prefer specific concept names over broad ones. Ground each concept in a static signal or transcript quote.`;
}

/**
 * Parse the LLM XML response into structured data.
 */
function parseExtractionResponse(
  sessionId: string,
  xml: string,
  stackProfile: StackProfile,
  fileStats: { created: number; edited: number },
  sessionDurationMinutes: number
): ExtractionResult {
  const now = Math.floor(Date.now() / 1000);

  // Extract session summary
  const whatBuilt = xml.match(/<what_was_built>([\s\S]*?)<\/what_was_built>/)?.[1]?.trim() ?? 'Session analyzed';
  const intent = xml.match(/<developer_intent>([\s\S]*?)<\/developer_intent>/)?.[1]?.trim() ?? '';
  const decisionsXml = xml.match(/<architecture_decisions>([\s\S]*?)<\/architecture_decisions>/)?.[1] ?? '';
  const decisions = [...decisionsXml.matchAll(/<decision>([\s\S]*?)<\/decision>/g)]
    .map(m => m[1].trim())
    .filter(Boolean);

  // Extract concepts
  const conceptMatches = [...xml.matchAll(/<concept>([\s\S]*?)<\/concept>/g)];
  const concepts: VibelearnConcept[] = conceptMatches.map(m => {
    const block = m[1];
    const name = block.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim() ?? 'Unknown concept';
    const category = normalizeCategory(block.match(/<category>([\s\S]*?)<\/category>/)?.[1]);
    const difficultyRaw = block.match(/<difficulty>([\s\S]*?)<\/difficulty>/)?.[1]?.trim() ?? 'mid';
    const difficulty = ['junior', 'mid', 'senior'].includes(difficultyRaw)
      ? (difficultyRaw as 'junior' | 'mid' | 'senior')
      : 'mid';
    const sourceFile = block.match(/<source_file>([\s\S]*?)<\/source_file>/)?.[1]?.trim() ?? '';
    const snippet = block.match(/<snippet>([\s\S]*?)<\/snippet>/)?.[1]?.trim() ?? '';
    const whyItMatters = block.match(/<why_it_matters>([\s\S]*?)<\/why_it_matters>/)?.[1]?.trim() ?? '';
    // Parse confidence: extract first numeric value, ignore trailing text (e.g. "0.9 — highly certain")
    const confidenceStr = block.match(/<confidence>([\s\S]*?)<\/confidence>/)?.[1]?.trim() ?? '0.8';
    const confidenceNum = parseFloat(confidenceStr.replace(/[^\d.]/g, '').match(/\d+\.?\d*/)?.[0] ?? '0.8');
    const confidence = Math.min(1.0, Math.max(0, isNaN(confidenceNum) ? 0.8 : confidenceNum));

    return {
      id: randomUUID(),
      session_id: sessionId,
      concept_name: name,
      category,
      difficulty,
      source_file: sourceFile,
      snippet,
      why_it_matters: whyItMatters,
      confidence,
      created_at: now
    };
  // Filter threshold aligned with POC: 0.4 (was 0.6 — too aggressive)
  }).filter(c => c.confidence >= 0.4);

  const conceptNames = concepts.map(c => c.concept_name);

  const summary: VibelearnSessionSummary = {
    session_id: sessionId,
    what_was_built: whatBuilt,
    developer_intent: intent,
    architecture_decisions_json: JSON.stringify(decisions),
    concepts_json: JSON.stringify(conceptNames),
    stack_confirmed_json: JSON.stringify({
      framework: stackProfile.framework,
      orm: stackProfile.orm,
      languages: JSON.parse(stackProfile.language_json ?? '[]')
    }),
    session_duration_minutes: sessionDurationMinutes,
    files_created: fileStats.created,
    files_edited: fileStats.edited,
    generated_at: now
  };

  return { summary, concepts };
}

/**
 * Run concept extraction via LLM.
 *
 * @param agentRunner Function that sends a prompt to the configured LLM and returns text
 */
export async function extractConcepts(
  sessionId: string,
  projectName: string,
  lastAssistantMessage: string,
  stackProfile: StackProfile,
  codePatterns: CodePattern[],
  fileStats: { created: number; edited: number },
  sessionDurationMinutes: number,
  agentRunner: (prompt: string) => Promise<string>
): Promise<ExtractionResult> {
  const prompt = buildExtractionPrompt(
    sessionId, projectName, lastAssistantMessage,
    stackProfile, codePatterns, fileStats
  );

  try {
    const response = await agentRunner(prompt);
    return parseExtractionResponse(
      sessionId, response, stackProfile, fileStats, sessionDurationMinutes
    );
  } catch (err) {
    logger.error('CONCEPTS', 'Concept extraction LLM call failed', { sessionId }, err as Error);
    // Return empty but valid result so pipeline continues
    const now = Math.floor(Date.now() / 1000);
    return {
      summary: {
        session_id: sessionId,
        what_was_built: 'Analysis failed — session recorded',
        developer_intent: '',
        architecture_decisions_json: '[]',
        concepts_json: '[]',
        stack_confirmed_json: '{}',
        session_duration_minutes: sessionDurationMinutes,
        files_created: fileStats.created,
        files_edited: fileStats.edited,
        generated_at: now
      },
      concepts: []
    };
  }
}
