export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQuestionById } from '@/lib/questions';
import { getQCodeById } from '@/lib/qcodes';
import { getLetterById } from '@/lib/alphabet';
import { getUserIdFromRequest } from '@/lib/auth-helpers';

/**
 * POST /api/attempts
 * Records a question attempt in the database.
 * Supports exam questions (Q*), Q codes (QC-*), and alphabet letters (AL-*).
 * Anonymous users: attempt is NOT persisted, but isCorrect/correctAnswer still returned.
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

  const userId = getUserIdFromRequest(request);

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
    isCorrect = selectedAnswer === 'CORRECT';
    correctAnswer = qCode.meaning;
  } else if (questionId.startsWith('AL-')) {
    const letter = getLetterById(questionId);
    if (!letter) {
      return NextResponse.json(
        { error: 'Alphabet letter not found' },
        { status: 404 }
      );
    }
    isCorrect = selectedAnswer === 'CORRECT';
    correctAnswer = letter.phonetic;
  } else {
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

  // Anonymous users: return result without persisting
  if (!userId) {
    return NextResponse.json({
      id: null,
      isCorrect,
      correctAnswer,
    });
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO attempts (question_id, session_id, selected_answer, is_correct, user_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    questionId,
    sessionId ?? null,
    selectedAnswer,
    isCorrect ? 1 : 0,
    userId
  );

  return NextResponse.json({
    id: result.lastInsertRowid,
    isCorrect,
    correctAnswer,
  });
}
