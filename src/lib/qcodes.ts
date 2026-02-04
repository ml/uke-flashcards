import fs from 'fs';
import path from 'path';
import type { QCode, QCodeBank } from '@/types/qcodes';

let qCodesCache: QCode[] | null = null;

export function getQCodes(): QCode[] {
  if (qCodesCache) {
    return qCodesCache;
  }

  const filePath = path.join(process.cwd(), 'data', 'q_codes.json');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const data: QCodeBank = JSON.parse(fileContent);

  qCodesCache = data.qCodes;
  return qCodesCache;
}

export function getQCodeById(id: string): QCode | undefined {
  const qCodes = getQCodes();
  return qCodes.find((q) => q.id === id);
}

export function getQCodeCount(): number {
  return getQCodes().length;
}

export function clearQCodesCache(): void {
  qCodesCache = null;
}
