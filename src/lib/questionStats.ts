import type { Database } from 'better-sqlite3';

export type ConfidenceLevel = 'unseen' | 'weak' | 'learning' | 'strong' | 'mastered';

export interface QuestionStats {
  questionId: string;
  totalAttempts: number;
  correctAttempts: number;
  lastAttemptAt: string | null;
  lastWasCorrect: boolean | null;
  confidenceLevel: ConfidenceLevel;
  accuracy: number; // 0-100
}

interface RawAttemptStats {
  question_id: string;
  total_attempts: number;
  correct_attempts: number;
  last_attempt_at: string;
  last_was_correct: number;
}

/**
 * Compute confidence level based on attempt statistics.
 *
 * Levels:
 * - unseen: 0 attempts
 * - weak: last attempt wrong OR accuracy < 50%
 * - learning: accuracy 50-80%
 * - strong: accuracy > 80% AND attempts >= 2
 * - mastered: accuracy = 100% AND attempts >= 3
 */
export function computeConfidenceLevel(
  totalAttempts: number,
  correctAttempts: number,
  lastWasCorrect: boolean | null
): ConfidenceLevel {
  if (totalAttempts === 0) {
    return 'unseen';
  }

  const accuracy = (correctAttempts / totalAttempts) * 100;

  // Mastered: 100% accuracy with at least 3 attempts
  if (accuracy === 100 && totalAttempts >= 3) {
    return 'mastered';
  }

  // Weak: last attempt was wrong OR accuracy below 50%
  if (lastWasCorrect === false || accuracy < 50) {
    return 'weak';
  }

  // Strong: accuracy above 80% with at least 2 attempts
  if (accuracy > 80 && totalAttempts >= 2) {
    return 'strong';
  }

  // Learning: everything else (50-80% accuracy)
  return 'learning';
}

/**
 * Get statistics for all questions from the database.
 * Returns a map of questionId -> QuestionStats.
 */
export function getQuestionStats(db: Database): Map<string, QuestionStats> {
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
         ORDER BY created_at DESC LIMIT 1) as last_was_correct
      FROM attempts
      GROUP BY question_id
    `
    )
    .all() as RawAttemptStats[];

  const statsMap = new Map<string, QuestionStats>();

  for (const stat of stats) {
    const totalAttempts = stat.total_attempts;
    const correctAttempts = stat.correct_attempts;
    const lastWasCorrect = stat.last_was_correct === 1;
    const accuracy = totalAttempts > 0 ? (correctAttempts / totalAttempts) * 100 : 0;

    statsMap.set(stat.question_id, {
      questionId: stat.question_id,
      totalAttempts,
      correctAttempts,
      lastAttemptAt: stat.last_attempt_at,
      lastWasCorrect,
      confidenceLevel: computeConfidenceLevel(totalAttempts, correctAttempts, lastWasCorrect),
      accuracy,
    });
  }

  return statsMap;
}

/**
 * Determine the current study phase based on question statistics.
 *
 * - coverage: There are still unseen questions
 * - drilling: All questions seen, but some are weak/learning
 * - mastered: All questions are mastered
 */
export function determinePhase(
  questionIds: string[],
  statsMap: Map<string, QuestionStats>
): 'coverage' | 'drilling' | 'mastered' {
  let unseenCount = 0;
  let masteredCount = 0;

  for (const qId of questionIds) {
    const stats = statsMap.get(qId);
    if (!stats) {
      unseenCount++;
    } else if (stats.confidenceLevel === 'mastered') {
      masteredCount++;
    }
  }

  if (unseenCount > 0) {
    return 'coverage';
  }

  if (masteredCount === questionIds.length) {
    return 'mastered';
  }

  return 'drilling';
}

/**
 * Categorize questions by confidence level.
 */
export function categorizeQuestions(
  questionIds: string[],
  statsMap: Map<string, QuestionStats>
): Record<ConfidenceLevel, string[]> {
  const categories: Record<ConfidenceLevel, string[]> = {
    unseen: [],
    weak: [],
    learning: [],
    strong: [],
    mastered: [],
  };

  for (const qId of questionIds) {
    const stats = statsMap.get(qId);
    const level = stats ? stats.confidenceLevel : 'unseen';
    categories[level].push(qId);
  }

  return categories;
}

/**
 * Get summary statistics for a set of questions.
 */
export function getStatsSummary(
  questionIds: string[],
  statsMap: Map<string, QuestionStats>
): {
  total: number;
  unseen: number;
  weak: number;
  learning: number;
  strong: number;
  mastered: number;
  seenCount: number;
  seenPercentage: number;
} {
  const categories = categorizeQuestions(questionIds, statsMap);

  const total = questionIds.length;
  const unseen = categories.unseen.length;
  const seenCount = total - unseen;
  const seenPercentage = total > 0 ? Math.round((seenCount / total) * 100) : 0;

  return {
    total,
    unseen,
    weak: categories.weak.length,
    learning: categories.learning.length,
    strong: categories.strong.length,
    mastered: categories.mastered.length,
    seenCount,
    seenPercentage,
  };
}
