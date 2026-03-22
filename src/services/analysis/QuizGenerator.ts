/**
 * QuizGenerator
 *
 * Second LLM call that generates quiz questions for each extracted concept.
 * Batches concepts (max 5 per call) to stay within context limits.
 * Skips concepts where developer_profile.mastery_score > 0.85.
 *
 * Question types (7 total, aligned with belearn POC notebook 10):
 *   multiple_choice, code_reading, spot_the_bug, fill_in_blank,
 *   open_ended, true_false, ordering
 *
 * Question type selection uses concept_taxonomy.json to match category + difficulty.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';
import type { VibelearnConcept } from './ConceptExtractor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Question type union ──────────────────────────────────────────────────────

export type QuestionType =
  | 'multiple_choice'
  | 'code_reading'
  | 'spot_the_bug'
  | 'fill_in_blank'
  | 'open_ended'
  | 'true_false'
  | 'ordering';

export const QUESTION_TYPES: readonly QuestionType[] = [
  'multiple_choice',
  'code_reading',
  'spot_the_bug',
  'fill_in_blank',
  'open_ended',
  'true_false',
  'ordering',
] as const;

export interface VibelearnQuestion {
  id: string;
  session_id: string;
  concept_id: string;
  question_type: QuestionType;
  difficulty: string;
  snippet: string;
  question: string;
  options_json: string | null;   // JSON array of strings, for MC and ordering
  correct: string | null;        // null for open_ended
  explanation: string;
  follow_up_mid: string;
  tags_json: string;
  created_at: number;
}

const BATCH_SIZE = 5;

// ─── Taxonomy-based question type selection ───────────────────────────────────

interface TaxonomyConcept {
  concept_name: string;
  category: string;
  question_types: {
    junior: QuestionType;
    mid: QuestionType;
    senior: QuestionType;
  };
}

interface ConceptTaxonomy {
  concepts: TaxonomyConcept[];
}

/** Category-level fallback map (from POC notebook 04) */
const TYPE_BY_CATEGORY: Record<string, Record<string, QuestionType>> = {
  design_pattern:       { junior: 'multiple_choice',  mid: 'spot_the_bug',    senior: 'open_ended' },
  async_pattern:        { junior: 'true_false',        mid: 'spot_the_bug',    senior: 'open_ended' },
  error_handling:       { junior: 'true_false',        mid: 'spot_the_bug',    senior: 'open_ended' },
  react_pattern:        { junior: 'fill_in_blank',     mid: 'spot_the_bug',    senior: 'open_ended' },
  architecture_pattern: { junior: 'multiple_choice',   mid: 'open_ended',      senior: 'open_ended' },
  oop_pattern:          { junior: 'multiple_choice',   mid: 'spot_the_bug',    senior: 'open_ended' },
  functional_pattern:   { junior: 'code_reading',      mid: 'fill_in_blank',   senior: 'open_ended' },
  concurrency:          { junior: 'true_false',         mid: 'spot_the_bug',    senior: 'open_ended' },
  database_pattern:     { junior: 'multiple_choice',   mid: 'code_reading',    senior: 'open_ended' },
  api_design:           { junior: 'multiple_choice',   mid: 'spot_the_bug',    senior: 'open_ended' },
  testing:              { junior: 'true_false',         mid: 'fill_in_blank',   senior: 'open_ended' },
  security:             { junior: 'true_false',         mid: 'spot_the_bug',    senior: 'open_ended' },
  type_system:          { junior: 'fill_in_blank',      mid: 'code_reading',    senior: 'open_ended' },
  state_management:     { junior: 'multiple_choice',   mid: 'spot_the_bug',    senior: 'open_ended' },
};

const DEFAULT_TYPE: Record<string, QuestionType> = {
  junior: 'multiple_choice',
  mid: 'spot_the_bug',
  senior: 'open_ended',
};

let _taxonomy: ConceptTaxonomy | null = null;

function loadTaxonomy(): ConceptTaxonomy {
  if (_taxonomy) return _taxonomy;
  try {
    const taxonomyPath = join(__dirname, '../../data/concept_taxonomy.json');
    _taxonomy = JSON.parse(readFileSync(taxonomyPath, 'utf-8')) as ConceptTaxonomy;
  } catch {
    _taxonomy = { concepts: [] };
  }
  return _taxonomy;
}

