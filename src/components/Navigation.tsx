'use client';

import Link from 'next/link';
import { HintsToggle } from './HintsToggle';

export function Navigation() {
  return (
    <nav className="bg-slate-800 text-white shadow-lg">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="text-xl font-bold hover:text-slate-300 transition-colors"
          >
            UKE Flashcards
          </Link>
          <div className="flex items-center gap-6">
            <HintsToggle />
            <Link
              href="/study"
              className="hover:text-slate-300 transition-colors font-medium"
            >
              Study
            </Link>
            <Link
              href="/q-codes"
              className="hover:text-slate-300 transition-colors font-medium"
            >
              Q Codes
            </Link>
            <Link
              href="/dashboard"
              className="hover:text-slate-300 transition-colors font-medium"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
