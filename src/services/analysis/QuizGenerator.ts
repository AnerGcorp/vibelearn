/**
 * QuizGenerator
 *
 * Second LLM call that generates quiz questions for each extracted concept.
 * Batches concepts (max 5 per call) to stay within context limits.
 * Skips concepts where developer_profile.mastery_score > 0.85.
 */

import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';
import type { VibelearnConcept } from './ConceptExtractor.js';

export interface VibelearnQuestion {
  id: string;
  session_id: string;
  concept_id: string;
  question_type: 'multiple_choice' | 'fill_in_blank' | 'explain_code';
  difficulty: string;
  snippet: string;
  question: string;
  options_json: string | null;   // JSON array of strings, only for multiple_choice
  correct: string;
  explanation: string;
  follow_up_mid: string;
  tags_json: string;
  created_at: number;
}

const BATCH_SIZE = 5;

function buildQuizPrompt(concepts: VibelearnConcept[]): string {
  const conceptList = concepts.map((c, i) =>
    `Concept ${i + 1}: ${c.concept_name} (${c.category}, ${c.difficulty})
Source: ${c.source_file}
Snippet:
${c.snippet}
Why it matters: ${c.why_it_matters}`
  ).join('\n\n');

  return `You are a developer educator. Generate quiz questions for these programming concepts.
For each concept, generate 1-2 questions that test genuine understanding.

${conceptList}

Respond ONLY with this XML (no other text):

<questions>
  <question>
    <concept_index>1</concept_index>
    <type>multiple_choice OR fill_in_blank OR explain_code</type>
    <difficulty>junior OR mid OR senior</difficulty>
    <snippet>2-4 lines of code (can be same as concept snippet or a variation)</snippet>
    <question>The question text</question>
    <options>["Option A", "Option B", "Option C", "Option D"]</options><!-- Only for multiple_choice -->
    <correct>The correct answer (or the letter A/B/C/D for multiple_choice)</correct>
    <explanation>Why this is correct and what the developer should understand</explanation>
    <follow_up>A follow-up question for deeper understanding (mid-level)</follow_up>
    <tags>["tag1", "tag2"]</tags>
  </question>
</questions>

Rules:
- multiple_choice questions must have exactly 4 options
- fill_in_blank: question has a blank (____) for the developer to fill in
- explain_code: ask the developer to explain what the code does or why it's designed this way
- Make questions practical — things a developer would encounter in real work
- Explanations should be educational, not just restate the answer`;
}

function parseQuizResponse(
  xml: string,
  concepts: VibelearnConcept[],
  sessionId: string
): VibelearnQuestion[] {
  const now = Math.floor(Date.now() / 1000);
  const questionMatches = [...xml.matchAll(/<question>([\s\S]*?)<\/question>/g)];

  return questionMatches.map(m => {
    const block = m[1];
    const conceptIndexStr = block.match(/<concept_index>(\d+)<\/concept_index>/)?.[1] ?? '1';
    const conceptIndex = Math.min(concepts.length - 1, Math.max(0, parseInt(conceptIndexStr, 10) - 1));
    const concept = concepts[conceptIndex];

    const typeRaw = block.match(/<type>([\s\S]*?)<\/type>/)?.[1]?.trim() ?? 'multiple_choice';
    const validTypes = ['multiple_choice', 'fill_in_blank', 'explain_code'];
    const questionType = validTypes.includes(typeRaw)
      ? typeRaw as 'multiple_choice' | 'fill_in_blank' | 'explain_code'
      : 'multiple_choice';

    const difficulty = block.match(/<difficulty>([\s\S]*?)<\/difficulty>/)?.[1]?.trim() ?? concept.difficulty;
    const snippet = block.match(/<snippet>([\s\S]*?)<\/snippet>/)?.[1]?.trim() ?? concept.snippet;
    const question = block.match(/<question>([\s\S]*?)<\/question>/)?.[1]?.trim() ?? '';
    const optionsRaw = block.match(/<options>([\s\S]*?)<\/options>/)?.[1]?.trim() ?? null;
    const correct = block.match(/<correct>([\s\S]*?)<\/correct>/)?.[1]?.trim() ?? '';
    const explanation = block.match(/<explanation>([\s\S]*?)<\/explanation>/)?.[1]?.trim() ?? '';
    const followUp = block.match(/<follow_up>([\s\S]*?)<\/follow_up>/)?.[1]?.trim() ?? '';
    const tagsRaw = block.match(/<tags>([\s\S]*?)<\/tags>/)?.[1]?.trim() ?? '[]';

    let optionsJson: string | null = null;
    if (questionType === 'multiple_choice' && optionsRaw) {
      try {
        JSON.parse(optionsRaw); // validate it's valid JSON
        optionsJson = optionsRaw;
      } catch {
        // wrap bare options in array notation if needed
        optionsJson = null;
      }
    }

    let tagsJson = '[]';
    try {
      JSON.parse(tagsRaw);
      tagsJson = tagsRaw;
    } catch {
      tagsJson = '[]';
    }

    return {
      id: randomUUID(),
      session_id: sessionId,
      concept_id: concept.id,
      question_type: questionType,
      difficulty,
      snippet,
      question,
      options_json: optionsJson,
      correct,
      explanation,
      follow_up_mid: followUp,
      tags_json: tagsJson,
      created_at: now
    };
  }).filter(q => q.question.length > 0 && q.correct.length > 0);
}

/**
 * Generate quiz questions for a set of concepts.
 *
 * @param concepts Concepts from ConceptExtractor
 * @param masteredConcepts Set of concept_names where mastery_score > 0.85 (skip these)
 * @param agentRunner Function that sends a prompt to the configured LLM and returns text
 */
export async function generateQuizQuestions(
  concepts: VibelearnConcept[],
  masteredConcepts: Set<string>,
  sessionId: string,
  agentRunner: (prompt: string) => Promise<string>
): Promise<VibelearnQuestion[]> {
  // Skip already-mastered concepts
  const toGenerate = concepts.filter(c => !masteredConcepts.has(c.concept_name));

  if (toGenerate.length === 0) {
    logger.info('QUIZ', 'All concepts already mastered, no new questions needed', { sessionId });
    return [];
  }

  const allQuestions: VibelearnQuestion[] = [];

  // Process in batches
  for (let i = 0; i < toGenerate.length; i += BATCH_SIZE) {
    const batch = toGenerate.slice(i, i + BATCH_SIZE);
    const prompt = buildQuizPrompt(batch);

    try {
      const response = await agentRunner(prompt);
      const questions = parseQuizResponse(response, batch, sessionId);
      allQuestions.push(...questions);
      logger.debug('QUIZ', `Generated ${questions.length} questions for batch ${Math.floor(i / BATCH_SIZE) + 1}`, { sessionId });
    } catch (err) {
      logger.error('QUIZ', 'Quiz generation LLM call failed for batch', { sessionId, batch: i }, err as Error);
      // Continue with next batch on failure
    }
  }

  logger.info('QUIZ', `Generated ${allQuestions.length} total questions`, {
    sessionId,
    concepts: toGenerate.length
  });

  return allQuestions;
}
