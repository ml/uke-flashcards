export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQuestions } from '@/lib/questions';
import { getUserIdFromRequest } from '@/lib/auth-helpers';

interface SessionRow {
  id: number;
  created_at: string;
  completed_at: string | null;
  total_questions: number;
  correct_count: number;
}

interface AttemptRow {
  session_id: number;
  question_id: string;
}

/**
 * GET /api/sessions/history
 * Returns a list of sessions with statistics for the authenticated user.
 * Anonymous users get an empty array.
 */
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json({ sessions: [] });
  }

  const db = getDb();
  const allQuestions = getQuestions();

  // Get all sessions for this user with their attempt counts
  const sessions = db
    .prepare(
      `
      SELECT
        s.id,
        s.created_at,
        s.completed_at,
        COUNT(a.id) as total_questions,
        SUM(a.is_correct) as correct_count
      FROM sessions s
      LEFT JOIN attempts a ON a.session_id = s.id
      WHERE s.user_id = ?
      GROUP BY s.id
      ORDER BY s.created_at DESC
      `
    )
    .all(userId) as SessionRow[];

  // Get all attempts for this user's sessions for section breakdown
  const sessionAttempts = db
    .prepare(
      `
      SELECT a.session_id, a.question_id
      FROM attempts a
      JOIN sessions s ON a.session_id = s.id
      WHERE s.user_id = ? AND a.session_id IS NOT NULL
      `
    )
    .all(userId) as AttemptRow[];

  // Build a map of session_id -> sections covered
  const sessionSectionsMap = new Map<number, Set<string>>();

  for (const attempt of sessionAttempts) {
    const question = allQuestions.find((q) => q.id === attempt.question_id);
    if (question) {
      if (!sessionSectionsMap.has(attempt.session_id)) {
        sessionSectionsMap.set(attempt.session_id, new Set());
      }
      sessionSectionsMap.get(attempt.session_id)!.add(question.section);
    }
  }

  // Build the response
  const history = sessions.map((session) => ({
    id: session.id,
    createdAt: session.created_at,
    completedAt: session.completed_at,
    questionsCorrect: session.correct_count ?? 0,
    questionsTotal: session.total_questions,
    sectionsCovered: Array.from(sessionSectionsMap.get(session.id) ?? []).sort(),
    passed: session.total_questions > 0 && (session.correct_count ?? 0) / session.total_questions >= 0.6,
  }));

  return NextResponse.json({ sessions: history });
}
