'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { QCode } from '@/types/qcodes';
import { useHints } from '@/components/HintsContext';

interface QCodeStats {
  total: number;
  unseen: number;
  weak: number;
  learning: number;
  strong: number;
  mastered: number;
}

interface QCodeResponse {
  qCode: QCode | null;
  phase: 'coverage' | 'drilling' | 'mastered';
  stats: QCodeStats;
  shuffledOrder?: string;
  currentIndex?: number;
}

interface RecentAnswer {
  questionId: string;
  answeredAt: number;
}

const RECENT_ANSWERS_KEY = 'recentQCodeAnswers';
const SHUFFLED_ORDER_KEY = 'qCodeShuffledOrder';
const CURRENT_INDEX_KEY = 'qCodeCurrentIndex';

function getRecentAnswers(): RecentAnswer[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_ANSWERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentAnswers(answers: RecentAnswer[]): void {
  if (typeof window === 'undefined') return;
  // Keep only last 20 answers
  const trimmed = answers.slice(-20);
  localStorage.setItem(RECENT_ANSWERS_KEY, JSON.stringify(trimmed));
}

function getShuffledOrder(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SHUFFLED_ORDER_KEY);
}

function saveShuffledOrder(order: string | null): void {
  if (typeof window === 'undefined') return;
  if (order) {
    localStorage.setItem(SHUFFLED_ORDER_KEY, order);
  } else {
    localStorage.removeItem(SHUFFLED_ORDER_KEY);
  }
}

function getCurrentIndex(): number {
  if (typeof window === 'undefined') return 0;
  const stored = localStorage.getItem(CURRENT_INDEX_KEY);
  return stored ? parseInt(stored, 10) : 0;
}

function saveCurrentIndex(index: number | null): void {
  if (typeof window === 'undefined') return;
  if (index !== null) {
    localStorage.setItem(CURRENT_INDEX_KEY, index.toString());
  } else {
    localStorage.removeItem(CURRENT_INDEX_KEY);
  }
}

