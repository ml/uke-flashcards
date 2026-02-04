'use client';

import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Question, Section } from '@/types/questions';
import { useHints } from '@/components/HintsContext';
import { StudyProgress } from '@/components/StudyProgress';

interface AttemptResponse {
  id: number;
  isCorrect: boolean;
  correctAnswer: string;
}

interface SessionStats {
  total: number;
  correct: number;
  incorrect: number;
  bySection: Record<string, { total: number; correct: number }>;
}

interface SessionData {
  sessionId: number;
  questions: Question[];
  totalQuestions: number;
}

interface SmartStudyStats {
  total: number;
  unseen: number;
  weak: number;
  learning: number;
  strong: number;
  mastered: number;
  seenCount: number;
  seenPercentage: number;
}

interface RecentAnswer {
  questionId: string;
  answeredAt: number;
}

interface StudySessionState {
  shuffledOrder: string;
  currentIndex: number;
  recentAnswers: RecentAnswer[];
  section: string | null;
}

const ALL_SECTIONS: Section[] = [
  'Radiotechnika',
  'Przepisy',
  'Bezpieczeństwo',
  'Procedury operatorskie',
];

const STORAGE_KEY = 'uke-study-session-state';

function loadSessionState(): StudySessionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function saveSessionState(state: StudySessionState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore errors
  }
}

