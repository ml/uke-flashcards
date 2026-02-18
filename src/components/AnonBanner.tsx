'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthContext';

const DISMISS_KEY = 'anon-banner-dismissed-at';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function AnonBanner() {
  const { user, loading } = useAuth();
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      setDismissed(elapsed < DISMISS_DURATION_MS);
    } else {
      setDismissed(false);
    }
  }, []);

  if (loading || user || dismissed) {
    return null;
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  return (
    <div className="bg-blue-600 text-white text-sm">
      <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between">
        <span>
          <Link href="/register" className="underline font-medium hover:text-blue-100">
            Zaloguj się lub utwórz konto
          </Link>
          , aby zapisywać postępy nauki.
        </span>
        <button
          onClick={handleDismiss}
          className="ml-4 text-blue-200 hover:text-white text-lg leading-none"
          aria-label="Zamknij"
        >
          ×
        </button>
      </div>
    </div>
  );
}