/**
 * Select the best question type for a given concept + difficulty.
 * Priority: concept_taxonomy.json → category map → default.
 */
export function selectQuestionType(concept: VibelearnConcept, difficulty: string): QuestionType {
  const taxonomy = loadTaxonomy();
  const taxEntry = taxonomy.concepts.find(c => c.concept_name === concept.concept_name);
  if (taxEntry?.question_types) {
    const qt = taxEntry.question_types[difficulty as keyof typeof taxEntry.question_types];
    if (qt && QUESTION_TYPES.includes(qt as QuestionType)) return qt as QuestionType;
  }

  const categoryTypes = TYPE_BY_CATEGORY[concept.category];
  if (categoryTypes) {
    const qt = categoryTypes[difficulty];
    if (qt) return qt;
  }

  return DEFAULT_TYPE[difficulty] as QuestionType ?? 'multiple_choice';
}

// ─── System prompt (calibrated from belearn POC notebook 10 v2) ──────────────

const QUIZ_SYSTEM = `You are an expert software engineering educator generating quiz questions
for a personalized learning platform.

CORE PRINCIPLES:
1. Every question is grounded in actual code the developer wrote
2. Questions test conceptual understanding, not syntax memorization
3. Correct answers are VERIFIED correct — no ambiguity allowed
4. Explanations TEACH the concept — they don't just state the answer
5. Difficulty matches the target level precisely

DIFFICULTY CALIBRATION (Bloom's Taxonomy):
Junior — Remember & Understand:
  - "What pattern is this?" / "Is this statement true or false?"
  - One and only one unambiguous correct answer
  - Distractors represent real beginner misconceptions

Mid — Apply & Analyze:
  - "What's wrong with this code?" / "What does this output?"
  - Requires understanding internals, not just surface recognition
  - Bugs must be conceptual (NOT typos or missing semicolons)

Senior — Evaluate & Create:
  - "How would you redesign this?" / "What are the trade-offs?"
  - Question must be specific enough to evaluate objectively
  - Good answers demonstrate trade-off awareness, not just one solution

QUESTION-TYPE STRUCTURAL RULES:
multiple_choice: exactly 4 options A–D; exactly ONE correct; distractors = real junior misconceptions
code_reading: output must be deterministic from snippet alone; include specific input values if needed
spot_the_bug: bug must be conceptual with production consequences; not typos or missing semicolons
fill_in_blank: remove ONE conceptually important token; show blank as ___; only ONE valid completion
open_ended: include 3+ specific evaluation criteria; require analysis AND synthesis
true_false: statement must be UNAMBIGUOUSLY true OR false; test a conceptual claim
ordering: 4–6 steps in WRONG order; correct order must be logically necessary`;

// ─── Prompt builder ───────────────────────────────────────────────────────────

interface ConceptWithType {
  concept: VibelearnConcept;
  questionType: QuestionType;
  targetDifficulty: string;
}

