import fs from 'fs';
import path from 'path';
import type { PhoneticLetter, AlphabetBank, AlphabetType } from '@/types/alphabet';

let alphabetCache: AlphabetBank | null = null;

function loadAlphabetBank(): AlphabetBank {
  if (alphabetCache) {
    return alphabetCache;
  }

  const filePath = path.join(process.cwd(), 'data', 'alphabet.json');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const data: AlphabetBank = JSON.parse(fileContent);

  alphabetCache = data;
  return alphabetCache;
}

export function getAlphabet(type: AlphabetType): PhoneticLetter[] {
  const bank = loadAlphabetBank();
  return type === 'polish' ? bank.polish : bank.nato;
}

export function getAlphabetIds(type: AlphabetType): string[] {
  return getAlphabet(type).map((letter) => letter.id);
}

export function getLetterById(id: string): PhoneticLetter | undefined {
  const bank = loadAlphabetBank();
  const allLetters = [...bank.polish, ...bank.nato];
  return allLetters.find((letter) => letter.id === id);
}

export function getAlphabetCount(type: AlphabetType): number {
  return getAlphabet(type).length;
}

export function getAlphabetMetadata(): AlphabetBank['metadata'] {
  const bank = loadAlphabetBank();
  return bank.metadata;
}

export function clearAlphabetCache(): void {
  alphabetCache = null;
}
