import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  deviceId?: string;
  deviceLabel?: string;
  isAuthenticated?: boolean;
}

const secret = process.env.SESSION_SECRET;

if (process.env.NODE_ENV === 'production' && !secret) {
  throw new Error('SESSION_SECRET environment variable is required in production');
}

export const sessionOptions: SessionOptions = {
  // Use a fallback only in development
  password: secret || 'dev-only-fallback-secret-at-least-32-chars-long',
  cookieName: 'tracker_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.isAuthenticated || !session.deviceId) {
    throw new Error('Unauthorized');
  }
  return session;
}
