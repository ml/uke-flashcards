'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface HintsContextType {
  hintsEnabled: boolean;
  setHintsEnabled: (enabled: boolean) => void;
  isHydrated: boolean;
}

const HintsContext = createContext<HintsContextType | undefined>(undefined);

export function HintsProvider({ children }: { children: ReactNode }) {
  const [hintsEnabled, setHintsEnabled] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const storedHints = localStorage.getItem('hintsEnabled');
    if (storedHints) {
      setHintsEnabled(JSON.parse(storedHints));
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('hintsEnabled', JSON.stringify(hintsEnabled));
    }
  }, [hintsEnabled, isHydrated]);

  return (
    <HintsContext.Provider value={{ hintsEnabled, setHintsEnabled, isHydrated }}>
      {children}
    </HintsContext.Provider>
  );
}

export function useHints() {
  const context = useContext(HintsContext);
  if (!context) {
    throw new Error('useHints must be used within HintsProvider');
  }
  return context;
}
