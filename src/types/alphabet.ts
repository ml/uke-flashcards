export type AlphabetType = 'polish' | 'nato';

export interface PhoneticLetter {
  id: string;           // "AL-PL-A" or "AL-NATO-A"
  letter: string;       // "A"
  phonetic: string;     // "Adam" or "Alfa"
  hint?: string;        // Mnemonic hint
}

export interface AlphabetBank {
  polish: PhoneticLetter[];
  nato: PhoneticLetter[];
  metadata: {
    polishCount: number;
    natoCount: number;
    source: string;
  };
}

export interface AlphabetStats {
  total: number;
  unseen: number;
  weak: number;
  learning: number;
  strong: number;
  mastered: number;
}

export interface AlphabetResponse {
  letter: PhoneticLetter | null;
  phase: 'coverage' | 'drilling' | 'mastered';
  stats: AlphabetStats;
  shuffledOrder?: string;
  currentIndex?: number;
}
