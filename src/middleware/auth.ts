import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser } from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken | { uid: string; email: string; isAdminKey: boolean };
}

/**
 * Acesso administrativo:
 *  - Login Google (Firebase): somente e-mails listados em ADMIN_EMAILS (separados por vírgula).
 *  - Chave administrativa (header x-admin-key ou Bearer): somente o valor de ADMIN_API_KEY
 *    (mínimo 20 caracteres). Não existe mais chave padrão embutida no código.
 */
const MIN_KEY_LENGTH = 20;

export function configuredAdminKey(): string | null {
  const key = String(process.env.ADMIN_API_KEY || '').trim();
  return key.length >= MIN_KEY_LENGTH ? key : null;
}

export function adminEmails(): Set<string> {
  return new Set(
    String(process.env.ADMIN_EMAILS || '')
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const requireAdminAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = String(req.headers.authorization || '');
  const adminKeyHeader = String(req.headers['x-admin-key'] || '').trim();
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const adminKey = configuredAdminKey();

  // 1. Chave administrativa (scripts/integrações), só se configurada em ADMIN_API_KEY
  const keyCandidate = adminKeyHeader || (bearer && bearer.length < 200 ? bearer : '');
  if (adminKey && keyCandidate && sameSecret(keyCandidate, adminKey)) {
    req.user = { uid: 'admin-cli', email: 'admin@kantine.internal', isAdminKey: true };
    return next();
  }

  // 2. Login Google (token do Firebase) + e-mail autorizado
  if (bearer) {
    let decoded: DecodedIdToken;
    try {
      decoded = await adminAuth.verifyIdToken(bearer);
    } catch {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada. Entre novamente com o Google.' });
    }
    const email = String(decoded.email || '').toLowerCase();
    const allowed = adminEmails();
    if (!allowed.size) {
      console.error('[auth] ADMIN_EMAILS não configurada: nenhum login Google é aceito.');
      return res.status(503).json({ error: 'ADMIN_EMAILS_NOT_CONFIGURED', message: 'Configure ADMIN_EMAILS (e-mails autorizados) no servidor.' });
    }
    if (!email || decoded.email_verified === false || !allowed.has(email)) {
      console.warn(`[auth] Login recusado para ${email || 'conta sem e-mail'}`);
      return res.status(403).json({ error: 'FORBIDDEN', message: `A conta ${email || ''} não tem acesso ao painel administrativo.` });
    }
    req.user = decoded;
    await getOrCreateUser(decoded.uid, email).catch((e) => console.error('Failed to sync admin user record:', e));
    return next();
  }

  return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Entre com o Google para acessar o painel.' });
};
