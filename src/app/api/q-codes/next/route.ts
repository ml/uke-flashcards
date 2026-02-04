import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQCodes } from '@/lib/qcodes';
import {
  getQuestionStats,
  determinePhase,
  categorizeQuestions,
  getStatsSummary,
  type ConfidenceLevel,
} from '@/lib/questionStats';
import type { QCode } from '@/types/qcodes';

interface RecentAnswer {
  questionId: string;
  answeredAt: number;
}

// Selection weights by confidence level (same as study)
const SELECTION_WEIGHTS: Record<Exclude<ConfidenceLevel, 'unseen' | 'mastered'>, number> = {
  weak: 70,
  learning: 25,
  strong: 5,
};

// Reduced cooling period for small pool (18 Q codes vs 500+ questions)
const COOLING_PERIOD_MS = 1 * 60 * 1000; // 1 minute
const COOLING_QUESTION_COUNT = 3;

/**
 * GET /api/q-codes/next
 *
 * Smart Q code selection using spaced repetition.
 *
 * Query params:
 * - exclude?: string - Comma-separated Q code IDs to exclude (recent answers)
 * - recentTimestamps?: string - JSON array of {questionId, answeredAt} for time-based cooling
 * - shuffledOrder?: string - Comma-separated Q code IDs for coverage phase order
 * - currentIndex?: number - Current position in coverage phase
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const excludeParam = searchParams.get('exclude');
  const recentTimestampsParam = searchParams.get('recentTimestamps');
  const shuffledOrderParam = searchParams.get('shuffledOrder');
  const currentIndexParam = searchParams.get('currentIndex');

  const db = getDb();
  const qCodes = getQCodes();
  const qCodeIds = qCodes.map((q) => q.id);

  // Get stats using shared function
  const statsMap = getQuestionStats(db);

  // Determine phase
  const phase = determinePhase(qCodeIds, statsMap);

  // Get summary stats (5 categories)
  const summary = getStatsSummary(qCodeIds, statsMap);

  // If all mastered, return early
  if (phase === 'mastered') {
    return NextResponse.json({
      qCode: null,
      phase: 'mastered',
      stats: summary,
    });
  }

  // Parse exclusions for cooling period
  const excludeIds = new Set(excludeParam ? excludeParam.split(',') : []);
  let recentAnswers: RecentAnswer[] = [];
  if (recentTimestampsParam) {
    try {
      recentAnswers = JSON.parse(recentTimestampsParam);
    } catch {
      // Ignore parse errors
    }
  }

  // Apply time-based cooling
  const now = Date.now();
  for (const recent of recentAnswers) {
    if (now - recent.answeredAt < COOLING_PERIOD_MS) {
      excludeIds.add(recent.questionId);
    }
  }

  // Also exclude last N questions answered (count-based cooling)
  const recentQuestionIds = recentAnswers
    .sort((a, b) => b.answeredAt - a.answeredAt)
    .slice(0, COOLING_QUESTION_COUNT)
    .map((r) => r.questionId);
  for (const qId of recentQuestionIds) {
    excludeIds.add(qId);
  }

  let selectedQCode: QCode | null = null;
  let newShuffledOrder: string[] | null = null;
  let newCurrentIndex: number | null = null;

  if (phase === 'coverage') {
    // Coverage phase: go through shuffled order
    let shuffledOrder: string[] = [];
    let currentIndex = 0;

    if (shuffledOrderParam) {
      shuffledOrder = shuffledOrderParam.split(',');
      currentIndex = currentIndexParam ? parseInt(currentIndexParam, 10) : 0;
    } else {
      // Generate new shuffled order (only unseen Q codes)
      const categories = categorizeQuestions(qCodeIds, statsMap);
      shuffledOrder = [...categories.unseen];
      // Shuffle using Fisher-Yates
      for (let i = shuffledOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
      }
      currentIndex = 0;
    }

    // Find next Q code in shuffled order that's not excluded
    while (currentIndex < shuffledOrder.length) {
      const qId = shuffledOrder[currentIndex];
      if (!excludeIds.has(qId)) {
        selectedQCode = qCodes.find((q) => q.id === qId) || null;
        if (selectedQCode) {
          newShuffledOrder = shuffledOrder;
          newCurrentIndex = currentIndex + 1;
          break;
        }
      }
      currentIndex++;
    }

    // If we've exhausted the shuffled order but still have unseen
    if (!selectedQCode) {
      const categories = categorizeQuestions(qCodeIds, statsMap);
      if (categories.unseen.length > 0) {
        const unseenNotExcluded = categories.unseen.filter((id) => !excludeIds.has(id));
        if (unseenNotExcluded.length > 0) {
          const randomIndex = Math.floor(Math.random() * unseenNotExcluded.length);
          selectedQCode = qCodes.find((q) => q.id === unseenNotExcluded[randomIndex]) || null;
        } else {
          // All unseen are in cooling - ignore cooling and pick randomly
          const randomIndex = Math.floor(Math.random() * categories.unseen.length);
          selectedQCode = qCodes.find((q) => q.id === categories.unseen[randomIndex]) || null;
        }
      }
    }
  }

  // Drilling phase or coverage fallback
  if (phase === 'drilling' || (phase === 'coverage' && !selectedQCode)) {
    selectedQCode = selectWeightedQCode(qCodes, statsMap, excludeIds);

    // Fallback: if all non-mastered Q codes are in cooling, ignore cooling
    if (!selectedQCode) {
      selectedQCode = selectWeightedQCode(qCodes, statsMap, new Set());
    }
  }

  if (!selectedQCode) {
    return NextResponse.json({
      qCode: null,
      phase: 'mastered',
      stats: summary,
    });
  }

  const qCodeStats = statsMap.get(selectedQCode.id);

  return NextResponse.json({
    qCode: selectedQCode,
    phase,
    stats: summary,
    questionStats: qCodeStats || {
      questionId: selectedQCode.id,
      totalAttempts: 0,
      correctAttempts: 0,
      lastAttemptAt: null,
      lastWasCorrect: null,
      confidenceLevel: 'unseen',
      accuracy: 0,
    },
    ...(newShuffledOrder && { shuffledOrder: newShuffledOrder.join(',') }),
    ...(newCurrentIndex !== null && { currentIndex: newCurrentIndex }),
  });
}

/**
 * Select a Q code using weighted random selection based on confidence levels.
 * Excludes mastered Q codes and applies cooling period.
 */