export default function QCodesPage() {
  const { hintsEnabled, isHydrated } = useHints();

  const [currentQCode, setCurrentQCode] = useState<QCode | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'coverage' | 'drilling' | 'mastered'>('coverage');
  const [stats, setStats] = useState<QCodeStats | null>(null);

  const recentAnswersRef = useRef<RecentAnswer[]>([]);

  // Load recent answers on mount
  useEffect(() => {
    recentAnswersRef.current = getRecentAnswers();
  }, []);

  const loadNextQCode = useCallback(async () => {
    setLoading(true);
    setRevealed(false);
    try {
      const recentAnswers = recentAnswersRef.current;
      const shuffledOrder = getShuffledOrder();
      const currentIndex = getCurrentIndex();

      const params = new URLSearchParams();
      if (recentAnswers.length > 0) {
        params.set('recentTimestamps', JSON.stringify(recentAnswers));
        params.set('exclude', recentAnswers.map((r) => r.questionId).join(','));
      }
      if (shuffledOrder) {
        params.set('shuffledOrder', shuffledOrder);
        params.set('currentIndex', currentIndex.toString());
      }

      const url = `/api/q-codes/next${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to load Q code');
      }
      const data: QCodeResponse = await response.json();
      setCurrentQCode(data.qCode);
      setPhase(data.phase);
      setStats(data.stats);

      // Update shuffled order from response
      if (data.shuffledOrder !== undefined) {
        saveShuffledOrder(data.shuffledOrder);
      }
      if (data.currentIndex !== undefined) {
        saveCurrentIndex(data.currentIndex);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNextQCode();
  }, [loadNextQCode]);

  async function handleSelfAssessment(isCorrect: boolean) {
    if (!currentQCode || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: currentQCode.id,
          selectedAnswer: isCorrect ? 'CORRECT' : 'WRONG',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record attempt');
      }

      // Track recent answer
      const newAnswer: RecentAnswer = {
        questionId: currentQCode.id,
        answeredAt: Date.now(),
      };
      recentAnswersRef.current = [...recentAnswersRef.current, newAnswer];
      saveRecentAnswers(recentAnswersRef.current);

      // Load next Q code
      await loadNextQCode();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record attempt');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    // Clear coverage order to start fresh
    saveShuffledOrder(null);
    saveCurrentIndex(null);
    loadNextQCode();
  }

  if (loading && !currentQCode) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading Q codes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  // Mastery complete view
  if (phase === 'mastered') {
    return (
      <div className="space-y-6">
        {stats && <QCodeProgress stats={stats} />}

        <div className="bg-white rounded-xl shadow-md p-8 text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">
            All Q Codes Mastered!
          </h2>
          <p className="text-slate-600 mb-6">
            Congratulations! You've mastered all 18 Q codes.
          </p>
          <button
            onClick={handleReset}
            className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Practice Again
          </button>
        </div>
      </div>
    );
  }

  if (!currentQCode) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">No Q codes available</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-xl font-bold text-slate-800">Q Codes Practice</h1>

      {/* Progress */}
      {stats && <QCodeProgress stats={stats} />}

      {/* Flashcard */}
      <div className="bg-white rounded-xl shadow-md p-8">
        {/* Q Code display */}
        <div className="text-center mb-8">
          <div className="text-7xl font-bold text-blue-600 mb-4 font-mono">
            {currentQCode.code}
          </div>

          {/* Hint (when enabled) */}
          {isHydrated && hintsEnabled && !revealed && (
            <div className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg inline-block">
              💡 {currentQCode.hint}
            </div>
          )}
        </div>

        {/* Reveal button or answer */}
        {!revealed ? (
          <div className="text-center">
            <p className="text-slate-500 mb-4">What does this Q code mean?</p>
            <button
              onClick={() => setRevealed(true)}
              className="px-8 py-3 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-900 transition-colors"
            >
              Pokaż odpowiedź
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Answer reveal */}
            <div className="text-center p-6 bg-slate-50 rounded-lg">
              <p className="text-xl font-medium text-slate-800 mb-2">
                {currentQCode.meaning}
              </p>
              <p className="text-slate-500">
                {currentQCode.meaningEnglish}
              </p>
              {isHydrated && hintsEnabled && (
                <p className="text-sm text-amber-600 mt-3">
                  💡 {currentQCode.hint}
                </p>
              )}
            </div>

            {/* Self-assessment buttons */}
            <div className="flex justify-center gap-4">
              <button
                onClick={() => handleSelfAssessment(false)}
                disabled={submitting}
                className="flex-1 max-w-xs px-6 py-4 rounded-lg bg-red-100 text-red-700 font-medium hover:bg-red-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="text-xl">✗</span>
                <span>Nie wiedziałem</span>
              </button>
              <button
                onClick={() => handleSelfAssessment(true)}
                disabled={submitting}
                className="flex-1 max-w-xs px-6 py-4 rounded-lg bg-green-100 text-green-700 font-medium hover:bg-green-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="text-xl">✓</span>
                <span>Wiedziałem</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QCodeProgress({ stats }: { stats: QCodeStats }) {
  const masteredPercent = (stats.mastered / stats.total) * 100;
  const strongPercent = (stats.strong / stats.total) * 100;
  const learningPercent = (stats.learning / stats.total) * 100;
  const weakPercent = (stats.weak / stats.total) * 100;
  const unseenPercent = (stats.unseen / stats.total) * 100;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
        <span>Progress</span>
        <span>{stats.mastered} / {stats.total} mastered</span>
      </div>

      {/* Progress bar */}
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
        {masteredPercent > 0 && (
          <div
            className="bg-green-500 transition-all duration-300"
            style={{ width: `${masteredPercent}%` }}
            title={`Mastered: ${stats.mastered}`}
          />
        )}
        {strongPercent > 0 && (
          <div
            className="bg-emerald-400 transition-all duration-300"
            style={{ width: `${strongPercent}%` }}
            title={`Strong: ${stats.strong}`}
          />
        )}
        {learningPercent > 0 && (
          <div
            className="bg-amber-400 transition-all duration-300"
            style={{ width: `${learningPercent}%` }}
            title={`Learning: ${stats.learning}`}
          />
        )}
        {weakPercent > 0 && (
          <div
            className="bg-red-400 transition-all duration-300"
            style={{ width: `${weakPercent}%` }}
            title={`Weak: ${stats.weak}`}
          />
        )}
        {unseenPercent > 0 && (
          <div
            className="bg-slate-300 transition-all duration-300"
            style={{ width: `${unseenPercent}%` }}
            title={`Unseen: ${stats.unseen}`}
          />
        )}
      </div>

      {/* Legend - show all 5 categories */}
      <div className="flex flex-wrap justify-center gap-4 mt-3 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Mastered ({stats.mastered})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-emerald-400" />
          <span>Strong ({stats.strong})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <span>Learning ({stats.learning})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span>Weak ({stats.weak})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-slate-300" />
          <span>Unseen ({stats.unseen})</span>
        </div>
      </div>
    </div>
  );
}
