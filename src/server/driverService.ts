import { db, prodDb } from '../db/index.ts';
import { drivers, driverEvents, driverInvitations, driverReferrals } from '../db/schema.ts';
import { eq, desc, sql } from 'drizzle-orm';
import { Driver, DriverStatus, VehicleType, DriverEventType, PixKeyType, DriverInvitation } from './types.ts';
import { canReceiveDeliveryOffers } from './eligibility.ts';
import { telegramBot } from './telegramBot.ts';
import {
  validateAndNormalizePix,
  maskPixKey,
  normalizeGeneralPhone,
} from './pixValidation.ts';

function escapeTelegramMarkdown(str: string): string {
  if (!str) return '';
  return str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export class DriverService {
  public async getDrivers(statusFilter?: DriverStatus): Promise<Driver[]> {
    try {
      let result: Driver[] = [];
      if (statusFilter) {
        result = (await db
          .select()
          .from(drivers)
          .where(eq(drivers.status, statusFilter))
          .orderBy(desc(drivers.created_at))) as Driver[];
      } else {
        result = (await db
          .select()
          .from(drivers)
          .orderBy(desc(drivers.created_at))) as Driver[];
      }

      // If in dev environment, sync any missing drivers from prodDb
      if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
        try {
          const prodDrivers = (await prodDb
            .select()
            .from(drivers)
            .orderBy(desc(drivers.created_at))) as Driver[];
          const existingIds = new Set(result.map(d => d.id));
          const existingUserIds = new Set(result.map(d => d.telegram_user_id));
          for (const pd of prodDrivers) {
            if (!existingIds.has(pd.id) && !existingUserIds.has(pd.telegram_user_id)) {
              if (!statusFilter || pd.status === statusFilter) {
                result.push(pd);
              }
              // Mirror to dev db
              await db.insert(drivers).values(pd).onConflictDoNothing().catch(() => {});
            }
          }
        } catch (syncErr: any) {
          console.warn('[DriverService.getDrivers] Sync from prodDb warning:', syncErr?.message);
        }
      }

      return result;
    } catch (err: any) {
      console.error('[DriverService.getDrivers failed]', err);
      throw new Error('Failed to retrieve drivers', { cause: err });
    }
  }

  public async getDriverById(id: number): Promise<Driver | null> {
    try {
      const results = await db.select().from(drivers).where(eq(drivers.id, id));
      if (results[0]) return results[0] as Driver;
      if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
        const prodResults = await prodDb.select().from(drivers).where(eq(drivers.id, id));
        if (prodResults[0]) {
          await db.insert(drivers).values(prodResults[0]).onConflictDoNothing().catch(() => {});
          return prodResults[0] as Driver;
        }
      }
      return null;
    } catch (err: any) {
      console.error(`[DriverService.getDriverById failed for id ${id}]`, err);
      throw new Error(`Failed to retrieve driver #${id}`, { cause: err });
    }
  }

  public async getDriverByTelegramUserId(telegramUserId: string): Promise<Driver | null> {
    try {
      const results = await db
        .select()
        .from(drivers)
        .where(eq(drivers.telegram_user_id, telegramUserId));
      if (results[0]) return results[0] as Driver;

      if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
        const prodResults = await prodDb
          .select()
          .from(drivers)
          .where(eq(drivers.telegram_user_id, telegramUserId));
        if (prodResults[0]) {
          await db.insert(drivers).values(prodResults[0]).onConflictDoNothing().catch(() => {});
          return prodResults[0] as Driver;
        }
      }
      return null;
    } catch (err: any) {
      console.error(`[DriverService.getDriverByTelegramUserId failed]`, err);
      throw new Error('Failed to find driver by Telegram User ID', { cause: err });
    }
  }

  public async getDriverByPhone(phone: string): Promise<Driver | null> {
    try {
      const cleanPhone = normalizeGeneralPhone(phone);
      const digits = phone.replace(/\D/g, '');
      const rawLocal = digits.startsWith('55') && digits.length > 10 ? digits.slice(2) : digits;

      const allDrivers = (await db.select().from(drivers)) as Driver[];
      let found = allDrivers.find((d) => {
        if (!d.phone) return false;
        const dClean = normalizeGeneralPhone(d.phone);
        const dDigits = d.phone.replace(/\D/g, '');
        const dLocal = dDigits.startsWith('55') && dDigits.length > 10 ? dDigits.slice(2) : dDigits;
        return (
          d.phone === cleanPhone ||
          d.phone === phone ||
          dClean === cleanPhone ||
          (rawLocal.length >= 8 && dLocal === rawLocal)
        );
      });
      if (found) return found;

      if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
        const prodDrivers = (await prodDb.select().from(drivers)) as Driver[];
        found = prodDrivers.find((d) => {
          if (!d.phone) return false;
          const dClean = normalizeGeneralPhone(d.phone);
          const dDigits = d.phone.replace(/\D/g, '');
          const dLocal = dDigits.startsWith('55') && dDigits.length > 10 ? dDigits.slice(2) : dDigits;
          return (
            d.phone === cleanPhone ||
            d.phone === phone ||
            dClean === cleanPhone ||
            (rawLocal.length >= 8 && dLocal === rawLocal)
          );
        });
        if (found) {
          await db.insert(drivers).values(found).onConflictDoNothing().catch(() => {});
          return found;
        }
      }
      return null;
    } catch (err: any) {
      console.error(`[DriverService.getDriverByPhone failed]`, err);
      return null;
    }
  }

  public async registerDriver(data: {
    telegram_user_id: string;
    telegram_chat_id: string;
    name: string;
    phone: string;
    vehicle_type: string;
    pix_key?: string;
    pix_key_type?: PixKeyType;
    pix_key_value?: string;
    invite_token?: string;
  }): Promise<Driver> {
    // Validate vehicle type
    const validVehicles: VehicleType[] = [
      'CAR',
      'MOTO',
      'MOTO_WITH_BAG',
      'CAR_HATCH',
      'CAR_SEDAN',
      'CAR_SW',
      'MOTO_WITHOUT_BAG',
      'OTHER',
    ];
    if (!validVehicles.includes(data.vehicle_type as VehicleType)) {
      throw new Error(`INVALID_VEHICLE_TYPE: ${data.vehicle_type}`);
    }

    // Canonicalize to simplified types: CAR, MOTO, MOTO_WITH_BAG
    let canonicalVehicle: VehicleType = data.vehicle_type as VehicleType;
    if (['CAR_HATCH', 'CAR_SEDAN', 'CAR_SW', 'OTHER'].includes(canonicalVehicle as string)) {
      canonicalVehicle = 'CAR';
    } else if (canonicalVehicle === 'MOTO_WITHOUT_BAG') {
      canonicalVehicle = 'MOTO';
    }

    if (!data.name || !data.phone || !data.telegram_user_id) {
      throw new Error('MISSING_REQUIRED_FIELDS');
    }

    // Determine Pix key type and canonical value
    let canonicalPixType: PixKeyType = 'REQUIRES_UPDATE';
    let canonicalPixValue: string = '';

    if (data.pix_key_type) {
      const val = data.pix_key_value || data.pix_key || '';
      const validation = validateAndNormalizePix(data.pix_key_type, val);
      if (!validation.isValid) {
        throw new Error(`INVALID_PIX_KEY: ${validation.error}`);
      }
      canonicalPixType = data.pix_key_type;
      canonicalPixValue = validation.canonical!;
    } else if (data.pix_key) {
      // Legacy M1 fallback: explicitly marked as REQUIRES_UPDATE per M1.1 Section 13
      canonicalPixValue = data.pix_key.trim();
      canonicalPixType = 'REQUIRES_UPDATE';
    } else {
      throw new Error('MISSING_REQUIRED_FIELDS');
    }

    // Check idempotency before insert
    let existing = await this.getDriverByTelegramUserId(data.telegram_user_id);
    if (!existing) {
      existing = await this.getDriverByPhone(data.phone.trim());
    }

    if (existing) {
      // If driver was EXCLUDED: they MUST have a valid new invite token to re-register ("processo zerado")!
      if (existing.status === 'EXCLUDED' || existing.is_excluded) {
        if (!data.invite_token) {
          throw new Error(
            'EXCLUDED_DRIVER_REQUIRES_NEW_INVITE: Motoristas excluídos têm o processo zerado e só podem ser reinseridos através de novo convite e aprovação.'
          );
        }
      }

      // If driver has a valid invite_token OR was EXCLUDED/PENDING, reset and register fresh as PENDING:
      if (data.invite_token || existing.status === 'EXCLUDED' || existing.is_excluded || existing.status === 'PENDING') {
        const prevReason =
          existing.exclusion_reason || existing.previous_exclusion_reason || 'Desativação anterior';
        const newExclusionCount = existing.is_excluded ? (existing.exclusion_count || 0) + 1 : (existing.exclusion_count || 0);

        const updated = await db
          .update(drivers)
          .set({
            telegram_user_id: data.telegram_user_id,
            telegram_chat_id: data.telegram_chat_id,
            name: data.name.trim(),
            phone: data.phone.trim(),
            vehicle_type: canonicalVehicle,
            pix_key: canonicalPixValue,
            pix_key_type: canonicalPixType,
            pix_key_value: canonicalPixValue,
            status: 'PENDING',
            is_excluded: false,
            excluded_at: null,
            exclusion_reason: null,
            excluded_by: null,
            previous_exclusion_reason: prevReason,
            exclusion_count: newExclusionCount,
            reactivation_requested: false,
            reactivation_reason: null,
            reactivation_requested_at: null,
            reinclusion_requested: false,
            reinclusion_reason: null,
            reinclusion_requested_at: null,
            updated_at: new Date(),
          })
          .where(eq(drivers.id, existing.id))
          .returning();

        const reincluded = (updated[0] as Driver) || existing;

        await db.insert(driverEvents).values({
          driver_id: existing.id,
          event_type: 'DRIVER_REGISTERED',
          actor_type: 'DRIVER',
          actor_id: data.telegram_user_id,
          details: JSON.stringify({
            via_invite_token: data.invite_token || null,
            new_vehicle: canonicalVehicle,
            new_phone: data.phone.trim(),
            new_pix: canonicalPixValue,
          }),
        });

        // Link invitation if provided
        if (data.invite_token) {
          await db
            .update(driverInvitations)
            .set({
              status: 'COMPLETED',
              telegram_user_id: data.telegram_user_id,
              driver_id: existing.id,
              completed_at: new Date(),
            })
            .where(eq(driverInvitations.token, data.invite_token))
            .catch(() => {});
        }

        if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
          try {
            await prodDb
              .update(drivers)
              .set({
                telegram_user_id: data.telegram_user_id,
                telegram_chat_id: data.telegram_chat_id,
                name: data.name.trim(),
                phone: data.phone.trim(),
                vehicle_type: canonicalVehicle,
                pix_key: canonicalPixValue,
                pix_key_type: canonicalPixType,
                pix_key_value: canonicalPixValue,
                status: 'PENDING',
                is_excluded: false,
                excluded_at: null,
                exclusion_reason: null,
                excluded_by: null,
                previous_exclusion_reason: prevReason,
                exclusion_count: newExclusionCount,
                reactivation_requested: false,
                reactivation_reason: null,
                reactivation_requested_at: null,
                reinclusion_requested: false,
                reinclusion_reason: null,
                reinclusion_requested_at: null,
                updated_at: new Date(),
              })
              .where(eq(drivers.id, existing.id))
              .catch(() => {});

            if (data.invite_token) {
              await prodDb
                .update(driverInvitations)
                .set({
                  status: 'COMPLETED',
                  telegram_user_id: data.telegram_user_id,
                  driver_id: existing.id,
                  completed_at: new Date(),
                })
                .where(eq(driverInvitations.token, data.invite_token))
                .catch(() => {});
            }
          } catch (e: any) {
            console.warn('[DriverService] Mirror re-registered driver to prod warning:', e?.message);
          }
        }

        return reincluded;
      }

      throw new Error('DRIVER_ALREADY_EXISTS');
    }

    try {
      const inserted = await db
        .insert(drivers)
        .values({
          telegram_user_id: data.telegram_user_id,
          telegram_chat_id: data.telegram_chat_id,
          name: data.name.trim(),
          phone: data.phone.trim(),
          vehicle_type: canonicalVehicle,
          pix_key: canonicalPixValue,
          pix_key_type: canonicalPixType,
          pix_key_value: canonicalPixValue,
          status: 'PENDING',
        })
        .returning();

      const newDriver = inserted[0] as Driver;

      // Record audit event DRIVER_REGISTERED
      await db.insert(driverEvents).values({
        driver_id: newDriver.id,
        event_type: 'DRIVER_REGISTERED',
        actor_type: 'DRIVER',
        actor_id: data.telegram_user_id,
      });

      // Link any matching driver invitation
      try {
        if (data.invite_token) {
          await db
            .update(driverInvitations)
            .set({
              status: 'COMPLETED',
              telegram_user_id: data.telegram_user_id,
              driver_id: newDriver.id,
              completed_at: new Date(),
            })
            .where(eq(driverInvitations.token, data.invite_token));
        } else if (data.phone) {
          await db
            .update(driverInvitations)
            .set({
              status: 'COMPLETED',
              telegram_user_id: data.telegram_user_id,
              driver_id: newDriver.id,
              completed_at: new Date(),
            })
            .where(eq(driverInvitations.phone, data.phone.trim()));
        }
      } catch (invErr: any) {
        console.warn('[DriverService] Note: Failed to link invitation:', invErr?.message);
      }

      // Link any matching driver referral (M1.2)
      try {
        if (data.invite_token) {
          const cleanToken = data.invite_token.replace(/^invite_/, '').trim();
          await db
            .update(driverReferrals)
            .set({
              resulting_driver_id: newDriver.id,
              updated_at: new Date(),
            })
            .where(eq(driverReferrals.invitation_token, cleanToken));
        }
        await db
          .update(driverReferrals)
          .set({
            resulting_driver_id: newDriver.id,
            updated_at: new Date(),
          })
          .where(eq(driverReferrals.invited_telegram_user_id, data.telegram_user_id));
      } catch (refErr: any) {
        console.warn('[DriverService] Note: Failed to link referral:', refErr?.message);
      }

      // Mirror to prodDb if running in dev environment
      if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
        try {
          await prodDb.insert(drivers).values(newDriver).onConflictDoNothing();
          await prodDb.insert(driverEvents).values({
            driver_id: newDriver.id,
            event_type: 'DRIVER_REGISTERED',
            actor_type: 'DRIVER',
            actor_id: data.telegram_user_id,
          }).catch(() => {});
          if (data.invite_token) {
            await prodDb
              .update(driverInvitations)
              .set({
                status: 'COMPLETED',
                telegram_user_id: data.telegram_user_id,
                driver_id: newDriver.id,
                completed_at: new Date(),
              })
              .where(eq(driverInvitations.token, data.invite_token))
              .catch(() => {});
          }
        } catch (mErr: any) {
          console.warn('[DriverService.registerDriver] Mirror to prodDb failed:', mErr?.message);
        }
      }

      return newDriver;
    } catch (err: any) {
      if (err?.code === '23505') {
        // Postgres unique violation on telegram_user_id
        throw new Error('DRIVER_ALREADY_EXISTS');
      }
      console.error('[DriverService.registerDriver failed]', err);
      throw new Error('Failed to register driver', { cause: err });
    }
  }

  /**
   * M1.1: Updates driver profile (name, phone, vehicle_type, pix)
   * Strictly protects id, telegram_user_id, telegram_chat_id, status, created_at.
   * Records atomic DRIVER_PROFILE_UPDATED events in driver_events.
   */
  public async updateDriverProfile(
    driverId: number,
    updates: {
      name?: string;
      phone?: string;
      vehicle_type?: string;
      pix_key_type?: string;
      pix_key_value?: string;
      pix?: {
        pix_key_type: PixKeyType;
        pix_key_value: string;
      };
      status?: any;
      id?: any;
      telegram_user_id?: any;
      telegram_chat_id?: any;
      created_at?: any;
    },
    context: {
      actor_type: 'DRIVER' | 'ADMIN';
      actor_id?: string;
    }
  ): Promise<Driver> {
    // 1. Strictly forbid editing protected fields
    if (
      updates.status !== undefined ||
      updates.id !== undefined ||
      updates.telegram_user_id !== undefined ||
      updates.telegram_chat_id !== undefined ||
      updates.created_at !== undefined
    ) {
      throw new Error('PROTECTED_FIELDS_CANNOT_BE_MODIFIED');
    }

    const driver = await this.getDriverById(driverId);
    if (!driver) {
      throw new Error('DRIVER_NOT_FOUND');
    }

    const setPayload: any = {
      updated_at: new Date(),
    };
    const auditEventsToInsert: any[] = [];

    // 2. Validate and set Name
    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim();
      if (trimmedName.length < 2) {
        throw new Error('INVALID_NAME: O nome deve ter pelo menos 2 caracteres.');
      }
      if (trimmedName !== driver.name) {
        setPayload.name = trimmedName;
        auditEventsToInsert.push({
          driver_id: driverId,
          event_type: 'DRIVER_PROFILE_UPDATED',
          actor_type: context.actor_type,
          actor_id: context.actor_id || null,
          field_changed: 'name',
          old_value: driver.name,
          new_value: trimmedName,
        });
      }
    }

    // 3. Validate and set Phone
    if (updates.phone !== undefined) {
      const cleanedDigits = updates.phone.replace(/\D/g, '');
      if (cleanedDigits.length < 8) {
        throw new Error('INVALID_PHONE: Telefone inválido.');
      }
      const formattedPhone = normalizeGeneralPhone(updates.phone);
      if (formattedPhone !== driver.phone) {
        setPayload.phone = formattedPhone;
        auditEventsToInsert.push({
          driver_id: driverId,
          event_type: 'DRIVER_PROFILE_UPDATED',
          actor_type: context.actor_type,
          actor_id: context.actor_id || null,
          field_changed: 'phone',
          old_value: driver.phone,
          new_value: formattedPhone,
        });
      }
    }

    // 4. Validate and set Vehicle Type
    if (updates.vehicle_type !== undefined) {
      const validVehicles: VehicleType[] = [
        'CAR',
        'MOTO',
        'MOTO_WITH_BAG',
        'CAR_HATCH',
        'CAR_SEDAN',
        'CAR_SW',
        'MOTO_WITHOUT_BAG',
        'OTHER',
      ];
      if (!validVehicles.includes(updates.vehicle_type as VehicleType)) {
        throw new Error(`INVALID_VEHICLE_TYPE: ${updates.vehicle_type}`);
      }
      let canonicalVeh: VehicleType = updates.vehicle_type as VehicleType;
      if (['CAR_HATCH', 'CAR_SEDAN', 'CAR_SW', 'OTHER'].includes(canonicalVeh as string)) {
        canonicalVeh = 'CAR';
      } else if (canonicalVeh === 'MOTO_WITHOUT_BAG') {
        canonicalVeh = 'MOTO';
      }
      if (canonicalVeh !== driver.vehicle_type) {
        setPayload.vehicle_type = canonicalVeh;
        auditEventsToInsert.push({
          driver_id: driverId,
          event_type: 'DRIVER_PROFILE_UPDATED',
          actor_type: context.actor_type,
          actor_id: context.actor_id || null,
          field_changed: 'vehicle_type',
          old_value: driver.vehicle_type,
          new_value: canonicalVeh,
        });
      }
    }

    // 5. Validate and set Pix (Atomic unit: type + value)
    const targetPixType = updates.pix?.pix_key_type || updates.pix_key_type;
    const targetPixValue = updates.pix?.pix_key_value || updates.pix_key_value;

    if (targetPixType !== undefined || targetPixValue !== undefined) {
      if (!targetPixType || !targetPixValue) {
        throw new Error('INVALID_PIX_UPDATE: Tipo e valor Pix devem ser atualizados conjuntamente.');
      }

      const valRes = validateAndNormalizePix(targetPixType as PixKeyType, targetPixValue);
      if (!valRes.isValid) {
        throw new Error(valRes.error || 'INVALID_PIX_KEY');
      }

      const canonicalVal = valRes.canonical!;
      const canonicalType = targetPixType as PixKeyType;

      const isPixDifferent =
        driver.pix_key_type !== canonicalType ||
        (driver.pix_key_value || driver.pix_key) !== canonicalVal;

      if (isPixDifferent) {
        const oldMasked = maskPixKey(driver.pix_key_type, driver.pix_key_value || driver.pix_key);
        const newMasked = maskPixKey(canonicalType, canonicalVal);

        setPayload.pix_key_type = canonicalType;
        setPayload.pix_key_value = canonicalVal;
        setPayload.pix_key = canonicalVal;

        auditEventsToInsert.push({
          driver_id: driverId,
          event_type: 'DRIVER_PROFILE_UPDATED',
          actor_type: context.actor_type,
          actor_id: context.actor_id || null,
          field_changed: 'pix',
          old_value: `${driver.pix_key_type}:${oldMasked}`,
          new_value: `${canonicalType}:${newMasked}`,
          details: JSON.stringify({
            old_pix_type: driver.pix_key_type,
            old_pix_value_masked: oldMasked,
            new_pix_type: canonicalType,
            new_pix_value_masked: newMasked,
          }),
        });
      }
    }

    // If nothing changed, return current driver
    if (Object.keys(setPayload).length === 1 && setPayload.updated_at) {
      return driver;
    }

    // Perform database update
    const updated = await db
      .update(drivers)
      .set(setPayload)
      .where(eq(drivers.id, driverId))
      .returning();

    const updatedDriver = updated[0] as Driver;

    // Record all audit events
    for (const event of auditEventsToInsert) {
      await db.insert(driverEvents).values(event);
    }

    return updatedDriver;
  }

  public async approveDriver(id: number): Promise<Driver> {
    const driver = await this.getDriverById(id);
    if (!driver) {
      throw new Error('DRIVER_NOT_FOUND');
    }

    if (driver.status === 'ACTIVE') {
      return driver;
    }

    if (driver.status !== 'PENDING') {
      throw new Error(`CANNOT_APPROVE_FROM_STATUS_${driver.status}`);
    }

    try {
      const updated = await db
        .update(drivers)
        .set({
          status: 'ACTIVE',
          updated_at: new Date(),
        })
        .where(eq(drivers.id, id))
        .returning();

      const updatedDriver = updated[0] as Driver;

      // Mirror to prodDb if in dev
      if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
        try {
          await prodDb
            .update(drivers)
            .set({
              status: 'ACTIVE',
              updated_at: new Date(),
            })
            .where(eq(drivers.id, id))
            .catch(() => {});
          await prodDb.insert(driverEvents).values({
            driver_id: id,
            event_type: 'DRIVER_APPROVED',
          }).catch(() => {});
        } catch {}
      }

      // Record DRIVER_APPROVED
      await db.insert(driverEvents).values({
        driver_id: id,
        event_type: 'DRIVER_APPROVED',
      });

      // 10. Enviar mensagem Telegram se não for chat placeholder
      if (updatedDriver.telegram_chat_id && !updatedDriver.telegram_chat_id.startsWith('pending_')) {
        const msg =
          '✅ Cadastro aprovado.\n\n' +
          'Você agora está habilitado para receber ofertas de entrega da Kantine.';

        await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg).catch((e) =>
          console.warn('[DriverService.approveDriver] Telegram notification notice:', e.message)
        );
      }

      return updatedDriver;
    } catch (err: any) {
      console.error(`[DriverService.approveDriver failed for #${id}]`, err);
      throw new Error(`Failed to approve driver #${id}`, { cause: err });
    }
  }

  public async blockDriver(id: number): Promise<Driver> {
    const driver = await this.getDriverById(id);
    if (!driver) {
      throw new Error('DRIVER_NOT_FOUND');
    }

    if (driver.status === 'BLOCKED') {
      return driver;
    }

    const wasActive = driver.status === 'ACTIVE';

    try {
      const updated = await db
        .update(drivers)
        .set({
          status: 'BLOCKED',
          updated_at: new Date(),
        })
        .where(eq(drivers.id, id))
        .returning();

      const updatedDriver = updated[0] as Driver;

      // Record DRIVER_BLOCKED
      await db.insert(driverEvents).values({
        driver_id: id,
        event_type: 'DRIVER_BLOCKED',
      });

      // 11. Ao bloquear motorista ACTIVE, enviar mensagem
      if (wasActive) {
        const msg =
          'Seu cadastro de entregador não está ativo no momento.\n\n' +
          'Caso tenha dúvidas, entre em contato com a Kantine.';
        await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);
      }

      return updatedDriver;
    } catch (err: any) {
      console.error(`[DriverService.blockDriver failed for #${id}]`, err);
      throw new Error(`Failed to block driver #${id}`, { cause: err });
    }
  }

  public async reactivateDriver(id: number): Promise<Driver> {
    const driver = await this.getDriverById(id);
    if (!driver) {
      throw new Error('DRIVER_NOT_FOUND');
    }

    if (driver.status === 'ACTIVE') {
      return driver;
    }

    if (driver.status !== 'BLOCKED') {
      throw new Error(`CANNOT_REACTIVATE_FROM_STATUS_${driver.status}`);
    }

    try {
      const updated = await db
        .update(drivers)
        .set({
          status: 'ACTIVE',
          reactivation_requested: false,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, id))
        .returning();

      const updatedDriver = updated[0] as Driver;

      // Record DRIVER_REACTIVATED
      await db.insert(driverEvents).values({
        driver_id: id,
        event_type: 'DRIVER_REACTIVATED',
        actor_type: 'ADMIN',
      });

      // 12. Enviar mensagem Telegram
      const msg = '✅ Seu cadastro de entregador foi reativado.\n\nVocê já pode receber ofertas de entregas da Kantine.';
      await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);

      return updatedDriver;
    } catch (err: any) {
      console.error(`[DriverService.reactivateDriver failed for #${id}]`, err);
      throw new Error(`Failed to reactivate driver #${id}`, { cause: err });
    }
  }

  /**
   * Driver submits reactivation request from Telegram when BLOCKED
   */
  public async requestReactivation(id: number, reason: string): Promise<Driver> {
    const driver = await this.getDriverById(id);
    if (!driver) {
      throw new Error('DRIVER_NOT_FOUND');
    }

    if (driver.status !== 'BLOCKED') {
      throw new Error(`CANNOT_REQUEST_REACTIVATION_FOR_STATUS_${driver.status}`);
    }

    const trimmedReason = (reason || '').trim();
    if (trimmedReason.length < 3) {
      throw new Error('INVALID_REASON: Justificativa de reativação deve ter no mínimo 3 caracteres.');
    }

    try {
      const updated = await db
        .update(drivers)
        .set({
          reactivation_requested: true,
          reactivation_requested_at: new Date(),
          reactivation_reason: trimmedReason,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, id))
        .returning();

      const updatedDriver = updated[0] as Driver;

      // Record REACTIVATION_REQUESTED
      await db.insert(driverEvents).values({
        driver_id: id,
        event_type: 'REACTIVATION_REQUESTED',
        actor_type: 'DRIVER',
        actor_id: driver.telegram_user_id,
        details: trimmedReason,
      });

      return updatedDriver;
    } catch (err: any) {
      console.error(`[DriverService.requestReactivation failed for #${id}]`, err);
      throw new Error(`Failed to request reactivation for driver #${id}`, { cause: err });
    }
  }

  /**
   * Admin rejects reactivation request
   */
  public async rejectReactivation(id: number, rejectionReason: string, actorId?: string): Promise<Driver> {
    const driver = await this.getDriverById(id);
    if (!driver) {
      throw new Error('DRIVER_NOT_FOUND');
    }

    const trimmed = (rejectionReason || '').trim() || 'Solicitação de reativação não aprovada.';

    try {
      const updated = await db
        .update(drivers)
        .set({
          reactivation_requested: false,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, id))
        .returning();

      const updatedDriver = updated[0] as Driver;

      // Record REACTIVATION_REJECTED
      await db.insert(driverEvents).values({
        driver_id: id,
        event_type: 'REACTIVATION_REJECTED',
        actor_type: 'ADMIN',
        actor_id: actorId || null,
        details: trimmed,
      });

      // Send Telegram notification
      const msg =
        `❌ *Solicitação de Reativação Não Aprovada*\n\n` +
        `Sua solicitação de reativação foi analisada pela administração da Kantine.\n\n` +
        `• *Motivo informado:* ${escapeTelegramMarkdown(trimmed)}\n\n` +
        `Caso queira mais informações, entre em contato com o suporte da Kantine.`;
      await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);

      return updatedDriver;
    } catch (err: any) {
      console.error(`[DriverService.rejectReactivation failed for #${id}]`, err);
      throw new Error(`Failed to reject reactivation for driver #${id}`, { cause: err });
    }
  }

  /**
   * Admin excludes/archives driver with mandatory reason and historical memory
   */
  public async excludeDriver(id: number, reason: string, actorId?: string): Promise<Driver> {
    const driver = await this.getDriverById(id);
    if (!driver) {
      throw new Error('DRIVER_NOT_FOUND');
    }

    const trimmedReason = (reason || '').trim();
    if (trimmedReason.length < 3) {
      throw new Error('INVALID_REASON: Motivo de exclusão é obrigatório (mínimo 3 caracteres).');
    }

    const newExclusionCount = (driver.exclusion_count || 0) + 1;

    try {
      const updated = await db
        .update(drivers)
        .set({
          status: 'EXCLUDED',
          is_excluded: true,
          excluded_at: new Date(),
          exclusion_reason: trimmedReason,
          excluded_by: actorId || 'ADMIN',
          previous_exclusion_reason: trimmedReason,
          exclusion_count: newExclusionCount,
          reactivation_requested: false,
          reinclusion_requested: false,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, id))
        .returning();

      const updatedDriver = updated[0] as Driver;

      // Record DRIVER_EXCLUDED audit event
      await db.insert(driverEvents).values({
        driver_id: id,
        event_type: 'DRIVER_EXCLUDED',
        actor_type: 'ADMIN',
        actor_id: actorId || null,
        details: JSON.stringify({
          reason: trimmedReason,
          exclusion_number: newExclusionCount,
          previous_status: driver.status,
        }),
      });

      // Send Telegram notification
      const msg =
        `⚠️ *Cadastro Desativado — Kantine Entregas*\n\n` +
        `Seu cadastro de entregador foi desativado/excluído pela administração.\n\n` +
        `• *Motivo registrado:* ${escapeTelegramMarkdown(trimmedReason)}\n\n` +
        `O seu processo foi zerado. Para retornar à equipe Kantine Entregas, será necessário receber um novo convite e refazer o cadastro com dados atualizados (veículo, telefone e chave PIX) para nova aprovação.`;
      await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);

      return updatedDriver;
    } catch (err: any) {
      console.error(`[DriverService.excludeDriver failed for #${id}]`, err);
      throw new Error(`Failed to exclude driver #${id}`, { cause: err });
    }
  }

  /**
   * Excluded driver submits request for future reinclusion via Telegram
   */
  public async requestReinclusion(id: number, reason: string): Promise<Driver> {
    const driver = await this.getDriverById(id);
    if (!driver) {
      throw new Error('DRIVER_NOT_FOUND');
    }

    if (driver.status !== 'EXCLUDED' && !driver.is_excluded) {
      throw new Error(`CANNOT_REQUEST_REINCLUSION_FOR_STATUS_${driver.status}`);
    }

    const trimmedReason = (reason || '').trim();
    if (trimmedReason.length < 3) {
      throw new Error('INVALID_REASON: Justificativa de reinclusão deve ter no mínimo 3 caracteres.');
    }

    try {
      const updated = await db
        .update(drivers)
        .set({
          reinclusion_requested: true,
          reinclusion_requested_at: new Date(),
          reinclusion_reason: trimmedReason,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, id))
        .returning();

      const updatedDriver = updated[0] as Driver;

      // Record REINCLUSION_REQUESTED audit event
      await db.insert(driverEvents).values({
        driver_id: id,
        event_type: 'REINCLUSION_REQUESTED',
        actor_type: 'DRIVER',
        actor_id: driver.telegram_user_id,
        details: trimmedReason,
      });

      return updatedDriver;
    } catch (err: any) {
      console.error(`[DriverService.requestReinclusion failed for #${id}]`, err);
      throw new Error(`Failed to request reinclusion for driver #${id}`, { cause: err });
    }
  }

  /**
   * Admin approves reinclusion request: enforces that excluded drivers require a new invite and approval
   */
  public async approveReinclusion(
    id: number,
    options: { targetStatus?: DriverStatus; notes?: string },
    actorId?: string
  ): Promise<Driver> {
    const driver = await this.getDriverById(id);
    if (!driver) {
      throw new Error('DRIVER_NOT_FOUND');
    }

    if (driver.status === 'EXCLUDED' || driver.is_excluded) {
      throw new Error(
        'EXCLUDED_DRIVER_REQUIRES_NEW_INVITE: Motoristas excluídos têm o processo zerado e só podem ser reinseridos através de novo convite e aprovação (pois podem ter mudado de veículo, telefone ou chave PIX).'
      );
    }

    return driver;
  }

  /**
   * Admin rejects reinclusion request
   */
  public async rejectReinclusion(id: number, rejectionReason: string, actorId?: string): Promise<Driver> {
    const driver = await this.getDriverById(id);
    if (!driver) {
      throw new Error('DRIVER_NOT_FOUND');
    }

    const trimmed = (rejectionReason || '').trim() || 'Pedido de reinclusão não aprovado.';

    try {
      const updated = await db
        .update(drivers)
        .set({
          reinclusion_requested: false,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, id))
        .returning();

      const updatedDriver = updated[0] as Driver;

      // Record REINCLUSION_REJECTED
      await db.insert(driverEvents).values({
        driver_id: id,
        event_type: 'REINCLUSION_REJECTED',
        actor_type: 'ADMIN',
        actor_id: actorId || null,
        details: trimmed,
      });

      // Send Telegram notification
      const msg =
        `❌ *Pedido de Reinclusão Não Aprovado*\n\n` +
        `Seu pedido de reinclusão foi analisado pela administração da Kantine.\n\n` +
        `• *Motivo informado:* ${escapeTelegramMarkdown(trimmed)}\n\n` +
        `Seu cadastro permanece desativado.`;
      await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);

      return updatedDriver;
    } catch (err: any) {
      console.error(`[DriverService.rejectReinclusion failed for #${id}]`, err);
      throw new Error(`Failed to reject reinclusion for driver #${id}`, { cause: err });
    }
  }

  public async getDriverEvents(driverId: number) {
    try {
      return await db
        .select()
        .from(driverEvents)
        .where(eq(driverEvents.driver_id, driverId))
        .orderBy(desc(driverEvents.timestamp));
    } catch (err: any) {
      console.error(`[DriverService.getDriverEvents failed for #${driverId}]`, err);
      throw new Error(`Failed to get events for driver #${driverId}`, { cause: err });
    }
  }

  public checkEligibility(driver: Driver): boolean {
    return canReceiveDeliveryOffers(driver);
  }

  public async createDriverInvitation(data: {
    name?: string;
    phone?: string;
    vehicle_type?: string;
    created_by?: string;
  }): Promise<DriverInvitation> {
    try {
      const randomPart = Math.random().toString(36).substring(2, 8);
      const timePart = Date.now().toString(36);
      const token = `inv_${timePart}_${randomPart}`;

      const inserted = await db
        .insert(driverInvitations)
        .values({
          token,
          name: data.name?.trim() || null,
          phone: data.phone?.trim() || null,
          vehicle_type: data.vehicle_type || null,
          status: 'PENDING',
          created_by: data.created_by || 'ADMIN',
        })
        .returning();

      const inv = inserted[0] as DriverInvitation;

      if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
        try {
          await prodDb.insert(driverInvitations).values(inv).onConflictDoNothing().catch(() => {});
        } catch (e: any) {
          console.warn('[DriverService] Mirror invitation to prod warning:', e?.message);
        }
      }

      return inv;
    } catch (err: any) {
      console.error('[DriverService.createDriverInvitation failed]', err);
      throw new Error('Failed to create driver invitation', { cause: err });
    }
  }

  public async getDriverInvitations(): Promise<DriverInvitation[]> {
    try {
      const list = (await db
        .select()
        .from(driverInvitations)
        .orderBy(desc(driverInvitations.created_at))) as DriverInvitation[];

      if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
        try {
          const prodList = (await prodDb
            .select()
            .from(driverInvitations)
            .orderBy(desc(driverInvitations.created_at))) as DriverInvitation[];
          const existingTokens = new Set(list.map(i => i.token));
          for (const pi of prodList) {
            if (!existingTokens.has(pi.token)) {
              list.push(pi);
              await db.insert(driverInvitations).values(pi).onConflictDoNothing().catch(() => {});
            }
          }
        } catch {}
      }

      return list;
    } catch (err: any) {
      console.error('[DriverService.getDriverInvitations failed]', err);
      throw new Error('Failed to retrieve driver invitations', { cause: err });
    }
  }

  public async getInviteByToken(token: string): Promise<DriverInvitation | null> {
    try {
      const results = await db
        .select()
        .from(driverInvitations)
        .where(eq(driverInvitations.token, token));
      if (results[0]) return results[0] as DriverInvitation;

      if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
        const prodResults = await prodDb
          .select()
          .from(driverInvitations)
          .where(eq(driverInvitations.token, token));
        if (prodResults[0]) {
          try {
            await db.insert(driverInvitations).values(prodResults[0]).onConflictDoNothing().catch(() => {});
          } catch {}
          return prodResults[0] as DriverInvitation;
        }
      }
      return null;
    } catch (err: any) {
      console.error(`[DriverService.getInviteByToken failed for ${token}]`, err);
      return null;
    }
  }

  public async cancelDriverInvitation(id: number): Promise<boolean> {
    try {
      await db
        .update(driverInvitations)
        .set({ status: 'CANCELLED' })
        .where(eq(driverInvitations.id, id));
      if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
        await prodDb
          .update(driverInvitations)
          .set({ status: 'CANCELLED' })
          .where(eq(driverInvitations.id, id))
          .catch(() => {});
      }
      return true;
    } catch (err: any) {
      console.error(`[DriverService.cancelDriverInvitation failed for #${id}]`, err);
      return false;
    }
  }

  /**
   * Directly convert an invitation into a registered driver record with PENDING status.
   * Enables admin to instantly bring invited drivers (like Evelyn) into the pending approval queue.
   */
  public async convertInvitationToDriver(invitationId: number): Promise<Driver> {
    let invite = (await db
      .select()
      .from(driverInvitations)
      .where(eq(driverInvitations.id, invitationId))
      .then((r) => r[0])) as DriverInvitation | undefined;

    if (!invite && process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
      invite = (await prodDb
        .select()
        .from(driverInvitations)
        .where(eq(driverInvitations.id, invitationId))
        .then((r) => r[0])) as DriverInvitation | undefined;
    }

    if (!invite) {
      throw new Error('INVITATION_NOT_FOUND');
    }

    if (invite.driver_id) {
      const existing = await this.getDriverById(invite.driver_id);
      if (existing) return existing;
    }

    const placeholderId = `pending_${invite.token}`;
    const cleanPhone = normalizeGeneralPhone(invite.phone || '34999999999');
    const validVehicle: VehicleType =
      (invite.vehicle_type as VehicleType) || 'CAR';

    // Check if a driver with this placeholder already exists
    const existingPlaceholder = await this.getDriverByTelegramUserId(placeholderId);
    if (existingPlaceholder) return existingPlaceholder;

    const inserted = await db
      .insert(drivers)
      .values({
        telegram_user_id: placeholderId,
        telegram_chat_id: placeholderId,
        name: invite.name?.trim() || 'Motorista Convidado',
        phone: cleanPhone,
        vehicle_type: validVehicle,
        pix_key: cleanPhone,
        pix_key_type: 'PHONE',
        pix_key_value: cleanPhone,
        status: 'PENDING',
      })
      .returning();

    const newDriver = inserted[0] as Driver;

    await db
      .update(driverInvitations)
      .set({
        status: 'COMPLETED',
        driver_id: newDriver.id,
        completed_at: new Date(),
      })
      .where(eq(driverInvitations.id, invitationId));

    await db.insert(driverEvents).values({
      driver_id: newDriver.id,
      event_type: 'DRIVER_REGISTERED',
      actor_type: 'ADMIN',
      actor_id: invite.created_by || 'ADMIN',
    });

    if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
      try {
        await prodDb.insert(drivers).values(newDriver).onConflictDoNothing().catch(() => {});
        await prodDb
          .update(driverInvitations)
          .set({
            status: 'COMPLETED',
            driver_id: newDriver.id,
            completed_at: new Date(),
          })
          .where(eq(driverInvitations.id, invitationId))
          .catch(() => {});
        await prodDb.insert(driverEvents).values({
          driver_id: newDriver.id,
          event_type: 'DRIVER_REGISTERED',
          actor_type: 'ADMIN',
          actor_id: invite.created_by || 'ADMIN',
        }).catch(() => {});
      } catch (err: any) {
        console.warn('[convertInvitationToDriver] Prod mirror warning:', err?.message);
      }
    }

    return newDriver;
  }

  /**
   * Binds a pre-created or token-based pending driver to a real Telegram user ID & chat ID.
   */
  public async bindPendingDriverToTelegram(
    token: string,
    telegramUserId: string,
    chatId: string
  ): Promise<Driver | null> {
    try {
      const placeholderId = `pending_${token}`;
      let driver = await this.getDriverByTelegramUserId(placeholderId);
      if (!driver) {
        // Also check by token in invitations
        const inv = await this.getInviteByToken(token);
        if (inv && inv.driver_id) {
          driver = await this.getDriverById(inv.driver_id);
        }
      }

      if (driver) {
        const updated = await db
          .update(drivers)
          .set({
            telegram_user_id: telegramUserId,
            telegram_chat_id: chatId,
            updated_at: new Date(),
          })
          .where(eq(drivers.id, driver.id))
          .returning();

        const linked = (updated[0] as Driver) || driver;

        await db
          .update(driverInvitations)
          .set({
            telegram_user_id: telegramUserId,
            status: 'COMPLETED',
            completed_at: new Date(),
          })
          .where(eq(driverInvitations.token, token));

        if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
          try {
            await prodDb
              .update(drivers)
              .set({
                telegram_user_id: telegramUserId,
                telegram_chat_id: chatId,
                updated_at: new Date(),
              })
              .where(eq(drivers.id, driver.id))
              .catch(() => {});
            await prodDb
              .update(driverInvitations)
              .set({
                telegram_user_id: telegramUserId,
                status: 'COMPLETED',
                completed_at: new Date(),
              })
              .where(eq(driverInvitations.token, token))
              .catch(() => {});
          } catch {}
        }

        return linked;
      }
      return null;
    } catch (err: any) {
      console.warn('[DriverService.bindPendingDriverToTelegram] Error:', err?.message);
      return null;
    }
  }

  /**
   * M4.1 PARTE A: Relatório de Auditoria de Veículos dos Motoristas de Indicação (Seção 7)
   */
  public async getReferralVehicleAudit(): Promise<{
    driver_id: number;
    driver_name: string;
    driver_phone: string;
    vehicle_type: VehicleType;
    driver_status: string;
    driver_created_at: Date;
    referral_id: number;
    referred_name: string;
    referred_phone: string;
    referred_by_driver_id: number;
    indicator_name: string | null;
    indicator_vehicle_type: string | null;
    is_potentially_affected: boolean;
    audit_note: string;
  }[]> {
    const referralsWithDrivers = await db
      .select({
        referral_id: driverReferrals.id,
        referred_name: driverReferrals.referred_name,
        referred_phone: driverReferrals.referred_phone,
        referred_by_driver_id: driverReferrals.referred_by_driver_id,
        resulting_driver_id: driverReferrals.resulting_driver_id,
        referral_created_at: driverReferrals.created_at,
      })
      .from(driverReferrals)
      .where(sql`${driverReferrals.resulting_driver_id} IS NOT NULL`);

    if (referralsWithDrivers.length === 0) return [];

    const driverIds = Array.from(
      new Set(
        referralsWithDrivers
          .map((r) => r.resulting_driver_id!)
          .concat(referralsWithDrivers.map((r) => r.referred_by_driver_id))
      )
    );

    const driverRows = await db
      .select()
      .from(drivers)
      .where(sql`${drivers.id} IN (${sql.join(driverIds.map((id) => sql`${id}`), sql`, `)})`);

    const driverMap = new Map<number, Driver>();
    for (const d of driverRows) {
      driverMap.set(d.id, d as Driver);
    }

    return referralsWithDrivers.map((ref) => {
      const driver = driverMap.get(ref.resulting_driver_id!)!;
      const indicator = driverMap.get(ref.referred_by_driver_id);
      const isPotentiallyAffected = driver?.vehicle_type === 'CAR_SEDAN';

      return {
        driver_id: driver?.id || ref.resulting_driver_id!,
        driver_name: driver?.name || ref.referred_name,
        driver_phone: driver?.phone || ref.referred_phone,
        vehicle_type: (driver?.vehicle_type || 'CAR_SEDAN') as VehicleType,
        driver_status: driver?.status || 'PENDING',
        driver_created_at: driver?.created_at || new Date(),
        referral_id: ref.referral_id,
        referred_name: ref.referred_name,
        referred_phone: ref.referred_phone,
        referred_by_driver_id: ref.referred_by_driver_id,
        indicator_name: indicator?.name || null,
        indicator_vehicle_type: indicator?.vehicle_type || null,
        is_potentially_affected: isPotentiallyAffected,
        audit_note: isPotentiallyAffected
          ? 'Origem: indicação. Veículo atribuído como CAR_SEDAN. Recomendada conferência administrativa com o motorista.'
          : 'Veículo compatível ou com escolha explícita.',
      };
    });
  }

  /**
   * Resets all driver registrations, invitations, referrals, routes, and operational history
   * across both primary database and mirrored production database.
   * Also clears all Telegram bot cached sessions.
   */
  public async resetAllDriversAndHistory(): Promise<void> {
    const tables = [
      'driver_referral_events',
      'driver_referrals',
      'driver_events',
      'route_offer_dispatches',
      'delivery_offer_dispatches',
      'route_updates',
      'route_stops',
      'route_events',
      'routes',
      'delivery_events',
      'deliveries',
      'driver_invitations',
      'drivers',
    ];

    for (const t of tables) {
      await db.execute(sql.raw(`DELETE FROM "${t}"`));
    }

    const sequences = [
      'drivers_id_seq',
      'driver_invitations_id_seq',
      'driver_events_id_seq',
      'driver_referrals_id_seq',
      'driver_referral_events_id_seq',
      'routes_id_seq',
      'route_stops_id_seq',
      'route_events_id_seq',
      'deliveries_id_seq',
      'delivery_events_id_seq',
    ];

    for (const seq of sequences) {
      try {
        await db.execute(sql.raw(`SELECT setval('${seq}', 1, false)`));
      } catch {}
    }

    if (process.env.SQL_DB_NAME !== 'cloud_sql_production_database') {
      try {
        for (const t of tables) {
          await prodDb.execute(sql.raw(`DELETE FROM "${t}"`));
        }
        for (const seq of sequences) {
          try {
            await prodDb.execute(sql.raw(`SELECT setval('${seq}', 1, false)`));
          } catch {}
        }
      } catch (err: any) {
        console.warn('[DriverService.resetAllDriversAndHistory] Prod DB reset error:', err.message);
      }
    }

    try {
      telegramBot.clearAllSessions();
    } catch (e: any) {
      console.warn('[DriverService.resetAllDriversAndHistory] Clear sessions error:', e.message);
    }
  }
}

export const driverService = new DriverService();
try {
  telegramBot?.setDriverService(driverService);
} catch {
  // Set during bootstrapping in server.ts or test suites
}
