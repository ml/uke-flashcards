'use client';

interface StudyProgressProps {
  phase: 'coverage' | 'drilling' | 'mastered';
  stats: {
    total: number;
    unseen: number;
    weak: number;
    learning: number;
    strong: number;
    mastered: number;
    seenCount: number;
    seenPercentage: number;
  };
  onReset?: () => void;
}

export function StudyProgress({ phase, stats, onReset }: StudyProgressProps) {
  const getPhaseLabel = () => {
    switch (phase) {
      case 'coverage':
        return 'Coverage Pass';
      case 'drilling':
        return 'Drilling Weak Questions';
      case 'mastered':
        return 'All Mastered!';
    }
  };

  const getPhaseDescription = () => {
    switch (phase) {
      case 'coverage':
        return `${stats.unseen} questions remaining to see`;
      case 'drilling':
        return `${stats.weak + stats.learning} questions to reinforce`;
      case 'mastered':
        return 'Great job! You\'ve mastered all questions.';
    }
  };

  const progressPercentage =
    phase === 'coverage'
      ? stats.seenPercentage
      : Math.round(
          ((stats.mastered + stats.strong) / stats.total) * 100
        );

  return (
    <div className="bg-slate-100 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">
            {phase === 'coverage' ? '📚' : phase === 'drilling' ? '🎯' : '🏆'}
          </span>
          <span className="font-semibold text-slate-800">{getPhaseLabel()}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            {phase === 'coverage'
              ? `${stats.seenCount}/${stats.total} (${stats.seenPercentage}%)`
              : `${stats.mastered + stats.strong}/${stats.total} mastered`}
          </span>
          {onReset && (
            <button
              onClick={onReset}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main progress bar */}
      <div className="w-full bg-slate-300 rounded-full h-2.5 mb-3">
        <div
          className={`h-2.5 rounded-full transition-all duration-300 ${
            phase === 'mastered'
              ? 'bg-green-500'
              : phase === 'drilling'
              ? 'bg-amber-500'
              : 'bg-blue-500'
          }`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Phase description */}
      <p className="text-sm text-slate-600 mb-3">{getPhaseDescription()}</p>

      {/* Confidence breakdown */}
      <div className="flex flex-wrap gap-3 text-xs">
        {stats.unseen > 0 && (
          <span className="px-2 py-1 bg-slate-200 rounded text-slate-600">
            Unseen: {stats.unseen}
          </span>
        )}
        {stats.weak > 0 && (
          <span className="px-2 py-1 bg-red-100 rounded text-red-700">
            Weak: {stats.weak}
          </span>
        )}
        {stats.learning > 0 && (
          <span className="px-2 py-1 bg-amber-100 rounded text-amber-700">
            Learning: {stats.learning}
          </span>
        )}
        {stats.strong > 0 && (
          <span className="px-2 py-1 bg-blue-100 rounded text-blue-700">
            Strong: {stats.strong}
          </span>
        )}
        {stats.mastered > 0 && (
          <span className="px-2 py-1 bg-green-100 rounded text-green-700">
            Mastered: {stats.mastered}
          </span>
        )}
      </div>
    </div>
  );
}
