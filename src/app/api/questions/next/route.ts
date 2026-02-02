import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQuestions } from '@/lib/questions';
import {
  getQuestionStats,
  determinePhase,
  categorizeQuestions,
  getStatsSummary,
  type ConfidenceLevel,
} from '@/lib/questionStats';
import type { Section, Question } from '@/types/questions';

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

// Cooling period: 5 minutes in milliseconds
const COOLING_PERIOD_MS = 5 * 60 * 1000;
const COOLING_QUESTION_COUNT = 10;

/**
 * GET /api/questions/next
 *
 * Smart question selection for study mode.
 *
 * Query params:
 * - section?: string - Filter by section
 * - exclude?: string - Comma-separated question IDs to exclude (recent answers)
 * - recentTimestamps?: string - JSON array of {questionId, answeredAt} for time-based cooling
 * - phase?: 'coverage' | 'drilling' - Force a specific phase (optional, auto-detected if not provided)
 * - shuffledOrder?: string - Comma-separated question IDs for coverage phase order
 * - currentIndex?: number - Current position in coverage phase
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const section = searchParams.get('section') as Section | null;
  const excludeParam = searchParams.get('exclude');
  const recentTimestampsParam = searchParams.get('recentTimestamps');
  const forcePhase = searchParams.get('phase') as 'coverage' | 'drilling' | null;
  const shuffledOrderParam = searchParams.get('shuffledOrder');
  const currentIndexParam = searchParams.get('currentIndex');

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

  const questionIds = availableQuestions.map((q) => q.id);
  const statsMap = getQuestionStats(db);

  // Determine phase
  const computedPhase = determinePhase(questionIds, statsMap);
  const phase = forcePhase || computedPhase;

  // Get summary stats
  const summary = getStatsSummary(questionIds, statsMap);

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

  let selectedQuestion: Question | null = null;
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
      // Generate new shuffled order (only unseen questions)
      const categories = categorizeQuestions(questionIds, statsMap);
      shuffledOrder = [...categories.unseen];
      // Shuffle using Fisher-Yates
      for (let i = shuffledOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
      }
      currentIndex = 0;
    }

    // Find next question in shuffled order that's not excluded
    while (currentIndex < shuffledOrder.length) {
      const qId = shuffledOrder[currentIndex];
      if (!excludeIds.has(qId)) {
        selectedQuestion = availableQuestions.find((q) => q.id === qId) || null;
        if (selectedQuestion) {
          newShuffledOrder = shuffledOrder;
          newCurrentIndex = currentIndex + 1;
          break;
        }
      }
      currentIndex++;
    }

    // If we've exhausted the shuffled order, switch to drilling
    if (!selectedQuestion) {
      const updatedPhase = determinePhase(questionIds, statsMap);
      if (updatedPhase === 'coverage') {
        // Still have unseen questions, regenerate order
        const categories = categorizeQuestions(questionIds, statsMap);
        if (categories.unseen.length > 0) {
          const unseenNotExcluded = categories.unseen.filter((id) => !excludeIds.has(id));
          if (unseenNotExcluded.length > 0) {
            const randomIndex = Math.floor(Math.random() * unseenNotExcluded.length);
            selectedQuestion =
              availableQuestions.find((q) => q.id === unseenNotExcluded[randomIndex]) || null;
          }
        }
      }
    }
  }

  if (phase === 'drilling' || (phase === 'coverage' && !selectedQuestion)) {
    // Drilling phase: weighted random selection
    selectedQuestion = selectWeightedQuestion(
      availableQuestions,
      statsMap,
      excludeIds
    );
  }

  if (phase === 'mastered' || !selectedQuestion) {
    // All mastered or no questions available
    return NextResponse.json({
      question: null,
      phase: 'mastered',
      stats: summary,
      message: 'All questions mastered! Great job!',
    });
  }

  const questionStats = statsMap.get(selectedQuestion.id);

  return NextResponse.json({
    question: selectedQuestion,
    phase,
    stats: summary,
    questionStats: questionStats || {
      questionId: selectedQuestion.id,
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
 * Select a question using weighted random selection based on confidence levels.
 * Excludes mastered questions and applies cooling period.
 */
function selectWeightedQuestion(
  questions: Question[],
  statsMap: Map<string, { confidenceLevel: ConfidenceLevel; lastAttemptAt: string | null }>,
  excludeIds: Set<string>
): Question | null {
  const categories = categorizeQuestions(
    questions.map((q) => q.id),
    statsMap as Map<string, { questionId: string; totalAttempts: number; correctAttempts: number; lastAttemptAt: string | null; lastWasCorrect: boolean | null; confidenceLevel: ConfidenceLevel; accuracy: number }>
  );

  // Filter out excluded questions and mastered questions
  const weak = categories.weak.filter((id) => !excludeIds.has(id));
  const learning = categories.learning.filter((id) => !excludeIds.has(id));
  const strong = categories.strong.filter((id) => !excludeIds.has(id));

  // Sort weak questions by most recent failure first
  weak.sort((a, b) => {
    const statsA = statsMap.get(a);
    const statsB = statsMap.get(b);
    const timeA = statsA?.lastAttemptAt || '';
    const timeB = statsB?.lastAttemptAt || '';
    return timeB.localeCompare(timeA); // Most recent first
  });

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
      return questions.find((q) => q.id === item.id) || null;
    }
  }

  // Fallback to first item
  return questions.find((q) => q.id === pool[0].id) || null;
}
