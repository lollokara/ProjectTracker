import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

const PUBLIC_PATHS = ['/pair', '/api/auth/pair', '/offline', '/manifest.json', '/sw.js'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = request.headers.get('x-forwarded-for') || request.ip || '127.0.0.1';

  // 1. Rate Limiting for Auth Pairing
  if (pathname === '/api/auth/pair' && request.method === 'POST') {
    const rl = rateLimit.check(`rl:pair:${ip}`, 5, 15 * 60 * 1000); // 5 per 15m
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests' }, 
        { 
          status: 429,
          headers: { 'Retry-After': Math.ceil((rl.reset - Date.now()) / 1000).toString() }
        }
      );
    }
  }

  // 2. Auth Logic (Existing)
  let response = NextResponse.next();
  
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/_next') ||
    pathname === '/';

  if (!isPublic) {
    const session = await getIronSession<SessionData>(request, response, sessionOptions);
    if (!session.isAuthenticated || !session.deviceId) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/pair', request.url));
    }
  }

  // 3. Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';");
  
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json|offline).*)'],
};
