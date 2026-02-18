import { NextRequest } from 'next/server';

/**
 * Extract the authenticated user ID from the request headers.
 * The middleware sets x-user-id from the JWT cookie after stripping
 * any client-provided value.
 */
export function getUserIdFromRequest(request: NextRequest): number | null {
  const headerValue = request.headers.get('x-user-id');
  if (!headerValue) return null;
  const parsed = parseInt(headerValue, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
