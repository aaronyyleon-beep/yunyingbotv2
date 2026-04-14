import type http from 'node:http';
import type { AppDbClient, AuthUser } from '@yunyingbot/application';
import { validateSession } from '@yunyingbot/application';

export async function requireAuth(req: http.IncomingMessage, db: AppDbClient): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  if (!token) return null;
  return validateSession(db, token);
}