function buildQuizPrompt(batch: ConceptWithType[]): string {
  const conceptBlocks = batch.map((item, i) => {
    const { concept, questionType, targetDifficulty } = item;
    return `## Concept ${i + 1}
Name:        ${concept.concept_name}
Category:    ${concept.category}
Difficulty:  ${targetDifficulty}
Source File: ${concept.source_file}
Why it matters: ${concept.why_it_matters}

Code Snippet:
${concept.snippet}

Question Type: ${questionType}`;
  }).join('\n\n---\n\n');

  const typeInstructions = `Type instructions:
- multiple_choice: 4 options A–D, exactly one correct, distractors = common misconceptions
- code_reading: ask what the code returns/outputs/does given specific input
- spot_the_bug: identify a real conceptual problem; if none exists, introduce a subtle one
- fill_in_blank: remove one key token from snippet, show as ___, ask developer to supply it
- open_ended: ask for refactoring/architectural critique; include 3+ evaluation criteria
- true_false: make an unambiguous claim about the code; ask true/false with explanation
- ordering: provide 4–6 steps in wrong order; ask to arrange correctly`;

  return `${QUIZ_SYSTEM}

---

Generate one quiz question per concept below. Use the specified question type for each.

${conceptBlocks}

---

${typeInstructions}

Respond ONLY with this XML (no other text):

<questions>
  <question>
    <concept_index>1</concept_index>
    <type>the question type for this concept</type>
    <difficulty>junior OR mid OR senior</difficulty>
    <snippet>2-5 lines of code (from the snippet above)</snippet>
    <question_text>The question text</question_text>
    <options>["Option A", "Option B", "Option C", "Option D"]</options><!-- JSON array; required for multiple_choice and ordering; empty [] for others -->
    <correct>correct letter (A/B/C/D) for MC; "true"/"false" for T/F; comma-separated indices for ordering; null for open_ended</correct>
    <explanation>Why this is correct AND what the developer should understand. For MC: explain each wrong option.</explanation>
    <follow_up>Junior difficulty only: a harder follow-up question pushing toward mid-level</follow_up>
    <tags>["tag1", "tag2"]</tags>
  </question>
</questions>`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseQuizResponse(
  xml: string,
  batch: ConceptWithType[],
  sessionId: string
): VibelearnQuestion[] {
  const now = Math.floor(Date.now() / 1000);
  const questionMatches = [...xml.matchAll(/<question>([\s\S]*?)<\/question>/g)];

  return questionMatches.map(m => {
    const block = m[1];
    const conceptIndexStr = block.match(/<concept_index>(\d+)<\/concept_index>/)?.[1] ?? '1';
    const conceptIndex = Math.min(batch.length - 1, Math.max(0, parseInt(conceptIndexStr, 10) - 1));
    const { concept, targetDifficulty } = batch[conceptIndex];

    const typeRaw = block.match(/<type>([\s\S]*?)<\/type>/)?.[1]?.trim() ?? 'multiple_choice';
    const questionType: QuestionType = (QUESTION_TYPES as readonly string[]).includes(typeRaw)
      ? typeRaw as QuestionType
      : 'multiple_choice';

    const difficulty = block.match(/<difficulty>([\s\S]*?)<\/difficulty>/)?.[1]?.trim() ?? targetDifficulty;
    const snippet = block.match(/<snippet>([\s\S]*?)<\/snippet>/)?.[1]?.trim() ?? concept.snippet;
    const question = block.match(/<question_text>([\s\S]*?)<\/question_text>/)?.[1]?.trim() ?? '';
    const optionsRaw = block.match(/<options>([\s\S]*?)<\/options>/)?.[1]?.trim() ?? null;
    const correctRaw = block.match(/<correct>([\s\S]*?)<\/correct>/)?.[1]?.trim() ?? null;
    const correct = correctRaw === 'null' ? null : correctRaw;
    const explanation = block.match(/<explanation>([\s\S]*?)<\/explanation>/)?.[1]?.trim() ?? '';
    const followUp = block.match(/<follow_up>([\s\S]*?)<\/follow_up>/)?.[1]?.trim() ?? '';
    const tagsRaw = block.match(/<tags>([\s\S]*?)<\/tags>/)?.[1]?.trim() ?? '[]';

    // Parse options (MC and ordering get arrays)
    let optionsJson: string | null = null;
    const needsOptions = questionType === 'multiple_choice' || questionType === 'ordering';
    if (needsOptions && optionsRaw) {
      try {
        JSON.parse(optionsRaw);
        optionsJson = optionsRaw;
      } catch {
        optionsJson = null;
      }
    }

    let tagsJson = '[]';
    try { JSON.parse(tagsRaw); tagsJson = tagsRaw; } catch { tagsJson = '[]'; }

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
  }).filter(q => q.question.length > 0 && (q.correct !== null || q.question_type === 'open_ended'));
}

// ─── Public API ───────────────────────────────────────────────────────────────

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

  // Annotate each concept with the selected question type
  const annotated: ConceptWithType[] = toGenerate.map(c => ({
    concept: c,
    questionType: selectQuestionType(c, c.difficulty),
    targetDifficulty: c.difficulty,
  }));

  const allQuestions: VibelearnQuestion[] = [];

  // Process in batches
  for (let i = 0; i < annotated.length; i += BATCH_SIZE) {
    const batch = annotated.slice(i, i + BATCH_SIZE);
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
