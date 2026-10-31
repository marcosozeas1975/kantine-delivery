/**
 * Mercado Pago Integration Service
 * Suporta Repasse / Payouts automatizados via Pix para motoristas
 * e verificação de status da conta.
 */

import { validateAndNormalizeCpf, validateAndNormalizePixPhone, validateAndNormalizePixEmail, validateAndNormalizePixRandom } from './pixValidation.ts';

export interface MercadoPagoAccountInfo {
  configured: boolean;
  user_id?: number | string;
  nickname?: string;
  email?: string;
  site_id?: string;
  error?: string;
}

export interface PayoutResult {
  success: boolean;
  payoutId?: string;
  status?: string;
  message: string;
  raw?: any;
}

export class MercadoPagoService {
  private getAccessToken(): string | null {
    return (process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim() || null;
  }

  public isConfigured(): boolean {
    const token = this.getAccessToken();
    return Boolean(token && token.length > 10);
  }

  /**
   * Obtém informações da conta Mercado Pago autenticada pelo Access Token
   */
  public async getAccountInfo(): Promise<MercadoPagoAccountInfo> {
    const token = this.getAccessToken();
    if (!token) {
      return {
        configured: false,
        error: 'MERCADO_PAGO_ACCESS_TOKEN não configurado no servidor.',
      };
    }

    try {
      const res = await fetch('https://api.mercadopago.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          configured: true,
          error: `Erro ao autenticar no Mercado Pago (${res.status}): ${text}`,
        };
      }

      const data = await res.json();
      return {
        configured: true,
        user_id: data.id,
        nickname: data.nickname,
        email: data.email,
        site_id: data.site_id,
      };
    } catch (err: any) {
      return {
        configured: true,
        error: `Falha de conexão com a API do Mercado Pago: ${err.message}`,
      };
    }
  }

  /**
   * Normaliza tipo e valor da chave Pix para o padrão esperado pelo Mercado Pago
   */
  private formatReceiverPix(keyType: string, keyValue: string): { key: string; type: 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp' } {
    const upperType = (keyType || '').toUpperCase().trim();
    const rawVal = (keyValue || '').trim();

    if (upperType === 'CPF') {
      const norm = validateAndNormalizeCpf(rawVal);
      return {
        key: norm.isValid && norm.canonical ? norm.canonical : rawVal.replace(/\D/g, ''),
        type: 'cpf',
      };
    }

    if (upperType === 'PHONE') {
      const norm = validateAndNormalizePixPhone(rawVal);
      // Mercado Pago espera número com DDI e DDD ex: +5534999999999 ou dígitos com 55
      const phoneVal = norm.isValid && norm.canonical ? norm.canonical : (rawVal.startsWith('+') ? rawVal : `+55${rawVal.replace(/\D/g, '')}`);
      return {
        key: phoneVal,
        type: 'phone',
      };
    }

    if (upperType === 'EMAIL') {
      const norm = validateAndNormalizePixEmail(rawVal);
      return {
        key: norm.isValid && norm.canonical ? norm.canonical : rawVal.toLowerCase(),
        type: 'email',
      };
    }

    // Default: Chave aleatória (EVP)
    const norm = validateAndNormalizePixRandom(rawVal);
    return {
      key: norm.isValid && norm.canonical ? norm.canonical : rawVal,
      type: 'evp',
    };
  }

  /**
   * Executa a transferência Pix para a chave do motorista via API de Payouts do Mercado Pago
   */
  public async executePixPayout(params: {
    routeId: number;
    amount: number;
    driverName: string;
    pixKey: string;
    pixKeyType: string;
    description?: string;
  }): Promise<PayoutResult> {
    const token = this.getAccessToken();
    if (!token) {
      return {
        success: false,
        message: 'MERCADO_PAGO_ACCESS_TOKEN não configurado no servidor.',
      };
    }

    const { routeId, amount, driverName, pixKey, pixKeyType, description } = params;

    if (!amount || amount <= 0) {
      return {
        success: false,
        message: 'Valor inválido para repasse.',
      };
    }

    if (!pixKey) {
      return {
        success: false,
        message: 'Motorista não possui chave Pix cadastrada.',
      };
    }

    const receiver = this.formatReceiverPix(pixKeyType, pixKey);
    const idempotencyKey = `payout_route_${routeId}_${Date.now()}`;
    const desc = description || `Repasse frete Rota #${routeId} - Motorista ${driverName}`;

    // Payload estruturado conforme especificação de Payouts do Mercado Pago
    const payload = {
      payment_method_id: 'pix',
      transactions: [
        {
          amount: Math.round(amount * 100) / 100,
          external_reference: `ROUTE_${routeId}`,
          description: desc.slice(0, 50),
          receiver: {
            pix_key: receiver.key,
            pix_key_type: receiver.type,
          },
        },
      ],
    };

    console.log(`[MercadoPago] Iniciando repasse Pix para Rota #${routeId}: R$ ${amount} -> ${receiver.type}:${receiver.key}`);

    try {
      const res = await fetch('https://api.mercadopago.com/v1/payouts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const responseData: any = await res.json().catch(() => null);

      if (!res.ok) {
        console.error(`[MercadoPago Payouts Error ${res.status}]`, responseData);

        if (res.status === 401) {
          return {
            success: false,
            message: 'Token de Acesso do Mercado Pago não autorizado ou inválido (401).',
            raw: responseData,
          };
        }

        if (res.status === 403) {
          return {
            success: false,
            message: 'A sua conta Mercado Pago ainda não tem a funcionalidade de Transferências/Payouts ativada pelo setor comercial do Mercado Pago (403 Forbidden). Caso deseje, você pode fazer o Pix diretamente pelo seu banco e registrar o comprovante aqui.',
            raw: responseData,
          };
        }

        const msg = responseData?.message || responseData?.error || `Erro HTTP ${res.status} ao processar no Mercado Pago`;
        return {
          success: false,
          message: msg,
          raw: responseData,
        };
      }

      // Sucesso na criação do lote/transferência
      const payoutId = responseData?.id || responseData?.transactions?.[0]?.id || `MP_${Date.now()}`;
      const status = responseData?.status || responseData?.transactions?.[0]?.status || 'PROCESSED';

      return {
        success: true,
        payoutId: String(payoutId),
        status,
        message: `Transferência Pix enviada via Mercado Pago com sucesso (ID: ${payoutId}, Status: ${status}).`,
        raw: responseData,
      };
    } catch (err: any) {
      console.error(`[MercadoPago Connection Error]`, err);
      return {
        success: false,
        message: `Falha de conexão com os servidores do Mercado Pago: ${err.message}`,
      };
    }
  }
}

export const mercadoPagoService = new MercadoPagoService();
