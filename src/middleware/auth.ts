import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser } from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken | { uid: string; email: string; isAdminKey: boolean };
}

export const requireAdminAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const adminKeyHeader = req.headers['x-admin-key'] as string | undefined;
  const adminSecret = process.env.ADMIN_API_KEY || 'kantine-admin-secure-key-2026';

  // 1. Check direct admin secret / API key header
  if (adminKeyHeader && adminKeyHeader === adminSecret) {
    req.user = { uid: 'admin-cli', email: 'admin@kantine.internal', isAdminKey: true };
    return next();
  }

  // 2. Check Bearer token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1].trim();

    // Check if Bearer token is the admin secret key
    if (token === adminSecret) {
      req.user = { uid: 'admin-cli', email: 'admin@kantine.internal', isAdminKey: true };
      return next();
    }

    // Otherwise verify with Firebase ID token
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.user = decodedToken;
      if (decodedToken.email) {
        await getOrCreateUser(decodedToken.uid, decodedToken.email).catch((e) =>
          console.error('Failed to sync admin user record:', e)
        );
      }
      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
  }

  return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization' });
};
