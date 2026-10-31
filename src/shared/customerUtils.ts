/**
 * Utilitários para extração e formatação de dados do cliente (Nome e Telefone)
 * nas paradas de entrega e pedidos.
 */

export interface CustomerData {
  name: string | null;
  phone: string | null;
  rawDigits: string | null;
}

/**
 * Extrai o nome e o telefone do cliente a partir dos campos textuais da parada
 * (cargo_description, observations, destination_address).
 */
export function extractCustomerData(stop: {
  cargo_description?: string | null;
  observations?: string | null;
  destination_address?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
}): CustomerData {
  // Se já houver campos dedicados preenchidos
  if (stop.customer_name || stop.customer_phone) {
    const rawDigits = (stop.customer_phone || '').replace(/\D/g, '');
    let formattedPhone = stop.customer_phone || null;
    if (rawDigits.length >= 10 && rawDigits.length <= 13) {
      const clean = rawDigits.startsWith('55') ? rawDigits.slice(2) : rawDigits;
      if (clean.length === 11) {
        formattedPhone = `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
      } else if (clean.length === 10) {
        formattedPhone = `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
      }
    }
    return {
      name: stop.customer_name ? stop.customer_name.trim() : null,
      phone: formattedPhone,
      rawDigits: rawDigits || null,
    };
  }

  const cargo = stop.cargo_description || '';
  const obs = stop.observations || '';
  const addr = stop.destination_address || '';
  const textPool = [cargo, obs, addr].filter(Boolean).join(' ');

  // 1. Extração do telefone celular / WhatsApp
  let rawPhone = '';
  let formattedPhone: string | null = null;
  const phoneMatch = textPool.match(/(?:\+?55\s*)?(?:\(?([1-9]{2})\)?\s*[-.]?\s*)?(?:9\s*)?(\d{4,5})[-.\s]?(\d{4})/);
  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) {
      const clean = digits.startsWith('55') ? digits.slice(2) : digits;
      if (clean.length === 11) {
        formattedPhone = `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
        rawPhone = clean;
      } else if (clean.length === 10) {
        formattedPhone = `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
        rawPhone = clean;
      }
    }
  }

  // 2. Extração do nome do cliente
  let name: string | null = null;

  // Padrão 1: "Cliente: Nome" ou "Destinatário: Nome" ou "Nome: Nome"
  const explicitMatch = textPool.match(/(?:Cliente|destinat[áa]rio|Nome|contato):\s*([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)*)/i);
  if (explicitMatch && explicitMatch[1] && explicitMatch[1].trim().length > 1) {
    name = explicitMatch[1].trim();
  }

  // Padrão 2: "Takeat #... (Matriz) — Nome |" ou "Takeat #... — Nome"
  if (!name) {
    const dashMatch = cargo.match(/—\s*([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)*)/i);
    if (dashMatch && dashMatch[1] && dashMatch[1].trim().length > 1) {
      name = dashMatch[1].trim();
    }
  }

  // Padrão 3: "... para Nome Sobrenome - ..."
  if (!name) {
    const paraMatch = cargo.match(/\bpara\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)+)/i);
    if (paraMatch && paraMatch[1] && paraMatch[1].trim().length > 1) {
      name = paraMatch[1].trim();
    }
  }

  return {
    name: name || null,
    phone: formattedPhone,
    rawDigits: rawPhone || null,
  };
}

/**
 * Converte a duração desejada (ex: "50 min", "50 minutos", "45") ou horário pré-definido
 * no prazo final efetivo no momento do aceite.
 */
export function computeAcceptedFinalDeadline(
  desiredDurationOrDeadline: string | null | undefined,
  acceptedAtDate: Date = new Date()
): string {
  const str = (desiredDurationOrDeadline || '').trim();

  // Se já for um horário específico fixo (ex: "18:00", "19:30")
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    return str;
  }

  // Se já tiver indicação de minutos após aceite calculada anteriormente
  if (/^\d{1,2}:\d{2}\s*\(.*\)$/.test(str)) {
    return str;
  }

  // Extrair minutos (padrão: 50 minutos)
  let minutesToAdd = 50;
  const match = str.match(/^(\d+)\s*(?:min|minutos|m)?$/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 360) {
      minutesToAdd = parsed;
    }
  }

  const targetDate = new Date(acceptedAtDate.getTime() + minutesToAdd * 60 * 1000);
  const timeFormatted = targetDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  return `${timeFormatted} (${minutesToAdd} min após aceite)`;
}

/**
 * Calcula o frete líquido do motorista (Frete Total descontado do % da loja)
 */
export function calculateDriverFee(route: {
  total_fee?: string | number | null;
  final_driver_fee?: string | number | null;
  suggested_driver_fee?: string | number | null;
  management_rate_snapshot?: string | number | null;
  override_reason?: string | null;
}): number {
  const total = parseFloat(String(route.total_fee || '0').replace(',', '.')) || 0;
  if (total <= 0) return 0;

  // Percentual de gestão/retenção da loja (padrão 10% = 0.10)
  const rate =
    route.management_rate_snapshot != null &&
    !isNaN(parseFloat(String(route.management_rate_snapshot)))
      ? parseFloat(String(route.management_rate_snapshot))
      : 0.10;

  // Se houver um override explícito com motivo justificado e diferente do total
  if (route.final_driver_fee != null && route.override_reason?.trim()) {
    const overrideVal = parseFloat(String(route.final_driver_fee).replace(',', '.'));
    if (!isNaN(overrideVal) && overrideVal > 0 && Math.abs(overrideVal - total) > 0.01) {
      return Math.round(overrideVal * 100) / 100;
    }
  }

  // Regra padrão: Frete Total descontado do % da loja (10% de retenção da loja)
  const driverPercent = Math.max(0, 1 - rate);
  return Math.round(total * driverPercent * 100) / 100;
}
