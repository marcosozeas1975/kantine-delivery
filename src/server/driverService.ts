import { db } from '../db/index.ts';
import { drivers, driverEvents } from '../db/schema.ts';
import { eq, desc } from 'drizzle-orm';
import { Driver, DriverStatus, VehicleType, DriverEventType } from './types.ts';
import { canReceiveDeliveryOffers } from './eligibility.ts';
import { telegramBot } from './telegramBot.ts';

export class DriverService {
  public async getDrivers(statusFilter?: DriverStatus): Promise<Driver[]> {
    try {
      if (statusFilter) {
        return (await db
          .select()
          .from(drivers)
          .where(eq(drivers.status, statusFilter))
          .orderBy(desc(drivers.created_at))) as Driver[];
      }
      return (await db
        .select()
        .from(drivers)
        .orderBy(desc(drivers.created_at))) as Driver[];
    } catch (err: any) {
      console.error('[DriverService.getDrivers failed]', err);
      throw new Error('Failed to retrieve drivers', { cause: err });
    }
  }

  public async getDriverById(id: number): Promise<Driver | null> {
    try {
      const results = await db.select().from(drivers).where(eq(drivers.id, id));
      return (results[0] as Driver) || null;
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
      return (results[0] as Driver) || null;
    } catch (err: any) {
      console.error(`[DriverService.getDriverByTelegramUserId failed]`, err);
      throw new Error('Failed to find driver by Telegram User ID', { cause: err });
    }
  }

  public async registerDriver(data: {
    telegram_user_id: string;
    telegram_chat_id: string;
    name: string;
    phone: string;
    vehicle_type: string;
    pix_key: string;
  }): Promise<Driver> {
    // Validate vehicle type
    const validVehicles: VehicleType[] = [
      'CAR_HATCH',
      'CAR_SEDAN',
      'CAR_SW',
      'MOTO_WITH_BAG',
      'MOTO_WITHOUT_BAG',
      'OTHER',
    ];
    if (!validVehicles.includes(data.vehicle_type as VehicleType)) {
      throw new Error(`INVALID_VEHICLE_TYPE: ${data.vehicle_type}`);
    }

    if (!data.name || !data.phone || !data.pix_key || !data.telegram_user_id) {
      throw new Error('MISSING_REQUIRED_FIELDS');
    }

    // Check idempotency before insert
    const existing = await this.getDriverByTelegramUserId(data.telegram_user_id);
    if (existing) {
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
          vehicle_type: data.vehicle_type,
          pix_key: data.pix_key.trim(),
          status: 'PENDING',
        })
        .returning();

      const newDriver = inserted[0] as Driver;

      // Record audit event DRIVER_REGISTERED
      await db.insert(driverEvents).values({
        driver_id: newDriver.id,
        event_type: 'DRIVER_REGISTERED',
      });

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

      // Record DRIVER_APPROVED
      await db.insert(driverEvents).values({
        driver_id: id,
        event_type: 'DRIVER_APPROVED',
      });

      // 10. Enviar mensagem Telegram
      const msg =
        '✅ Cadastro aprovado.\n\n' +
        'Você agora está habilitado para receber ofertas de entrega da Kantine.';

      await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);

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
          updated_at: new Date(),
        })
        .where(eq(drivers.id, id))
        .returning();

      const updatedDriver = updated[0] as Driver;

      // Record DRIVER_REACTIVATED
      await db.insert(driverEvents).values({
        driver_id: id,
        event_type: 'DRIVER_REACTIVATED',
      });

      // 12. Enviar mensagem Telegram
      const msg = '✅ Seu cadastro de entregador foi reativado.';
      await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);

      return updatedDriver;
    } catch (err: any) {
      console.error(`[DriverService.reactivateDriver failed for #${id}]`, err);
      throw new Error(`Failed to reactivate driver #${id}`, { cause: err });
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
}

export const driverService = new DriverService();
telegramBot.setDriverService(driverService);
