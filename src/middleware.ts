import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, TOKEN_COOKIE_NAME } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  // SECURITY: Strip any client-provided auth headers to prevent spoofing
  requestHeaders.delete('x-user-id');
  requestHeaders.delete('x-user-email');

  // Decode JWT from cookie and set trusted headers
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      requestHeaders.set('x-user-id', String(payload.userId));
      requestHeaders.set('x-user-email', payload.email);
    }
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: '/api/:path*',
};
