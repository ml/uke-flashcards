import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQuestionById } from '@/lib/questions';
import { getQCodeById } from '@/lib/qcodes';
import type { AttemptInsert } from '@/types/database';

/**
 * POST /api/attempts
 * Records a question attempt in the database.
 * Supports both exam questions (Q*) and Q codes (QC-*).
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

  let isCorrect: boolean;
  let correctAnswer: string;

  // Handle Q codes (self-assessment based)
  if (questionId.startsWith('QC-')) {
    const qCode = getQCodeById(questionId);
    if (!qCode) {
      return NextResponse.json(
        { error: 'Q code not found' },
        { status: 404 }
      );
    }
    // For Q codes, selectedAnswer is 'CORRECT' or 'WRONG' (self-assessment)
    isCorrect = selectedAnswer === 'CORRECT';
    correctAnswer = qCode.meaning;
  } else {
    // Handle exam questions
    const question = getQuestionById(questionId);
    if (!question) {
      return NextResponse.json(
        { error: 'Question not found' },
        { status: 404 }
      );
    }
    isCorrect = question.correctAnswerLetter === selectedAnswer;
    correctAnswer = question.correctAnswerLetter;
  }

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
    correctAnswer,
  });
}