function selectWeightedQCode(
  qCodes: QCode[],
  statsMap: Map<string, { confidenceLevel: ConfidenceLevel; lastAttemptAt: string | null }>,
  excludeIds: Set<string>
): QCode | null {
  const qCodeIds = qCodes.map((q) => q.id);
  const categories = categorizeQuestions(
    qCodeIds,
    statsMap as Map<
      string,
      {
        questionId: string;
        totalAttempts: number;
        correctAttempts: number;
        lastAttemptAt: string | null;
        lastWasCorrect: boolean | null;
        confidenceLevel: ConfidenceLevel;
        accuracy: number;
      }
    >
  );

  // Filter out excluded and mastered Q codes
  const weak = categories.weak.filter((id) => !excludeIds.has(id));
  const learning = categories.learning.filter((id) => !excludeIds.has(id));
  const strong = categories.strong.filter((id) => !excludeIds.has(id));

  // Build weighted pool
  const pool: { id: string; weight: number }[] = [];

  for (const id of weak) {
    pool.push({ id, weight: SELECTION_WEIGHTS.weak });
  }
  for (const id of learning) {
    pool.push({ id, weight: SELECTION_WEIGHTS.learning });
  }
  for (const id of strong) {
    pool.push({ id, weight: SELECTION_WEIGHTS.strong });
  }

  if (pool.length === 0) {
    return null;
  }

  // Weighted random selection
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;

  for (const item of pool) {
    random -= item.weight;
    if (random <= 0) {
      return qCodes.find((q) => q.id === item.id) || null;
    }
  }

  // Fallback to first item
  return qCodes.find((q) => q.id === pool[0].id) || null;
}
