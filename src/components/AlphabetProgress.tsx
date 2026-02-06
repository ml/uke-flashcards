import type { AlphabetStats } from '@/types/alphabet';

interface AlphabetProgressProps {
  stats: AlphabetStats;
}

export function AlphabetProgress({ stats }: AlphabetProgressProps) {
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

      {/* Legend */}
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
