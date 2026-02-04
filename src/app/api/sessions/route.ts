import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQuestions, getSections } from '@/lib/questions';
import type { Section } from '@/types/questions';

const QUESTIONS_PER_SECTION = 5;

interface AttemptStats {
  question_id: string;
  total_attempts: number;
  correct_attempts: number;
  last_attempt_at: string;
  last_was_wrong: number;
}

/**
 * Selects questions from a pool using spaced repetition logic.
 * Prioritizes: never-seen → wrong answers (recent failures first) → random fill.
 */
function selectQuestionsFromPool(
  questionPool: string[],
  statsMap: Map<string, AttemptStats>,
  targetCount: number
): string[] {
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
        wrongAnswers.push({
          id: qId,
          lastAttempt: stat.last_attempt_at,
          isRecentWrong: false,
        });
      }
    }
  }

  // Sort: fewer attempts first
  leastAnswered.sort((a, b) => a.attempts - b.attempts);
  // Sort: recent failures first, then by last attempt (most recent first)
  wrongAnswers.sort((a, b) => {
    if (a.isRecentWrong !== b.isRecentWrong) {
      return a.isRecentWrong ? -1 : 1;
    }
    return b.lastAttempt.localeCompare(a.lastAttempt);
  });

  const selectedIds = new Set<string>();

  // First, add never-seen questions
  for (const qId of neverSeen) {
    if (selectedIds.size >= targetCount) break;
    selectedIds.add(qId);
  }

  // Then fill with least answered
  for (const { id } of leastAnswered) {
    if (selectedIds.size >= targetCount) break;
    if (!selectedIds.has(id)) {
      selectedIds.add(id);
    }
  }

  // Then fill with wrong answers
  for (const { id } of wrongAnswers) {
    if (selectedIds.size >= targetCount) break;
    if (!selectedIds.has(id)) {
      selectedIds.add(id);
    }
  }

  // If we still need more, fill randomly from the pool
  if (selectedIds.size < targetCount) {
    const shuffledPool = [...questionPool];
    for (let i = shuffledPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
    }
    for (const qId of shuffledPool) {
      if (selectedIds.size >= targetCount) break;
      if (!selectedIds.has(qId)) {
        selectedIds.add(qId);
      }
    }
  }

  return Array.from(selectedIds);
}

/**
 * POST /api/sessions
 * Creates a new 20-question session using spaced repetition algorithm.
 *
 * Selection strategy:
 * - Default mode (no section): 5 questions from each of the 4 sections (20 total)
 *   with spaced repetition applied within each section
 * - Single-section mode: 20 questions from the specified section
 *   using spaced repetition (never-seen → wrong answers → random)
 *
 * Request body:
 * - section?: string - Filter questions by section (optional)
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { section } = body as { section?: Section | null };

  const db = getDb();
  const allQuestions = getQuestions();

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

  let selectedIds: string[];

  if (section) {
    // Single-section mode: 20 questions from the specified section
    const sectionQuestions = allQuestions.filter((q) => q.section === section);

    if (sectionQuestions.length === 0) {
      return NextResponse.json(
        { error: 'No questions available for the selected section' },
        { status: 400 }
      );
    }

    const sectionPool = sectionQuestions.map((q) => q.id);
    selectedIds = selectQuestionsFromPool(sectionPool, statsMap, 20);
  } else {
    // Multi-section mode: 5 questions from each of the 4 sections
    const sections = getSections();
    const allSelectedIds: string[] = [];

    for (const sec of sections) {
      const sectionQuestions = allQuestions.filter((q) => q.section === sec);
      const sectionPool = sectionQuestions.map((q) => q.id);
      const sectionSelection = selectQuestionsFromPool(
        sectionPool,
        statsMap,
        QUESTIONS_PER_SECTION
      );
      allSelectedIds.push(...sectionSelection);
    }

    selectedIds = allSelectedIds;
  }

  // Shuffle the final selection
  for (let i = selectedIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selectedIds[i], selectedIds[j]] = [selectedIds[j], selectedIds[i]];
  }

  // Create the session in database
  const sessionResult = db.prepare('INSERT INTO sessions DEFAULT VALUES').run();
  const sessionId = sessionResult.lastInsertRowid as number;

  // Get full question data
  const sessionQuestions = selectedIds.map((id) =>
    allQuestions.find((q) => q.id === id)!
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
