import { NextResponse } from 'next/server';
import { getQCodes } from '@/lib/qcodes';

/**
 * GET /api/q-codes
 * Returns all Q codes from the data file.
 */
export async function GET() {
  const qCodes = getQCodes();
  return NextResponse.json({ qCodes, total: qCodes.length });
}