function clearSessionState(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

function StudyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { hintsEnabled, isHydrated } = useHints();

  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [attemptResult, setAttemptResult] = useState<AttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Smart study state
  const [phase, setPhase] = useState<'coverage' | 'drilling' | 'mastered'>('coverage');
  const [stats, setStats] = useState<SmartStudyStats | null>(null);
  const [shuffledOrder, setShuffledOrder] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recentAnswers, setRecentAnswers] = useState<RecentAnswer[]>([]);

  // Session mode state (20-question exam simulation)
  const [sessionMode, setSessionMode] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [startingSession, setStartingSession] = useState(false);

  // Track if initial load is done
  const initialLoadDone = useRef(false);

  // Get selected section from URL params
  const selectedSection = searchParams.get('section') as Section | null;

  // Session mode questions
  const sessionQuestions = sessionMode && sessionData ? sessionData.questions : [];
  const sessionQuestion = sessionQuestions[sessionIndex] || null;

  // Load questions on mount
  useEffect(() => {
    async function loadQuestions() {
      try {
        const response = await fetch('/api/questions');
        if (!response.ok) {
          throw new Error('Failed to load questions');
        }
        const data = await response.json();
        setAllQuestions(data.questions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
    loadQuestions();
  }, []);

  // Load next smart question
  const loadNextQuestion = useCallback(
    async (forceSection?: Section | null, resetSession?: boolean) => {
      if (sessionMode) return;

      setLoadingNext(true);
      try {
        const section = forceSection !== undefined ? forceSection : selectedSection;

        // Build query params
        const params = new URLSearchParams();
        if (section) {
          params.set('section', section);
        }

        // Get state from localStorage or current state
        let sessionState = resetSession ? null : loadSessionState();

        // If section changed, clear session state
        if (sessionState && sessionState.section !== (section || null)) {
          clearSessionState();
          sessionState = null;
        }

        if (sessionState && !resetSession) {
          if (sessionState.shuffledOrder) {
            params.set('shuffledOrder', sessionState.shuffledOrder);
          }
          if (sessionState.currentIndex !== undefined) {
            params.set('currentIndex', sessionState.currentIndex.toString());
          }
          if (sessionState.recentAnswers && sessionState.recentAnswers.length > 0) {
            params.set('recentTimestamps', JSON.stringify(sessionState.recentAnswers));
          }
        } else if (recentAnswers.length > 0 && !resetSession) {
          params.set('recentTimestamps', JSON.stringify(recentAnswers));
        }

        const response = await fetch(`/api/questions/next?${params.toString()}`);
        if (!response.ok) {
          throw new Error('Failed to load next question');
        }

        const data = await response.json();

        if (data.question) {
          setCurrentQuestion(data.question);
        } else {
          setCurrentQuestion(null);
        }

        setPhase(data.phase || 'coverage');
        setStats(data.stats || null);

        // Update local state from response
        if (data.shuffledOrder) {
          setShuffledOrder(data.shuffledOrder);
        }
        if (data.currentIndex !== undefined) {
          setCurrentIndex(data.currentIndex);
        }

        // Save state to localStorage
        if (data.shuffledOrder || data.currentIndex !== undefined) {
          saveSessionState({
            shuffledOrder: data.shuffledOrder || shuffledOrder,
            currentIndex: data.currentIndex ?? currentIndex,
            recentAnswers: recentAnswers,
            section: section || null,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load question');
      } finally {
        setLoadingNext(false);
      }
    },
    [selectedSection, sessionMode, recentAnswers, shuffledOrder, currentIndex]
  );

  // Initial load of first question (after questions are loaded)
  useEffect(() => {
    if (!loading && allQuestions.length > 0 && !sessionMode && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadNextQuestion();
    }
  }, [loading, allQuestions.length, sessionMode, loadNextQuestion]);

  // Reload when section changes (only in non-session mode)
  useEffect(() => {
    if (!sessionMode && initialLoadDone.current && !loading) {
      // Section changed - reload with new section
      loadNextQuestion(selectedSection, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSection]);

  const handleSectionChange = useCallback(
    (section: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (section === '') {
        params.delete('section');
      } else {
        params.set('section', section);
      }
      router.push(`/study?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleReset = useCallback(() => {
    clearSessionState();
    setRecentAnswers([]);
    setShuffledOrder('');
    setCurrentIndex(0);
    loadNextQuestion(selectedSection, true);
  }, [loadNextQuestion, selectedSection]);

  async function handleStartSession() {
    setStartingSession(true);
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: selectedSection,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start session');
      }

      const data: SessionData = await response.json();
      setSessionData(data);
      setSessionMode(true);
      setSessionIndex(0);
      setSelectedAnswer(null);
      setAttemptResult(null);
      setSessionCompleted(false);
      setSessionStats(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setStartingSession(false);
    }
  }

  async function handleCompleteSession() {
    if (!sessionData) return;

    try {
      const response = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete session');
      }

      const data = await response.json();
      setSessionStats(data.stats);
      setSessionCompleted(true);
    } catch (err) {
      console.error('Error completing session:', err);
    }
  }

  function handleExitSession() {
    setSessionMode(false);
    setSessionData(null);
    setSessionCompleted(false);
    setSessionStats(null);
    setSessionIndex(0);
    setSelectedAnswer(null);
    setAttemptResult(null);
    // Reload smart study mode
    loadNextQuestion();
  }

  const displayQuestion = sessionMode ? sessionQuestion : currentQuestion;

  async function handleAnswerClick(answerLetter: string) {
    if (selectedAnswer !== null || !displayQuestion) {
      return;
    }

    setSelectedAnswer(answerLetter);

    try {
      const response = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: displayQuestion.id,
          selectedAnswer: answerLetter,
          sessionId: sessionData?.sessionId ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record attempt');
      }

      const result: AttemptResponse = await response.json();
      setAttemptResult(result);

      // Track recent answer for cooling period (only in study mode)
      if (!sessionMode) {
        const newRecentAnswer: RecentAnswer = {
          questionId: displayQuestion.id,
          answeredAt: Date.now(),
        };
        const updatedRecent = [...recentAnswers, newRecentAnswer].slice(-20); // Keep last 20
        setRecentAnswers(updatedRecent);

        // Update localStorage
        const currentState = loadSessionState();
        if (currentState) {
          saveSessionState({
            ...currentState,
            recentAnswers: updatedRecent,
          });
        }
      }
    } catch (err) {
      console.error('Error recording attempt:', err);
    }
  }

  function handleNextQuestion() {
    if (sessionMode) {
      if (sessionIndex < sessionQuestions.length - 1) {
        setSessionIndex(sessionIndex + 1);
        setSelectedAnswer(null);
        setAttemptResult(null);
      } else if (!sessionCompleted) {
        handleCompleteSession();
      }
    } else {
      // Smart study mode - load next question
      setSelectedAnswer(null);
      setAttemptResult(null);
      loadNextQuestion();
    }
  }

  function handleSkipQuestion() {
    if (sessionMode) return;
    // Skip without recording - just load next
    setSelectedAnswer(null);
    setAttemptResult(null);
    loadNextQuestion();
  }

  function getAnswerButtonClass(answerLetter: string): string {
    const baseClass =
      'w-full text-left p-4 rounded-lg border-2 transition-colors';

    if (selectedAnswer === null) {
      return `${baseClass} border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer`;
    }

    if (answerLetter === attemptResult?.correctAnswer) {
      return `${baseClass} border-green-500 bg-green-50 text-green-800`;
    }

    if (answerLetter === selectedAnswer && attemptResult?.isCorrect === false) {
      return `${baseClass} border-red-500 bg-red-50 text-red-800`;
    }

    return `${baseClass} border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading questions...</div>
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

  // Session summary view
  if (sessionMode && sessionCompleted && sessionStats) {
    const passThreshold = 0.6;
    const passRate = sessionStats.correct / sessionStats.total;
    const passed = passRate >= passThreshold;

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-md p-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">
            Session Complete!
          </h2>

          <div
            className={`text-center p-6 rounded-lg mb-6 ${
              passed ? 'bg-green-100' : 'bg-red-100'
            }`}
          >
            <div className="text-5xl font-bold mb-2">
              {sessionStats.correct} / {sessionStats.total}
            </div>
            <div
              className={`text-lg font-medium ${
                passed ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {Math.round(passRate * 100)}% -{' '}
              {passed ? 'Passed!' : 'Keep practicing!'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-green-700">
                {sessionStats.correct}
              </div>
              <div className="text-sm text-green-600">Correct</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-red-700">
                {sessionStats.incorrect}
              </div>
              <div className="text-sm text-red-600">Incorrect</div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-700 mb-3">
              By Section
            </h3>
            <div className="space-y-2">
              {Object.entries(sessionStats.bySection).map(([section, sectionData]) => {
                const sectionRate = sectionData.correct / sectionData.total;
                return (
                  <div
                    key={section}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <span className="text-slate-700">{section}</span>
                    <span
                      className={`font-medium ${
                        sectionRate >= passThreshold
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {sectionData.correct} / {sectionData.total} (
                      {Math.round(sectionRate * 100)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={handleStartSession}
              disabled={startingSession}
              className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {startingSession ? 'Starting...' : 'Start New Session'}
            </button>
            <button
              onClick={handleExitSession}
              className="px-6 py-3 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 transition-colors"
            >
              Exit to Study Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Mastery complete view (study mode)
  if (!sessionMode && phase === 'mastered') {
    return (
      <div className="space-y-6">
        {/* Section filter */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <label htmlFor="section-filter" className="text-sm font-medium text-slate-700">
              Section:
            </label>
            <select
              id="section-filter"
              value={selectedSection || ''}
              onChange={(e) => handleSectionChange(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All sections</option>
              {ALL_SECTIONS.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </div>
        </div>

        {stats && <StudyProgress phase={phase} stats={stats} onReset={handleReset} />}

        <div className="bg-white rounded-xl shadow-md p-8 text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">
            All Questions Mastered!
          </h2>
          <p className="text-slate-600 mb-6">
            Congratulations! You've mastered all{' '}
            {selectedSection ? `${selectedSection} ` : ''}questions.
          </p>
          <button
            onClick={handleReset}
            className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Start Fresh
          </button>
        </div>
      </div>
    );
  }

  // No question available
  if (!displayQuestion) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label htmlFor="section-filter" className="text-sm font-medium text-slate-700">
              Section:
            </label>
            <select
              id="section-filter"
              value={selectedSection || ''}
              onChange={(e) => handleSectionChange(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All sections</option>
              {ALL_SECTIONS.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="text-slate-600">
            {loadingNext ? 'Loading question...' : 'No questions available'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with section filter and session button */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <label htmlFor="section-filter" className="text-sm font-medium text-slate-700">
            Section:
          </label>
          <select
            id="section-filter"
            value={selectedSection || ''}
            onChange={(e) => handleSectionChange(e.target.value)}
            disabled={sessionMode}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">All sections</option>
            {ALL_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </div>

        {sessionMode ? (
          <div className="flex items-center gap-4">
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
              Session Mode
            </span>
            <button
              onClick={handleExitSession}
              className="text-sm text-slate-600 hover:text-slate-800 underline"
            >
              Exit Session
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartSession}
            disabled={startingSession}
            className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {startingSession ? 'Starting...' : 'Start Session (20 Q)'}
          </button>
        )}
      </div>

      {/* Study Progress (only in study mode) */}
      {!sessionMode && stats && (
        <StudyProgress phase={phase} stats={stats} onReset={handleReset} />
      )}

      {/* Progress indicator */}
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span className="bg-slate-200 px-3 py-1 rounded-full">
          {displayQuestion.section}
        </span>
        {sessionMode ? (
          <span className="font-medium">
            {sessionIndex + 1} / {sessionQuestions.length}
          </span>
        ) : (
          <span className="font-medium text-slate-500">
            Smart Selection
          </span>
        )}
      </div>

      {/* Question card */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="mb-6">
          <span className="text-sm text-slate-500 mb-2 block">
            Question {displayQuestion.number}
          </span>
          <h2 className="text-xl font-semibold text-slate-800">
            {displayQuestion.text}
          </h2>
          {/* Question diagram image */}
          {displayQuestion.imageUrl && (
            <div className="mt-4 flex justify-center">
              <img
                src={displayQuestion.imageUrl}
                alt={`Diagram for question ${displayQuestion.number}`}
                className="max-w-full h-auto rounded-lg border border-slate-200 shadow-sm"
                style={{ maxHeight: '400px' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        {/* Hint (shown when enabled and not yet answered) */}
        {isHydrated && hintsEnabled && displayQuestion.hint && selectedAnswer === null && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 text-lg">💡</span>
              <div>
                <span className="text-sm font-medium text-amber-800">Hint:</span>
                <p className="text-amber-700 mt-1">{displayQuestion.hint}</p>
              </div>
            </div>
          </div>
        )}

        {/* Answers */}
        <div className="space-y-3">
          {displayQuestion.answers.map((answer) => (
            <button
              key={answer.letter}
              onClick={() => handleAnswerClick(answer.letter)}
              disabled={selectedAnswer !== null}
              className={getAnswerButtonClass(answer.letter)}
            >
              <span className="font-semibold mr-2">{answer.letter}.</span>
              {answer.text}
            </button>
          ))}
        </div>

        {/* Result feedback */}
        {attemptResult && (
          <div
            className={`mt-6 p-4 rounded-lg ${
              attemptResult.isCorrect
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            <p className="font-medium">
              {attemptResult.isCorrect
                ? 'Correct!'
                : `Incorrect. The correct answer is ${attemptResult.correctAnswer}.`}
            </p>

            {displayQuestion.explanation && (
              <div className={`mt-3 pt-3 border-t ${
                attemptResult.isCorrect
                  ? 'border-green-200'
                  : 'border-red-200'
              }`}>
                <span className="font-medium">Explanation:</span>
                <p className="mt-1">{displayQuestion.explanation}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        {!sessionMode && selectedAnswer === null && (
          <button
            onClick={handleSkipQuestion}
            disabled={loadingNext}
            className="px-6 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 transition-colors disabled:opacity-50"
          >
            Skip
          </button>
        )}

        {(sessionMode || selectedAnswer !== null) && <div />}

        {selectedAnswer !== null && (
          sessionMode ? (
            sessionIndex < sessionQuestions.length - 1 ? (
              <button
                onClick={handleNextQuestion}
                className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleNextQuestion}
                className="px-6 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
              >
                Finish Session
              </button>
            )
          ) : (
            <button
              onClick={handleNextQuestion}
              disabled={loadingNext}
              className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loadingNext ? 'Loading...' : 'Next Question'}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function StudyLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-slate-600">Loading...</div>
    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={<StudyLoading />}>
      <StudyContent />
    </Suspense>
  );
}
