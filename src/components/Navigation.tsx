'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HintsToggle } from './HintsToggle';
import { useAuth } from './AuthContext';

export function Navigation() {
  const { user, loading, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    await logout();
    setDropdownOpen(false);
    router.push('/');
  }

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
              href="/alphabet"
              className="hover:text-slate-300 transition-colors font-medium"
            >
              Alfabet
            </Link>
            <Link
              href="/dashboard"
              className="hover:text-slate-300 transition-colors font-medium"
            >
              Dashboard
            </Link>

            {!loading && (
              user ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-medium hover:bg-blue-500 transition-colors"
                    title={user.email}
                  >
                    {user.email[0].toUpperCase()}
                  </button>
                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
                      <div className="px-4 py-2 text-sm text-slate-700 border-b border-slate-100 truncate">
                        {user.email}
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Wyloguj
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="hover:text-slate-300 transition-colors font-medium"
                  >
                    Zaloguj
                  </Link>
                  <Link
                    href="/register"
                    className="px-3 py-1 bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors font-medium text-sm"
                  >
                    Rejestracja
                  </Link>
                </>
              )
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
