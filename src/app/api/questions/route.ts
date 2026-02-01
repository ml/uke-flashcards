import { NextResponse } from 'next/server';
import { getQuestions } from '@/lib/questions';

/**
 * GET /api/questions
 * Returns all questions from the question bank.
 */
export async function GET() {
  const questions = getQuestions();
  return NextResponse.json({ questions, total: questions.length });
}
