import crypto from 'crypto';
import { db } from '../db/index.ts';
import { driverReferrals, driverReferralEvents, drivers } from '../db/schema.ts';
import { eq, desc, and, sql } from 'drizzle-orm';
import {
  DriverReferral,
  DriverReferralStatus,
  DriverReferralWithDetails,
  DriverReferralEventType,
} from './types.ts';
import { telegramBot } from './telegramBot.ts';

export class ReferralService {
  /**
   * Normalizes Brazilian phone number to canonical format +55DD9XXXXXXXX or +55DDXXXXXXXX
   */
  public normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 11) {
      return `+55${digits}`;
    }
    if (digits.length === 10) {
      return `+55${digits}`;
    }
    if (digits.length === 13 && digits.startsWith('55')) {
      return `+${digits}`;
    }
    if (digits.length === 12 && digits.startsWith('55')) {
      return `+${digits}`;
    }
    // Return digits with +55 prefix if minimum length 10
    if (digits.length >= 10 && digits.length <= 11) {
      return `+55${digits}`;
    }
    throw new Error('TELEFONE_INVALIDO: Informe um telefone celular válido com DDD.');
  }

  /**
   * Formats phone number for display, e.g. (34) 99999-9999
   */
  public formatPhoneDisplay(canonicalPhone: string): string {
    const digits = canonicalPhone.replace(/\D/g, '');
    const local = digits.startsWith('55') ? digits.slice(2) : digits;
    if (local.length === 11) {
      return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    }
    if (local.length === 10) {
      return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    }
    return canonicalPhone;
  }

  /**
   * Section 4 & 6: Create new referral.
   * STRICT SECURITY: Only ACTIVE drivers can refer!
   * Validated server-side.
   */
  public async createReferral(
    indicatorDriverId: number,
    referredName: string,
    referredPhone: string
  ): Promise<DriverReferral> {
    // 1. Fetch indicator driver and verify ACTIVE status
    const indicator = await db
      .select()
      .from(drivers)
      .where(eq(drivers.id, indicatorDriverId))
      .then((res) => res[0]);

    if (!indicator) {
      throw new Error('DRIVER_NOT_FOUND: Motorista indicador não encontrado.');
    }

    if (indicator.status !== 'ACTIVE') {
      throw new Error(
        'DRIVER_NOT_ACTIVE_CANNOT_REFER: Apenas motoristas ATIVOS podem realizar indicações.'
      );
    }

    // 2. Validate nominee name
    const trimmedName = referredName.trim();
    if (trimmedName.length < 2) {
      throw new Error('NOME_INVALIDO: O nome do indicado deve ter pelo menos 2 caracteres.');
    }

    // 3. Normalize nominee phone (Canonical Brazilian Format)
    const canonicalPhone = this.normalizePhone(referredPhone);

    // 4. Insert into driver_referrals (starts as PENDING_REVIEW)
    const [referral] = await db
      .insert(driverReferrals)
      .values({
        referred_by_driver_id: indicatorDriverId,
        referred_name: trimmedName,
        referred_phone: canonicalPhone,
        status: 'PENDING_REVIEW',
      })
      .returning();

    // 5. Register audit event DRIVER_REFERRAL_CREATED
    await db.insert(driverReferralEvents).values({
      referral_id: referral.id,
      event_type: 'DRIVER_REFERRAL_CREATED',
      actor_type: 'DRIVER',
      actor_id: indicator.telegram_user_id,
      details: JSON.stringify({
        indicator_id: indicator.id,
        referred_name: trimmedName,
        referred_phone: canonicalPhone,
      }),
    });

    return referral as DriverReferral;
  }

  /**
   * Helper: check and mark expired tokens automatically
   */
  public async checkAndExpireReferrals(): Promise<void> {
    try {
      const now = new Date();
      const expiredList = await db
        .select()
        .from(driverReferrals)
        .where(
          and(
            eq(driverReferrals.status, 'APPROVED'),
            sql`${driverReferrals.invitation_expires_at} < ${now}`
          )
        );

      for (const ref of expiredList) {
        await db
          .update(driverReferrals)
          .set({ status: 'EXPIRED', updated_at: new Date() })
          .where(eq(driverReferrals.id, ref.id));

        await db.insert(driverReferralEvents).values({
          referral_id: ref.id,
          event_type: 'DRIVER_REFERRAL_EXPIRED',
          actor_type: 'SYSTEM',
          details: 'Token de convite ultrapassou o prazo de 7 dias sem consumo válido.',
        });
      }
    } catch (err: any) {
      console.warn('[ReferralService.checkAndExpireReferrals error]', err.message);
    }
  }

  /**
   * Section 12: Admin listing of referrals with indicator details (NO PIX)
   */
  public async getReferrals(filters?: {
    status?: DriverReferralStatus;
    search?: string;
  }): Promise<DriverReferralWithDetails[]> {
    await this.checkAndExpireReferrals();

    let query = db.select().from(driverReferrals);

    if (filters?.status) {
      query = query.where(eq(driverReferrals.status, filters.status)) as any;
    }

    const rows = (await query.orderBy(desc(driverReferrals.created_at))) as DriverReferral[];

    // Fetch indicator drivers and resulting drivers
    const allDrivers = await db.select().from(drivers);
    const driverMap = new Map<number, (typeof allDrivers)[0]>();
    for (const d of allDrivers) {
      driverMap.set(d.id, d);
    }

    const botStatus = telegramBot.getStatus();
    const botUsername =
      botStatus.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'KantineEntregasbot';

    const result: DriverReferralWithDetails[] = rows.map((r) => {
      const indicator = driverMap.get(r.referred_by_driver_id);
      const resulting = r.resulting_driver_id ? driverMap.get(r.resulting_driver_id) : null;

      let inviteLink: string | null = null;
      if (r.invitation_token && r.status === 'APPROVED') {
        inviteLink = `https://t.me/${botUsername}?start=invite_${r.invitation_token}`;
      }

      return {
        ...r,
        referred_by_driver: indicator
          ? {
              id: indicator.id,
              name: indicator.name,
              status: indicator.status as any,
              vehicle_type: indicator.vehicle_type as any,
              // Strictly NO Pix exposed
            }
          : null,
        resulting_driver: resulting
          ? {
              id: resulting.id,
              name: resulting.name,
              status: resulting.status as any,
            }
          : null,
        invite_link: inviteLink,
      };
    });

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      return result.filter(
        (r) =>
          r.referred_name.toLowerCase().includes(q) ||
          r.referred_phone.includes(q) ||
          r.referred_by_driver?.name.toLowerCase().includes(q)
      );
    }

    return result;
  }

  /**
   * Section 18 & 19: Get referrals by indicator driver ID for [📋 MINHAS INDICAÇÕES]
   */
  public async getReferralsByDriverId(driverId: number): Promise<
    {
      id: number;
      referred_name: string;
      referred_phone: string;
      status: DriverReferralStatus;
      friendly_status: string;
      invitation_expires_at?: Date | null;
      invite_link?: string | null;
      can_invite: boolean;
      resulting_driver_status?: string | null;
      created_at: Date;
    }[]
  > {
    await this.checkAndExpireReferrals();

    const rows = (await db
      .select()
      .from(driverReferrals)
      .where(eq(driverReferrals.referred_by_driver_id, driverId))
      .orderBy(desc(driverReferrals.created_at))) as DriverReferral[];

    const botStatus = telegramBot.getStatus();
    const botUsername =
      botStatus.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'KantineEntregasbot';

    // Fetch resulting drivers to derive 'ATIVADO' if active
    const resultingIds = rows
      .map((r) => r.resulting_driver_id)
      .filter((id): id is number => id !== null && id !== undefined);

    const resultingDriversMap = new Map<number, any>();
    if (resultingIds.length > 0) {
      const resDrivers = await db.select().from(drivers);
      for (const d of resDrivers) {
        if (resultingIds.includes(d.id)) {
          resultingDriversMap.set(d.id, d);
        }
      }
    }

    return rows.map((r) => {
      const resDriver = r.resulting_driver_id ? resultingDriversMap.get(r.resulting_driver_id) : null;
      let friendlyStatus = 'EM ANÁLISE';
      let canInvite = false;
      let inviteLink: string | null = null;

      if (r.status === 'PENDING_REVIEW') {
        friendlyStatus = 'EM ANÁLISE';
      } else if (r.status === 'APPROVED') {
        friendlyStatus = 'APROVADA — AGUARDANDO CADASTRO';
        canInvite = true;
        if (r.invitation_token) {
          inviteLink = `https://t.me/${botUsername}?start=invite_${r.invitation_token}`;
        }
      } else if (r.status === 'INVITE_USED') {
        if (resDriver && resDriver.status === 'ACTIVE') {
          friendlyStatus = 'ATIVADO';
        } else {
          friendlyStatus = 'CADASTRO REALIZADO / EM ANÁLISE';
        }
      } else if (r.status === 'REJECTED') {
        friendlyStatus = 'NÃO APROVADA';
      } else if (r.status === 'EXPIRED') {
        friendlyStatus = 'CONVITE EXPIRADO';
      }

      return {
        id: r.id,
        referred_name: r.referred_name,
        referred_phone: r.referred_phone,
        status: r.status,
        friendly_status: friendlyStatus,
        invitation_expires_at: r.invitation_expires_at,
        invite_link: inviteLink,
        can_invite: canInvite,
        resulting_driver_status: resDriver ? resDriver.status : null,
        created_at: r.created_at,
      };
    });
  }

  /**
   * Section 13: Approve referral (Admin only)
   * Generates secure 7-day single-use token, notifies indicator driver via Telegram.
   */
  public async approveReferral(
    referralId: number,
    adminActor: string
  ): Promise<{ referral: DriverReferral; inviteLink: string }> {
    const existing = await db
      .select()
      .from(driverReferrals)
      .where(eq(driverReferrals.id, referralId))
      .then((res) => res[0]);

    if (!existing) {
      throw new Error('REFERRAL_NOT_FOUND: Indicação não encontrada.');
    }

    if (existing.status !== 'PENDING_REVIEW') {
      throw new Error(`CANNOT_APPROVE_REFERRAL: Indicação já está no status ${existing.status}.`);
    }

    // Generate cryptographically random, unpredictable token (32 hex chars)
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [updated] = await db
      .update(driverReferrals)
      .set({
        status: 'APPROVED',
        invitation_token: token,
        invitation_expires_at: expiresAt,
        reviewed_at: new Date(),
        reviewed_by: adminActor,
        updated_at: new Date(),
      })
      .where(eq(driverReferrals.id, referralId))
      .returning();

    // Record audit event DRIVER_REFERRAL_APPROVED
    await db.insert(driverReferralEvents).values({
      referral_id: referralId,
      event_type: 'DRIVER_REFERRAL_APPROVED',
      actor_type: 'ADMIN',
      actor_id: adminActor,
      details: JSON.stringify({
        token_hash: crypto.createHash('sha256').update(token).digest('hex').slice(0, 16),
        expires_at: expiresAt.toISOString(),
      }),
    });

    const botStatus = telegramBot.getStatus();
    const botUsername =
      botStatus.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'KantineEntregasbot';
    const inviteLink = `https://t.me/${botUsername}?start=invite_${token}`;

    // Section 17: Notify INDICATOR DRIVER via Telegram
    try {
      const indicator = await db
        .select()
        .from(drivers)
        .where(eq(drivers.id, existing.referred_by_driver_id))
        .then((res) => res[0]);

      if (indicator && indicator.telegram_chat_id) {
        const expiresDisplay = expiresAt.toLocaleDateString('pt-BR');
        const firstName = existing.referred_name.split(' ')[0] || existing.referred_name;

        const notifyMsg =
          `✅ *INDICAÇÃO APROVADA*\n\n` +
          `*${existing.referred_name}* foi autorizado(a) a realizar o cadastro.\n\n` +
          `O convite é válido por 7 dias (até ${expiresDisplay}) e pode ser usado uma única vez.\n\n` +
          `🔗 *Link do Convite:*\n\`${inviteLink}\`\n\n` +
          `Encaminhe este link para ${firstName} para que ele(a) possa iniciar o cadastro.`;

        await telegramBot.sendMessage(indicator.telegram_chat_id, notifyMsg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `📨 COMPARTILHAR COM ${firstName.toUpperCase()}`,
                  url: `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(
                    `Olá ${firstName}! Seu convite para se cadastrar na Kantine Entregas foi aprovado. Acesse o link para iniciar seu cadastro:`
                  )}`,
                },
              ],
              [{ text: '📋 MINHAS INDICAÇÕES', callback_data: 'menu_my_referrals' }],
            ],
          },
        });
      }
    } catch (notifErr: any) {
      console.warn('[ReferralService] Could not send approval Telegram notification to indicator:', notifErr.message);
    }

    return {
      referral: updated as DriverReferral,
      inviteLink,
    };
  }

  /**
   * Section 14: Reject referral (Admin only)
   */
  public async rejectReferral(
    referralId: number,
    adminActor: string,
    reason?: string
  ): Promise<DriverReferral> {
    const existing = await db
      .select()
      .from(driverReferrals)
      .where(eq(driverReferrals.id, referralId))
      .then((res) => res[0]);

    if (!existing) {
      throw new Error('REFERRAL_NOT_FOUND: Indicação não encontrada.');
    }

    if (existing.status !== 'PENDING_REVIEW') {
      throw new Error(`CANNOT_REJECT_REFERRAL: Indicação já está no status ${existing.status}.`);
    }

    const trimmedReason = reason?.trim() || null;

    const [updated] = await db
      .update(driverReferrals)
      .set({
        status: 'REJECTED',
        reviewed_at: new Date(),
        reviewed_by: adminActor,
        rejection_reason: trimmedReason,
        updated_at: new Date(),
      })
      .where(eq(driverReferrals.id, referralId))
      .returning();

    // Record audit event DRIVER_REFERRAL_REJECTED
    await db.insert(driverReferralEvents).values({
      referral_id: referralId,
      event_type: 'DRIVER_REFERRAL_REJECTED',
      actor_type: 'ADMIN',
      actor_id: adminActor,
      details: trimmedReason || undefined,
    });

    return updated as DriverReferral;
  }

  /**
   * Section 22: Validate invite token
   */
  public async validateInviteToken(rawToken: string): Promise<{
    valid: boolean;
    error?: string;
    message?: string;
    referral?: DriverReferral;
    alreadyBoundUser?: string | null;
  }> {
    if (!rawToken || !rawToken.trim()) {
      return { valid: false, error: 'TOKEN_REQUIRED', message: 'Token de convite não fornecido.' };
    }

    // Clean token: strip invite_ prefix if present
    const cleanToken = rawToken.replace(/^invite_/, '').trim();

    const referral = (await db
      .select()
      .from(driverReferrals)
      .where(eq(driverReferrals.invitation_token, cleanToken))
      .then((res) => res[0])) as DriverReferral | undefined;

    if (!referral) {
      return {
        valid: false,
        error: 'TOKEN_NOT_FOUND',
        message: 'Convite não encontrado ou inválido.',
      };
    }

    // Check expiration
    if (referral.invitation_expires_at && new Date() > new Date(referral.invitation_expires_at)) {
      if (referral.status !== 'EXPIRED') {
        await db
          .update(driverReferrals)
          .set({ status: 'EXPIRED', updated_at: new Date() })
          .where(eq(driverReferrals.id, referral.id));

        await db.insert(driverReferralEvents).values({
          referral_id: referral.id,
          event_type: 'DRIVER_REFERRAL_EXPIRED',
          actor_type: 'SYSTEM',
          details: 'Convite expirado verificado na tentativa de consumo.',
        });
      }
      return {
        valid: false,
        error: 'TOKEN_EXPIRED',
        message:
          'Este convite expirou. Peça ao motorista que realizou sua indicação para solicitar uma nova autorização à Kantine.',
      };
    }

    if (referral.status === 'REJECTED') {
      return {
        valid: false,
        error: 'TOKEN_REJECTED',
        message: 'Esta indicação foi cancelada ou não foi aprovada.',
      };
    }

    if (referral.status === 'EXPIRED') {
      return {
        valid: false,
        error: 'TOKEN_EXPIRED',
        message:
          'Este convite expirou. Peça ao motorista que realizou sua indicação para solicitar uma nova autorização à Kantine.',
      };
    }

    // If status is INVITE_USED: valid only for the user who already bound it
    if (referral.status === 'INVITE_USED') {
      return {
        valid: true,
        referral,
        alreadyBoundUser: referral.invited_telegram_user_id || null,
      };
    }

    if (referral.status === 'APPROVED') {
      return {
        valid: true,
        referral,
        alreadyBoundUser: null,
      };
    }

    return {
      valid: false,
      error: 'INVALID_STATUS',
      message: 'Este convite ainda não está disponível para uso.',
    };
  }

  /**
   * Section 22, 23, 24: Consume and bind invite token to Telegram User ID
   * Atomic binding: Once bound to Telegram User ID, João cannot use Carlos's invite.
   * Legitimate retry of SAME user is allowed.
   */
  public async consumeInvite(
    rawToken: string,
    telegramUserId: string
  ): Promise<DriverReferral> {
    const cleanToken = rawToken.replace(/^invite_/, '').trim();
    const validation = await this.validateInviteToken(cleanToken);

    if (!validation.valid || !validation.referral) {
      throw new Error(validation.error || 'INVALID_INVITE_TOKEN');
    }

    const ref = validation.referral;

    // Check binding integrity
    if (ref.invited_telegram_user_id) {
      if (ref.invited_telegram_user_id !== telegramUserId) {
        throw new Error('TOKEN_ALREADY_USED_BY_ANOTHER_USER: Este convite já foi utilizado por outro usuário.');
      }
      // Legitimate retry of the SAME user
      return ref;
    }

    // First valid consumption: bind to this Telegram account
    const [updated] = await db
      .update(driverReferrals)
      .set({
        status: 'INVITE_USED',
        invited_telegram_user_id: telegramUserId,
        invitation_used_at: new Date(),
        updated_at: new Date(),
      })
      .where(and(eq(driverReferrals.id, ref.id), eq(driverReferrals.status, 'APPROVED')))
      .returning();

    if (!updated) {
      // Concurrency check: another transaction consumed it
      const current = await db
        .select()
        .from(driverReferrals)
        .where(eq(driverReferrals.id, ref.id))
        .then((r) => r[0]);

      if (current && current.invited_telegram_user_id === telegramUserId) {
        return current as DriverReferral;
      }
      throw new Error('TOKEN_ALREADY_USED_BY_ANOTHER_USER: Este convite já foi utilizado por outro usuário.');
    }

    // Record audit event DRIVER_INVITE_CONSUMED
    await db.insert(driverReferralEvents).values({
      referral_id: ref.id,
      event_type: 'DRIVER_INVITE_CONSUMED',
      actor_type: 'DRIVER',
      actor_id: telegramUserId,
      details: JSON.stringify({
        telegram_user_id: telegramUserId,
        consumed_at: new Date().toISOString(),
      }),
    });

    return updated as DriverReferral;
  }

  /**
   * Associate the completed driver registration to the referral
   */
  public async linkResultingDriver(referralId: number, driverId: number): Promise<void> {
    await db
      .update(driverReferrals)
      .set({
        resulting_driver_id: driverId,
        updated_at: new Date(),
      })
      .where(eq(driverReferrals.id, referralId));
  }

  /**
   * Find referral by invited telegram user ID
   */
  public async getReferralByInvitedTelegramUser(telegramUserId: string): Promise<DriverReferral | null> {
    const res = await db
      .select()
      .from(driverReferrals)
      .where(eq(driverReferrals.invited_telegram_user_id, telegramUserId))
      .then((r) => r[0]);
    return (res as DriverReferral) || null;
  }

  /**
   * Audit events for a referral
   */
  public async getReferralEvents(referralId: number) {
    return db
      .select()
      .from(driverReferralEvents)
      .where(eq(driverReferralEvents.referral_id, referralId))
      .orderBy(desc(driverReferralEvents.timestamp));
  }
}

export const referralService = new ReferralService();
