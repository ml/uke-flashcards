import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAlphabet, getAlphabetIds } from '@/lib/alphabet';
import {
  getQuestionStats,
  determinePhase,
  categorizeQuestions,
  getStatsSummary,
  type ConfidenceLevel,
} from '@/lib/questionStats';
import type { PhoneticLetter, AlphabetType, AlphabetStats } from '@/types/alphabet';

interface RecentAnswer {
  questionId: string;
  answeredAt: number;
}

// Selection weights by confidence level
const SELECTION_WEIGHTS: Record<Exclude<ConfidenceLevel, 'unseen' | 'mastered'>, number> = {
  weak: 70,
  learning: 25,
  strong: 5,
};

// Cooling period for small pool (26 letters)
const COOLING_PERIOD_MS = 1 * 60 * 1000; // 1 minute
const COOLING_LETTER_COUNT = 3;

/**
 * GET /api/alphabet/next
 *
 * Smart alphabet letter selection using spaced repetition.
 *
 * Query params:
 * - type: 'polish' | 'nato' (required)
 * - exclude?: string - Comma-separated letter IDs to exclude (recent answers)
 * - recentTimestamps?: string - JSON array of {questionId, answeredAt} for time-based cooling
 * - shuffledOrder?: string - Comma-separated letter IDs for coverage phase order
 * - currentIndex?: number - Current position in coverage phase
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const typeParam = searchParams.get('type') as AlphabetType | null;
  const excludeParam = searchParams.get('exclude');
  const recentTimestampsParam = searchParams.get('recentTimestamps');
  const shuffledOrderParam = searchParams.get('shuffledOrder');
  const currentIndexParam = searchParams.get('currentIndex');

  // Validate required type parameter
  if (!typeParam || (typeParam !== 'polish' && typeParam !== 'nato')) {
    return NextResponse.json(
      { error: 'Missing or invalid "type" parameter. Must be "polish" or "nato".' },
      { status: 400 }
    );
  }

  const db = getDb();
  const letters = getAlphabet(typeParam);
  const letterIds = getAlphabetIds(typeParam);

  // Get stats using shared function
  const statsMap = getQuestionStats(db);

  // Determine phase
  const phase = determinePhase(letterIds, statsMap);

  // Get summary stats (5 categories)
  const rawSummary = getStatsSummary(letterIds, statsMap);
  const summary: AlphabetStats = {
    total: rawSummary.total,
    unseen: rawSummary.unseen,
    weak: rawSummary.weak,
    learning: rawSummary.learning,
    strong: rawSummary.strong,
    mastered: rawSummary.mastered,
  };

  // If all mastered, return early
  if (phase === 'mastered') {
    return NextResponse.json({
      letter: null,
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

  // Also exclude last N letters answered (count-based cooling)
  const recentLetterIds = recentAnswers
    .sort((a, b) => b.answeredAt - a.answeredAt)
    .slice(0, COOLING_LETTER_COUNT)
    .map((r) => r.questionId);
  for (const letterId of recentLetterIds) {
    excludeIds.add(letterId);
  }

  let selectedLetter: PhoneticLetter | null = null;
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
      // Generate new shuffled order (only unseen letters)
      const categories = categorizeQuestions(letterIds, statsMap);
      shuffledOrder = [...categories.unseen];
      // Shuffle using Fisher-Yates
      for (let i = shuffledOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
      }
      currentIndex = 0;
    }

    // Find next letter in shuffled order that's not excluded
    while (currentIndex < shuffledOrder.length) {
      const letterId = shuffledOrder[currentIndex];
      if (!excludeIds.has(letterId)) {
        selectedLetter = letters.find((l) => l.id === letterId) || null;
        if (selectedLetter) {
          newShuffledOrder = shuffledOrder;
          newCurrentIndex = currentIndex + 1;
          break;
        }
      }
      currentIndex++;
    }

    // If we've exhausted the shuffled order but still have unseen
    if (!selectedLetter) {
      const categories = categorizeQuestions(letterIds, statsMap);
      if (categories.unseen.length > 0) {
        const unseenNotExcluded = categories.unseen.filter((id) => !excludeIds.has(id));
        if (unseenNotExcluded.length > 0) {
          const randomIndex = Math.floor(Math.random() * unseenNotExcluded.length);
          selectedLetter = letters.find((l) => l.id === unseenNotExcluded[randomIndex]) || null;
        } else {
          // All unseen are in cooling - ignore cooling and pick randomly
          const randomIndex = Math.floor(Math.random() * categories.unseen.length);
          selectedLetter = letters.find((l) => l.id === categories.unseen[randomIndex]) || null;
        }
      }
    }
  }

  // Drilling phase or coverage fallback
  if (phase === 'drilling' || (phase === 'coverage' && !selectedLetter)) {
    selectedLetter = selectWeightedLetter(letters, statsMap, excludeIds);

    // Fallback: if all non-mastered letters are in cooling, ignore cooling
    if (!selectedLetter) {
      selectedLetter = selectWeightedLetter(letters, statsMap, new Set());
    }
  }

  if (!selectedLetter) {
    return NextResponse.json({
      letter: null,
      phase: 'mastered',
      stats: summary,
    });
  }

  const letterStats = statsMap.get(selectedLetter.id);

  return NextResponse.json({
    letter: selectedLetter,
    phase,
    stats: summary,
    letterStats: letterStats || {
      questionId: selectedLetter.id,
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
 * Select a letter using weighted random selection based on confidence levels.
 * Excludes mastered letters and applies cooling period.
 */
function selectWeightedLetter(
  letters: PhoneticLetter[],
  statsMap: Map<string, { confidenceLevel: ConfidenceLevel; lastAttemptAt: string | null }>,
  excludeIds: Set<string>
): PhoneticLetter | null {
  const letterIds = letters.map((l) => l.id);
  const categories = categorizeQuestions(
    letterIds,
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

  // Filter out excluded and mastered letters
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
      return letters.find((l) => l.id === item.id) || null;
    }
  }

  // Fallback to first item
  return letters.find((l) => l.id === pool[0].id) || null;
}
