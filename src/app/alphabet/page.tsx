'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PhoneticLetter, AlphabetType, AlphabetStats, AlphabetResponse } from '@/types/alphabet';
import { AlphabetProgress } from '@/components/AlphabetProgress';
import { LetterMultipleChoice } from '@/components/LetterMultipleChoice';
import { useHints } from '@/components/HintsContext';

type PracticeMode = 'flashcard' | 'quiz';

interface RecentAnswer {
  questionId: string;
  answeredAt: number;
}

const STORAGE_KEYS = {
  selectedAlphabet: 'alphabet_selectedType',
  polishRecentAnswers: 'alphabet_polish_recentAnswers',
  natoRecentAnswers: 'alphabet_nato_recentAnswers',
  polishShuffledOrder: 'alphabet_polish_shuffledOrder',
  natoShuffledOrder: 'alphabet_nato_shuffledOrder',
  polishCurrentIndex: 'alphabet_polish_currentIndex',
  natoCurrentIndex: 'alphabet_nato_currentIndex',
  practiceMode: 'alphabet_practiceMode',
};

function getStorageKey(base: string, type: AlphabetType): string {
  return type === 'polish' ? STORAGE_KEYS.polishRecentAnswers.replace('RecentAnswers', base.replace('alphabet_', '')) : STORAGE_KEYS.natoRecentAnswers.replace('RecentAnswers', base.replace('alphabet_', ''));
}

function getRecentAnswers(type: AlphabetType): RecentAnswer[] {
  if (typeof window === 'undefined') return [];
  const key = type === 'polish' ? STORAGE_KEYS.polishRecentAnswers : STORAGE_KEYS.natoRecentAnswers;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentAnswers(type: AlphabetType, answers: RecentAnswer[]): void {
  if (typeof window === 'undefined') return;
  const key = type === 'polish' ? STORAGE_KEYS.polishRecentAnswers : STORAGE_KEYS.natoRecentAnswers;
  const trimmed = answers.slice(-20);
  localStorage.setItem(key, JSON.stringify(trimmed));
}

function getShuffledOrder(type: AlphabetType): string | null {
  if (typeof window === 'undefined') return null;
  const key = type === 'polish' ? STORAGE_KEYS.polishShuffledOrder : STORAGE_KEYS.natoShuffledOrder;
  return localStorage.getItem(key);
}

function saveShuffledOrder(type: AlphabetType, order: string | null): void {
  if (typeof window === 'undefined') return;
  const key = type === 'polish' ? STORAGE_KEYS.polishShuffledOrder : STORAGE_KEYS.natoShuffledOrder;
  if (order) {
    localStorage.setItem(key, order);
  } else {
    localStorage.removeItem(key);
  }
}

function getCurrentIndex(type: AlphabetType): number {
  if (typeof window === 'undefined') return 0;
  const key = type === 'polish' ? STORAGE_KEYS.polishCurrentIndex : STORAGE_KEYS.natoCurrentIndex;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : 0;
}

function saveCurrentIndex(type: AlphabetType, index: number | null): void {
  if (typeof window === 'undefined') return;
  const key = type === 'polish' ? STORAGE_KEYS.polishCurrentIndex : STORAGE_KEYS.natoCurrentIndex;
  if (index !== null) {
    localStorage.setItem(key, index.toString());
  } else {
    localStorage.removeItem(key);
  }
}

function getSelectedAlphabet(): AlphabetType | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEYS.selectedAlphabet);
  if (stored === 'polish' || stored === 'nato') return stored;
  return null;
}

function saveSelectedAlphabet(type: AlphabetType): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.selectedAlphabet, type);
}

function getPracticeMode(): PracticeMode {
  if (typeof window === 'undefined') return 'flashcard';
  const stored = localStorage.getItem(STORAGE_KEYS.practiceMode);
  if (stored === 'quiz') return 'quiz';
  return 'flashcard';
}

function savePracticeMode(mode: PracticeMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.practiceMode, mode);
}

