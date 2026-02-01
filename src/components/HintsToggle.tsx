'use client';

import { useHints } from './HintsContext';

export function HintsToggle() {
  const { hintsEnabled, setHintsEnabled, isHydrated } = useHints();

  if (!isHydrated) {
    return (
      <label className="flex items-center gap-2 cursor-pointer opacity-50">
        <input
          type="checkbox"
          disabled
          className="w-4 h-4 rounded border-slate-500 bg-slate-700"
        />
        <span className="text-sm">Show Hints</span>
      </label>
    );
  }

  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={hintsEnabled}
        onChange={(e) => setHintsEnabled(e.target.checked)}
        className="w-4 h-4 rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-800"
      />
      <span className="text-sm">Show Hints</span>
    </label>
  );
}
