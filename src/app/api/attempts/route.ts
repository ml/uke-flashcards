import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQuestionById } from '@/lib/questions';
import type { AttemptInsert } from '@/types/database';

/**
 * POST /api/attempts
 * Records a question attempt in the database.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { questionId, selectedAnswer, sessionId } = body as {
    questionId: string;
    selectedAnswer: string;
    sessionId?: number | null;
  };

  if (!questionId || !selectedAnswer) {
    return NextResponse.json(
      { error: 'questionId and selectedAnswer are required' },
      { status: 400 }
    );
  }

  const question = getQuestionById(questionId);
  if (!question) {
    return NextResponse.json(
      { error: 'Question not found' },
      { status: 404 }
    );
  }

  const isCorrect = question.correctAnswerLetter === selectedAnswer;

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO attempts (question_id, session_id, selected_answer, is_correct)
    VALUES (?, ?, ?, ?)
  `);

  const attemptData: AttemptInsert = {
    question_id: questionId,
    session_id: sessionId ?? null,
    selected_answer: selectedAnswer,
    is_correct: isCorrect,
  };

  const result = stmt.run(
    attemptData.question_id,
    attemptData.session_id,
    attemptData.selected_answer,
    attemptData.is_correct ? 1 : 0
  );

  return NextResponse.json({
    id: result.lastInsertRowid,
    isCorrect,
    correctAnswer: question.correctAnswerLetter,
  });
}
