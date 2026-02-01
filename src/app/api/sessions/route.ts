import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQuestions } from '@/lib/questions';
import type { Section } from '@/types/questions';

interface AttemptStats {
  question_id: string;
  total_attempts: number;
  correct_attempts: number;
  last_attempt_at: string;
  last_was_wrong: number;
}

/**
 * POST /api/sessions
 * Creates a new 20-question session using spaced repetition algorithm.
 *
 * Selection strategy:
 * - 10 questions: least answered (prioritize never-seen)
 * - 10 questions: wrong answers (prioritize recent failures)
 *
 * Request body:
 * - section?: string - Filter questions by section (optional)
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { section } = body as { section?: Section | null };

  const db = getDb();
  const allQuestions = getQuestions();

  // Filter by section if specified
  const availableQuestions = section
    ? allQuestions.filter((q) => q.section === section)
    : allQuestions;

  if (availableQuestions.length === 0) {
    return NextResponse.json(
      { error: 'No questions available for the selected section' },
      { status: 400 }
    );
  }

  // Get attempt statistics for all questions
  const stats = db
    .prepare(
      `
      SELECT
        question_id,
        COUNT(*) as total_attempts,
        SUM(is_correct) as correct_attempts,
        MAX(created_at) as last_attempt_at,
        (SELECT is_correct FROM attempts a2
         WHERE a2.question_id = attempts.question_id
         ORDER BY created_at DESC LIMIT 1) = 0 as last_was_wrong
      FROM attempts
      GROUP BY question_id
    `
    )
    .all() as AttemptStats[];

  const statsMap = new Map(stats.map((s) => [s.question_id, s]));

  // Available question IDs in this section/pool
  const questionPool = availableQuestions.map((q) => q.id);

  // Categorize questions
  const neverSeen: string[] = [];
  const leastAnswered: { id: string; attempts: number }[] = [];
  const wrongAnswers: { id: string; lastAttempt: string; isRecentWrong: boolean }[] = [];

  for (const qId of questionPool) {
    const stat = statsMap.get(qId);
    if (!stat) {
      neverSeen.push(qId);
    } else {
      leastAnswered.push({ id: qId, attempts: stat.total_attempts });
      if (stat.last_was_wrong) {
        wrongAnswers.push({
          id: qId,
          lastAttempt: stat.last_attempt_at,
          isRecentWrong: true,
        });
      } else if (stat.total_attempts > stat.correct_attempts) {
        // Has some wrong answers historically
        wrongAnswers.push({
          id: qId,
          lastAttempt: stat.last_attempt_at,
          isRecentWrong: false,
        });
      }
    }
  }

  // Sort for selection
  // Least answered: fewer attempts first
  leastAnswered.sort((a, b) => a.attempts - b.attempts);
  // Wrong answers: recent failures first, then by last attempt (most recent first)
  wrongAnswers.sort((a, b) => {
    if (a.isRecentWrong !== b.isRecentWrong) {
      return a.isRecentWrong ? -1 : 1;
    }
    return b.lastAttempt.localeCompare(a.lastAttempt);
  });

  // Select 10 "least answered" questions (prioritize never-seen)
  const selectedIds = new Set<string>();

  // First, add never-seen questions
  for (const qId of neverSeen) {
    if (selectedIds.size >= 10) break;
    selectedIds.add(qId);
  }

  // Then fill with least answered
  for (const { id } of leastAnswered) {
    if (selectedIds.size >= 10) break;
    if (!selectedIds.has(id)) {
      selectedIds.add(id);
    }
  }

  // Select up to 10 "wrong" questions
  for (const { id } of wrongAnswers) {
    if (selectedIds.size >= 20) break;
    if (!selectedIds.has(id)) {
      selectedIds.add(id);
    }
  }

  // If we don't have 20 questions yet, fill with remaining questions
  const allPoolIds = [...questionPool];
  // Shuffle for randomness
  for (let i = allPoolIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allPoolIds[i], allPoolIds[j]] = [allPoolIds[j], allPoolIds[i]];
  }

  for (const qId of allPoolIds) {
    if (selectedIds.size >= 20) break;
    if (!selectedIds.has(qId)) {
      selectedIds.add(qId);
    }
  }

  // Convert to array and shuffle the final selection
  const sessionQuestionIds = Array.from(selectedIds);
  for (let i = sessionQuestionIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sessionQuestionIds[i], sessionQuestionIds[j]] = [sessionQuestionIds[j], sessionQuestionIds[i]];
  }

  // Create the session in database
  const sessionResult = db.prepare('INSERT INTO sessions DEFAULT VALUES').run();
  const sessionId = sessionResult.lastInsertRowid as number;

  // Get full question data
  const sessionQuestions = sessionQuestionIds.map((id) =>
    availableQuestions.find((q) => q.id === id)!
  );

  return NextResponse.json({
    sessionId,
    questions: sessionQuestions,
    totalQuestions: sessionQuestions.length,
  });
}

/**
 * PATCH /api/sessions
 * Marks a session as completed.
 *
 * Request body:
 * - sessionId: number
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { sessionId } = body as { sessionId: number };

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId is required' },
      { status: 400 }
    );
  }

  const db = getDb();

  // Check if session exists
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  }

  // Mark session as completed
  db.prepare("UPDATE sessions SET completed_at = datetime('now') WHERE id = ?").run(
    sessionId
  );

  // Get session statistics
  const stats = db
    .prepare(
      `
      SELECT
        COUNT(*) as total,
        SUM(is_correct) as correct
      FROM attempts
      WHERE session_id = ?
    `
    )
    .get(sessionId) as { total: number; correct: number };

  // Get per-section breakdown
  const sectionBreakdown = db
    .prepare(
      `
      SELECT
        question_id,
        is_correct
      FROM attempts
      WHERE session_id = ?
    `
    )
    .all(sessionId) as { question_id: string; is_correct: number }[];

  const allQuestions = getQuestions();
  const sectionStats: Record<string, { total: number; correct: number }> = {};

  for (const attempt of sectionBreakdown) {
    const question = allQuestions.find((q) => q.id === attempt.question_id);
    if (question) {
      if (!sectionStats[question.section]) {
        sectionStats[question.section] = { total: 0, correct: 0 };
      }
      sectionStats[question.section].total++;
      if (attempt.is_correct) {
        sectionStats[question.section].correct++;
      }
    }
  }

  return NextResponse.json({
    sessionId,
    completed: true,
    stats: {
      total: stats.total,
      correct: stats.correct,
      incorrect: stats.total - stats.correct,
      bySection: sectionStats,
    },
  });
}
