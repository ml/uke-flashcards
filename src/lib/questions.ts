import fs from 'fs';
import path from 'path';
import type { Question, QuestionBank, Section } from '@/types/questions';

const QUESTIONS_PATH = path.join(process.cwd(), 'data', 'questions.json');

let questionsCache: Question[] | null = null;

/**
 * Load questions from the JSON file.
 * Caches the result in memory for subsequent calls.
 */
export function getQuestions(): Question[] {
  if (questionsCache) {
    return questionsCache;
  }

  const data = fs.readFileSync(QUESTIONS_PATH, 'utf-8');
  const bank: QuestionBank = JSON.parse(data);
  questionsCache = bank.questions;

  return questionsCache;
}

/**
 * Get a single question by ID.
 */
export function getQuestionById(id: string): Question | undefined {
  const questions = getQuestions();
  return questions.find((q) => q.id === id);
}

/**
 * Get questions filtered by section.
 */
export function getQuestionsBySection(section: Section): Question[] {
  const questions = getQuestions();
  return questions.filter((q) => q.section === section);
}

/**
 * Get all unique sections from the questions.
 */
export function getSections(): Section[] {
  const questions = getQuestions();
  const sections = new Set<Section>();
  questions.forEach((q) => sections.add(q.section));
  return Array.from(sections);
}

/**
 * Get the total count of questions.
 */
export function getQuestionCount(): number {
  return getQuestions().length;
}

/**
 * Clear the questions cache.
 * Useful for testing or if questions are updated.
 */
export function clearQuestionsCache(): void {
  questionsCache = null;
}
