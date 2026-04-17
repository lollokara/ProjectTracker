import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  deviceId?: string;
  deviceLabel?: string;
  isAuthenticated?: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'change-me-change-me-change-me-change-me-change-me-64ch',
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
