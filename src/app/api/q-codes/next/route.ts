import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQCodes } from '@/lib/qcodes';

interface AttemptStats {
  question_id: string;
  total_attempts: number;
  correct_attempts: number;
  last_attempt_at: string;
  last_was_wrong: number;
}

interface QCodeStats {
  total: number;
  mastered: number;
  learning: number;
  unseen: number;
}

/**
 * GET /api/q-codes/next
 * Returns the next Q code to study using spaced repetition.
 * Prioritizes: never-seen → wrong answers (recent failures first) → least answered.
 */
export async function GET() {
  const db = getDb();
  const qCodes = getQCodes();
  const qCodeIds = qCodes.map((q) => q.id);

  // Get attempt statistics for Q codes only (prefixed with QC-)
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
      WHERE question_id LIKE 'QC-%'
      GROUP BY question_id
    `
    )
    .all() as AttemptStats[];

  const statsMap = new Map(stats.map((s) => [s.question_id, s]));

  // Categorize Q codes
  const neverSeen: string[] = [];
  const wrongAnswers: { id: string; lastAttempt: string; isRecentWrong: boolean }[] = [];
  const leastAnswered: { id: string; attempts: number }[] = [];
  let masteredCount = 0;

  for (const qId of qCodeIds) {
    const stat = statsMap.get(qId);
    if (!stat) {
      neverSeen.push(qId);
    } else {
      // Consider mastered if answered correctly at least 3 times and last was correct
      const isMastered = stat.correct_attempts >= 3 && !stat.last_was_wrong;
      if (isMastered) {
        masteredCount++;
      }

      leastAnswered.push({ id: qId, attempts: stat.total_attempts });

      if (stat.last_was_wrong) {
        wrongAnswers.push({
          id: qId,
          lastAttempt: stat.last_attempt_at,
          isRecentWrong: true,
        });
      } else if (stat.total_attempts > stat.correct_attempts) {
        // Has some wrong answers but last was correct
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
  // Sort: recent failures first, then by last attempt (most recent first for review)
  wrongAnswers.sort((a, b) => {
    if (a.isRecentWrong !== b.isRecentWrong) {
      return a.isRecentWrong ? -1 : 1;
    }
    return b.lastAttempt.localeCompare(a.lastAttempt);
  });

  // Select the next Q code to show
  let selectedId: string | null = null;

  // Priority 1: Never-seen codes (shuffled to add variety)
  if (neverSeen.length > 0) {
    const shuffled = [...neverSeen];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    selectedId = shuffled[0];
  }

  // Priority 2: Wrong answers (recent failures first)
  if (!selectedId && wrongAnswers.length > 0) {
    selectedId = wrongAnswers[0].id;
  }

  // Priority 3: Least answered (for drilling)
  if (!selectedId && leastAnswered.length > 0) {
    selectedId = leastAnswered[0].id;
  }

  // Calculate stats
  const learningCount = qCodeIds.length - neverSeen.length - masteredCount;
  const qCodeStats: QCodeStats = {
    total: qCodeIds.length,
    mastered: masteredCount,
    learning: learningCount,
    unseen: neverSeen.length,
  };

  // If all are mastered, return mastered phase
  if (masteredCount === qCodeIds.length) {
    return NextResponse.json({
      qCode: null,
      phase: 'mastered',
      stats: qCodeStats,
    });
  }

  const selectedQCode = qCodes.find((q) => q.id === selectedId);

  return NextResponse.json({
    qCode: selectedQCode || null,
    phase: neverSeen.length > 0 ? 'coverage' : 'drilling',
    stats: qCodeStats,
  });
}
