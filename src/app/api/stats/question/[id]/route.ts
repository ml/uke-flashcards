export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQuestionById } from '@/lib/questions';
import { getUserIdFromRequest } from '@/lib/auth-helpers';

interface AttemptRecord {
  id: number;
  selected_answer: string;
  is_correct: number;
  created_at: string;
  session_id: number | null;
}

/**
 * GET /api/stats/question/[id]
 * Returns detailed attempt history for a specific question, scoped to user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = getUserIdFromRequest(request);

  const question = getQuestionById(id);
  if (!question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  if (!userId) {
    return NextResponse.json({
      question: {
        id: question.id,
        number: question.number,
        text: question.text,
        section: question.section,
        answers: question.answers,
        correctAnswerLetter: question.correctAnswerLetter,
      },
      stats: { totalAttempts: 0, correctAttempts: 0, correctnessRate: 0 },
      attempts: [],
    });
  }

  const db = getDb();

  // Get all attempts for this question scoped to user
  const attempts = db
    .prepare(
      `
      SELECT
        id,
        selected_answer,
        is_correct,
        created_at,
        session_id
      FROM attempts
      WHERE question_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `
    )
    .all(id, userId) as AttemptRecord[];

  const totalAttempts = attempts.length;
  const correctAttempts = attempts.filter((a) => a.is_correct).length;
  const correctnessRate = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

  return NextResponse.json({
    question: {
      id: question.id,
      number: question.number,
      text: question.text,
      section: question.section,
      answers: question.answers,
      correctAnswerLetter: question.correctAnswerLetter,
    },
    stats: {
      totalAttempts,
      correctAttempts,
      correctnessRate,
    },
    attempts: attempts.map((a) => ({
      id: a.id,
      selectedAnswer: a.selected_answer,
      isCorrect: Boolean(a.is_correct),
      createdAt: a.created_at,
      sessionId: a.session_id,
    })),
  });
}
