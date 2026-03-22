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
  difficulty: 'beginner' | 'intermediate' | 'advanced';
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
 * Build the extraction prompt for the LLM.
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
  const patternSummary = codePatterns
    .slice(0, 20) // limit to avoid token overflow
    .map(p => `- ${p.pattern_type}: ${p.name} in ${p.file_path}:${p.line_number ?? '?'}\n  ${p.snippet}`)
    .join('\n');

  return `You are a developer learning analyst. Analyze this coding session and extract:
1. A structured session summary (what was built, developer intent, key architectural decisions)
2. The specific programming concepts encountered during this session

Project: ${projectName}
Stack: ${stack.join(', ')}${stackProfile.framework ? ` | Framework: ${stackProfile.framework}` : ''}${stackProfile.orm ? ` | ORM: ${stackProfile.orm}` : ''}
Files created: ${fileStats.created}, Files edited: ${fileStats.edited}

Code patterns detected:
${patternSummary || '(no patterns detected)'}

Last assistant message (session context):
${lastAssistantMessage.slice(0, 1500)}

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
      <name>Exact concept name (e.g., "React Server Components", "Singleton Pattern", "JWT Refresh Tokens")</name>
      <category>One of: design-pattern, react, typescript, nodejs, database, auth, testing, api, state-management, performance, security, algorithms</category>
      <difficulty>One of: beginner, intermediate, advanced</difficulty>
      <source_file>The primary file where this concept appears (relative path)</source_file>
      <snippet>2-4 lines of the most illustrative code</snippet>
      <why_it_matters>Why a developer learning this concept should care about it</why_it_matters>
      <confidence>0.0 to 1.0 confidence that this concept was meaningfully encountered</confidence>
    </concept>
  </concepts>
</analysis>

Include 3-8 concepts. Only include concepts where confidence >= 0.6. Focus on concepts a mid-level developer would find valuable to learn about.`;
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
    const category = block.match(/<category>([\s\S]*?)<\/category>/)?.[1]?.trim() ?? 'general';
    const difficultyRaw = block.match(/<difficulty>([\s\S]*?)<\/difficulty>/)?.[1]?.trim() ?? 'intermediate';
    const difficulty = ['beginner', 'intermediate', 'advanced'].includes(difficultyRaw)
      ? (difficultyRaw as 'beginner' | 'intermediate' | 'advanced')
      : 'intermediate';
    const sourceFile = block.match(/<source_file>([\s\S]*?)<\/source_file>/)?.[1]?.trim() ?? '';
    const snippet = block.match(/<snippet>([\s\S]*?)<\/snippet>/)?.[1]?.trim() ?? '';
    const whyItMatters = block.match(/<why_it_matters>([\s\S]*?)<\/why_it_matters>/)?.[1]?.trim() ?? '';
    const confidenceStr = block.match(/<confidence>([\s\S]*?)<\/confidence>/)?.[1]?.trim() ?? '0.8';
    const confidence = Math.min(1.0, Math.max(0, parseFloat(confidenceStr) || 0.8));

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
  }).filter(c => c.confidence >= 0.6);

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