export default function AlphabetPage() {
  const { hintsEnabled, isHydrated } = useHints();

  const [selectedType, setSelectedType] = useState<AlphabetType | null>(null);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('flashcard');
  const [currentLetter, setCurrentLetter] = useState<PhoneticLetter | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'coverage' | 'drilling' | 'mastered'>('coverage');
  const [stats, setStats] = useState<AlphabetStats | null>(null);
  const [allLetters, setAllLetters] = useState<PhoneticLetter[]>([]);

  const recentAnswersRef = useRef<RecentAnswer[]>([]);
  const [mounted, setMounted] = useState(false);

  // Handle initial mount and localStorage
  useEffect(() => {
    setMounted(true);
    const savedType = getSelectedAlphabet();
    const savedMode = getPracticeMode();
    setSelectedType(savedType);
    setPracticeMode(savedMode);
    if (savedType) {
      recentAnswersRef.current = getRecentAnswers(savedType);
    }
  }, []);

  const loadNextLetter = useCallback(async () => {
    if (!selectedType) return;

    setLoading(true);
    setRevealed(false);
    try {
      const recentAnswers = recentAnswersRef.current;
      const shuffledOrder = getShuffledOrder(selectedType);
      const currentIndex = getCurrentIndex(selectedType);

      const params = new URLSearchParams();
      params.set('type', selectedType);
      if (recentAnswers.length > 0) {
        params.set('recentTimestamps', JSON.stringify(recentAnswers));
        params.set('exclude', recentAnswers.map((r) => r.questionId).join(','));
      }
      if (shuffledOrder) {
        params.set('shuffledOrder', shuffledOrder);
        params.set('currentIndex', currentIndex.toString());
      }

      const url = `/api/alphabet/next?${params.toString()}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to load letter');
      }
      const data: AlphabetResponse & { allLetters?: PhoneticLetter[] } = await response.json();
      setCurrentLetter(data.letter);
      setPhase(data.phase);
      setStats(data.stats);

      // Update shuffled order from response
      if (data.shuffledOrder !== undefined) {
        saveShuffledOrder(selectedType, data.shuffledOrder);
      }
      if (data.currentIndex !== undefined) {
        saveCurrentIndex(selectedType, data.currentIndex);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

  // Fetch all letters for quiz mode distractors
  useEffect(() => {
    if (!selectedType) return;

    async function fetchAllLetters() {
      try {
        const response = await fetch(`/api/alphabet/all?type=${selectedType}`);
        if (response.ok) {
          const data = await response.json();
          setAllLetters(data.letters || []);
        }
      } catch {
        // Ignore - will fallback to empty
      }
    }

    fetchAllLetters();
  }, [selectedType]);

  useEffect(() => {
    if (selectedType) {
      loadNextLetter();
    } else {
      setLoading(false);
    }
  }, [selectedType, loadNextLetter]);

  function handleAlphabetChange(type: AlphabetType) {
    setSelectedType(type);
    saveSelectedAlphabet(type);
    recentAnswersRef.current = getRecentAnswers(type);
    setCurrentLetter(null);
    setStats(null);
    setPhase('coverage');
    setError(null);
  }

  function handleModeChange(mode: PracticeMode) {
    setPracticeMode(mode);
    savePracticeMode(mode);
    setRevealed(false);
  }

  async function handleSelfAssessment(isCorrect: boolean) {
    if (!currentLetter || !selectedType || submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: currentLetter.id,
          selectedAnswer: isCorrect ? 'CORRECT' : 'WRONG',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record attempt');
      }

      // Track recent answer
      const newAnswer: RecentAnswer = {
        questionId: currentLetter.id,
        answeredAt: Date.now(),
      };
      recentAnswersRef.current = [...recentAnswersRef.current, newAnswer];
      saveRecentAnswers(selectedType, recentAnswersRef.current);

      // Load next letter
      await loadNextLetter();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record attempt');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuizAnswer(isCorrect: boolean) {
    await handleSelfAssessment(isCorrect);
  }

  function handleReset() {
    if (!selectedType) return;
    // Clear coverage order to start fresh
    saveShuffledOrder(selectedType, null);
    saveCurrentIndex(selectedType, null);
    loadNextLetter();
  }

  // Show loading while not mounted
  if (!mounted) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  // Alphabet selection screen
  if (!selectedType) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-800">Alfabet fonetyczny</h1>
        <div className="bg-white rounded-xl shadow-md p-8">
          <p className="text-slate-600 mb-6 text-center">
            Wybierz alfabet do nauki:
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => handleAlphabetChange('polish')}
              className="px-8 py-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Polski (26 liter)
            </button>
            <button
              onClick={() => handleAlphabetChange('nato')}
              className="px-8 py-4 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-900 transition-colors"
            >
              NATO / ICAO (26 liter)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !currentLetter) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading alphabet...</div>
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
        {/* Alphabet selector */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">Alfabet fonetyczny</h1>
          <AlphabetSelector selected={selectedType} onChange={handleAlphabetChange} />
        </div>

        {stats && <AlphabetProgress stats={stats} />}

        <div className="bg-white rounded-xl shadow-md p-8 text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">
            Wszystkie litery opanowane!
          </h2>
          <p className="text-slate-600 mb-6">
            Gratulacje! Opanowałeś wszystkie 26 liter alfabetu {selectedType === 'polish' ? 'polskiego' : 'NATO'}.
          </p>
          <button
            onClick={handleReset}
            className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Ćwicz ponownie
          </button>
        </div>
      </div>
    );
  }

  if (!currentLetter) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">No letters available</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-xl font-bold text-slate-800">Alfabet fonetyczny</h1>
        <div className="flex items-center gap-4">
          <ModeToggle mode={practiceMode} onChange={handleModeChange} />
          <AlphabetSelector selected={selectedType} onChange={handleAlphabetChange} />
        </div>
      </div>

      {/* Progress */}
      {stats && <AlphabetProgress stats={stats} />}

      {/* Practice card */}
      {practiceMode === 'flashcard' ? (
        <div className="bg-white rounded-xl shadow-md p-8">
          {/* Letter display */}
          <div className="text-center mb-8">
            <div className="text-8xl font-bold text-blue-600 mb-4 font-mono">
              {currentLetter.letter}
            </div>

            {/* Hint (when enabled and not revealed) */}
            {isHydrated && hintsEnabled && !revealed && currentLetter.hint && (
              <div className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg inline-block">
                💡 {currentLetter.hint}
              </div>
            )}
          </div>

          {/* Reveal button or answer */}
          {!revealed ? (
            <div className="text-center">
              <p className="text-slate-500 mb-4">Jak się wymawia tę literę?</p>
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
                <p className="text-3xl font-bold text-slate-800">
                  {currentLetter.phonetic}
                </p>
                {isHydrated && hintsEnabled && currentLetter.hint && (
                  <p className="text-sm text-amber-600 mt-3">
                    💡 {currentLetter.hint}
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
      ) : (
        <LetterMultipleChoice
          letter={currentLetter}
          allLetters={allLetters}
          onAnswer={handleQuizAnswer}
          disabled={submitting}
        />
      )}
    </div>
  );
}

function AlphabetSelector({
  selected,
  onChange,
}: {
  selected: AlphabetType;
  onChange: (type: AlphabetType) => void;
}) {
  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value as AlphabetType)}
      className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="polish">Polski (26)</option>
      <option value="nato">NATO / ICAO (26)</option>
    </select>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: PracticeMode;
  onChange: (mode: PracticeMode) => void;
}) {
  return (
    <div className="flex rounded-lg border border-slate-300 overflow-hidden">
      <button
        onClick={() => onChange('flashcard')}
        className={`px-4 py-2 text-sm font-medium transition-colors ${
          mode === 'flashcard'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        Fiszki
      </button>
      <button
        onClick={() => onChange('quiz')}
        className={`px-4 py-2 text-sm font-medium transition-colors ${
          mode === 'quiz'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-slate-600 hover:bg-slate-50'
        }`}
      >
        Quiz
      </button>
    </div>
  );
}
