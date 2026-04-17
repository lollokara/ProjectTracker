import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/auth';

const PUBLIC_PATHS = ['/pair', '/api/auth/pair', '/offline', '/manifest.json', '/sw.js'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/_next') ||
    pathname === '/'
  ) {
    return NextResponse.next();
  }

  // Check session
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  if (!session.isAuthenticated || !session.deviceId) {
    // API routes get 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Pages redirect to pairing
    return NextResponse.redirect(new URL('/pair', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json|offline).*)'],
};
