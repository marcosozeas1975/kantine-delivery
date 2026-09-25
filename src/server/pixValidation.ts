/**
 * Pix Key and Profile Validation & Normalization Module
 * Implements M1.1 strict formatting, canonical representation, and privacy masking.
 */

export type PixKeyType = 'CPF' | 'PHONE' | 'EMAIL' | 'RANDOM' | 'REQUIRES_UPDATE';

export const PIX_KEY_TYPES: { type: PixKeyType; label: string; buttonText: string }[] = [
  { type: 'CPF', label: 'CPF', buttonText: 'CPF' },
  { type: 'PHONE', label: 'Telefone', buttonText: 'TELEFONE' },
  { type: 'EMAIL', label: 'E-mail', buttonText: 'E-MAIL' },
  { type: 'RANDOM', label: 'Chave Aleatória', buttonText: 'ALEATÓRIA' },
];

/**
 * Validates Brazilian CPF with check-digit algorithm
 */
export function validateAndNormalizeCpf(input: string): { isValid: boolean; canonical?: string; error?: string } {
  if (!input) return { isValid: false, error: 'CPF não informado.' };
  
  // Remove non-digits
  const digits = input.replace(/\D/g, '');
  
  if (digits.length !== 11) {
    return { isValid: false, error: 'O CPF deve conter exatamente 11 dígitos numéricos.' };
  }

  // Reject known invalid sequences (e.g. all digits equal)
  if (/^(\d)\1{10}$/.test(digits)) {
    return { isValid: false, error: 'CPF inválido (dígitos repetidos).' };
  }

  // Validate 1st check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits.charAt(i), 10) * (10 - i);
  }
  let rev = (sum * 10) % 11;
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(digits.charAt(9), 10)) {
    return { isValid: false, error: 'CPF inválido (dígito verificador incorreto).' };
  }

  // Validate 2nd check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits.charAt(i), 10) * (11 - i);
  }
  rev = (sum * 10) % 11;
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(digits.charAt(10), 10)) {
    return { isValid: false, error: 'CPF inválido (dígito verificador incorreto).' };
  }

  return { isValid: true, canonical: digits };
}

/**
 * Validates Brazilian Phone for Pix and normalizes to E.164 (+55DDDXXXXXXXXX)
 */
export function validateAndNormalizePixPhone(input: string): { isValid: boolean; canonical?: string; error?: string } {
  if (!input) return { isValid: false, error: 'Telefone não informado.' };

  // Strip spaces, dashes, parentheses
  let cleaned = input.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+55')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('55') && (cleaned.length === 12 || cleaned.length === 13)) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Pure digits of Brazilian number (DDD + number)
  const digits = cleaned.replace(/\D/g, '');

  // Must have 10 or 11 digits (e.g. 34 99999-9999 or 34 3232-0000)
  if (digits.length !== 10 && digits.length !== 11) {
    return { isValid: false, error: 'Número de telefone deve conter DDD e 8 ou 9 dígitos (ex: (34) 99999-9999).' };
  }

  const ddd = parseInt(digits.substring(0, 2), 10);
  if (isNaN(ddd) || ddd < 11 || ddd > 99) {
    return { isValid: false, error: 'DDD inválido.' };
  }

  // Canonical E.164: +55XXXXXXXXXXX
  const canonical = `+55${digits}`;
  return { isValid: true, canonical };
}

/**
 * Validates Email for Pix
 */
export function validateAndNormalizePixEmail(input: string): { isValid: boolean; canonical?: string; error?: string } {
  if (!input) return { isValid: false, error: 'E-mail não informado.' };
  const trimmed = input.trim().toLowerCase();

  // Basic safe email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (trimmed.length > 254 || !emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Formato de e-mail inválido.' };
  }

  return { isValid: true, canonical: trimmed };
}

/**
 * Validates Random Key (UUID) for Pix
 */
export function validateAndNormalizePixRandom(input: string): { isValid: boolean; canonical?: string; error?: string } {
  if (!input) return { isValid: false, error: 'Chave aleatória não informada.' };
  const trimmed = input.trim().toLowerCase();

  // Standard UUID regex (8-4-4-4-12 hex)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  if (!uuidRegex.test(trimmed)) {
    return { isValid: false, error: 'Chave aleatória inválida. Deve seguir o formato UUID (ex: 123e4567-e89b-12d3-a456-426614174000).' };
  }

  return { isValid: true, canonical: trimmed };
}

/**
 * Unified Pix Validator for any PixKeyType
 */
export function validateAndNormalizePix(
  type: PixKeyType,
  value: string
): { isValid: boolean; canonical?: string; error?: string } {
  if (!type || !['CPF', 'PHONE', 'EMAIL', 'RANDOM'].includes(type)) {
    return { isValid: false, error: `Tipo de chave Pix inválido: '${type}'. Tipos aceitos: CPF, PHONE, EMAIL, RANDOM.` };
  }

  if (type === 'CPF') {
    return validateAndNormalizeCpf(value);
  }
  if (type === 'PHONE') {
    return validateAndNormalizePixPhone(value);
  }
  if (type === 'EMAIL') {
    return validateAndNormalizePixEmail(value);
  }
  if (type === 'RANDOM') {
    return validateAndNormalizePixRandom(value);
  }

  return { isValid: false, error: 'Tipo de chave Pix desconhecido.' };
}

/**
 * Applies privacy masking to Pix keys for UI and logs
 */
export function maskPixKey(type: string | null | undefined, value: string | null | undefined): string {
  if (!value || type === 'REQUIRES_UPDATE' || !type) {
    return '⚠️ Requer atualização';
  }

  const trimmed = value.trim();

  if (type === 'CPF') {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 11) {
      const lastTwo = digits.slice(-2);
      return `•••.•••.•••-${lastTwo}`;
    }
    return `•••.•••.•••-${digits.slice(-2) || 'XX'}`;
  }

  if (type === 'PHONE') {
    // E.164: +5534999991234
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length >= 12) {
      // +55 + 2 DDD + 4/5 digits + last 4
      const ddd = digits.slice(2, 4);
      const last4 = digits.slice(-4);
      return `+55 ${ddd} *****-${last4}`;
    } else if (digits.length >= 10) {
      const ddd = digits.slice(0, 2);
      const last4 = digits.slice(-4);
      return `+55 ${ddd} *****-${last4}`;
    }
    return `+55 ** *****-${digits.slice(-4) || '****'}`;
  }

  if (type === 'EMAIL') {
    const parts = trimmed.split('@');
    if (parts.length === 2) {
      const name = parts[0];
      const domain = parts[1];
      const initial = name.length > 0 ? name[0] : '';
      return `${initial}***@${domain}`;
    }
    return '***@***';
  }

  if (type === 'RANDOM') {
    if (trimmed.length >= 4) {
      const last4 = trimmed.slice(-4);
      return `********-****-****-****-********${last4}`;
    }
    return '********-****-****-****-************';
  }

  return '••••••••';
}

/**
 * Normalizes general driver phone number for display/storage
 */
export function normalizeGeneralPhone(input: string): string {
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return input.trim();
}
