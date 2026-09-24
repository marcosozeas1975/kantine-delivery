/**
 * Delivery Service - Kantine Delivery M2
 * Handles delivery creation (DRAFT), publication (OFFERED) and distribution to ACTIVE drivers.
 * Strictly preserves M1 baseline and eligibility rule: canReceiveDeliveryOffers(driver).
 */

import { db } from '../db/index.ts';
import { deliveries, deliveryOfferDispatches, deliveryEvents, drivers } from '../db/schema.ts';
import { eq, desc } from 'drizzle-orm';
import {
  Delivery,
  DeliveryStatus,
  DeliveryOfferDispatch,
  DeliveryEvent,
  CreateDeliveryDTO,
} from './types.ts';
import { canReceiveDeliveryOffers } from './eligibility.ts';
import { telegramBot } from './telegramBot.ts';
import { driverService } from './driverService.ts';

export class DeliveryService {
  /**
   * Create a delivery as DRAFT
   * Never sends any Telegram message
   */
  public async createDraft(data: CreateDeliveryDTO, actor?: string): Promise<Delivery> {
    if (!data.destination_address || !data.destination_neighborhood || !data.cargo_description || !data.delivery_fee) {
      throw new Error('MISSING_REQUIRED_FIELDS');
    }

    const pickupLocation = data.pickup_location?.trim() || 'Kantine Matriz';
    const deliveryMode = data.delivery_mode === 'NO_CONTACT' ? 'NO_CONTACT' : 'IN_PERSON';

    const [newDelivery] = await db
      .insert(deliveries)
      .values({
        pickup_location: pickupLocation,
        destination_address: data.destination_address.trim(),
        destination_neighborhood: data.destination_neighborhood.trim(),
        cargo_description: data.cargo_description.trim(),
        delivery_fee: data.delivery_fee.trim(),
        delivery_mode: deliveryMode,
        observations: data.observations?.trim() || null,
        status: 'DRAFT',
      })
      .returning();

    // Log audit event
    await db.insert(deliveryEvents).values({
      delivery_id: newDelivery.id,
      event_type: 'DELIVERY_CREATED',
      actor: actor || 'ADMIN',
    });

    return newDelivery as Delivery;
  }

  public async getDeliveryById(id: number): Promise<Delivery | null> {
    const rows = await db.select().from(deliveries).where(eq(deliveries.id, id));
    if (rows.length === 0) return null;
    return rows[0] as Delivery;
  }

  public async getDeliveries(status?: DeliveryStatus): Promise<Delivery[]> {
    let query = db.select().from(deliveries);
    if (status) {
      query = query.where(eq(deliveries.status, status)) as any;
    }
    const rows = await query.orderBy(desc(deliveries.id));
    return rows as Delivery[];
  }

  public async getDeliveryDetails(id: number): Promise<{
    delivery: Delivery;
    dispatches: DeliveryOfferDispatch[];
    events: DeliveryEvent[];
    stats: { sent: number; failed: number };
  }> {
    const delivery = await this.getDeliveryById(id);
    if (!delivery) throw new Error('DELIVERY_NOT_FOUND');

    const dispatchesRows = await db
      .select()
      .from(deliveryOfferDispatches)
      .where(eq(deliveryOfferDispatches.delivery_id, id));

    const eventsRows = await db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.delivery_id, id))
      .orderBy(desc(deliveryEvents.timestamp));

    const sent = dispatchesRows.filter((d) => d.status === 'SENT').length;
    const failed = dispatchesRows.filter((d) => d.status === 'FAILED').length;

    return {
      delivery,
      dispatches: dispatchesRows as DeliveryOfferDispatch[],
      events: eventsRows as DeliveryEvent[],
      stats: { sent, failed },
    };
  }

  /**
   * Publish Delivery: DRAFT -> OFFERED
   * Distributes offer individually to all eligible ACTIVE drivers
   */
  public async publishDelivery(
    id: number,
    actor?: string
  ): Promise<{
    delivery: Delivery;
    dispatches: DeliveryOfferDispatch[];
    stats: { sent: number; failed: number };
  }> {
    const delivery = await this.getDeliveryById(id);
    if (!delivery) throw new Error('DELIVERY_NOT_FOUND');

    // Idempotency: only DRAFT can be published
    if (delivery.status === 'OFFERED') {
      throw new Error('DELIVERY_ALREADY_OFFERED');
    }
    if (delivery.status === 'CANCELLED') {
      throw new Error('CANNOT_PUBLISH_CANCELLED_DELIVERY');
    }

    // Consult eligible drivers using existing M1 rule: canReceiveDeliveryOffers(driver)
    const allDrivers = await driverService.getDrivers();
    const eligibleDrivers = allDrivers.filter((driver) => canReceiveDeliveryOffers(driver));

    // Zero eligible active drivers check: DO NOT publish silently. Keep DRAFT!
    if (eligibleDrivers.length === 0) {
      throw new Error('NO_ACTIVE_DRIVERS_AVAILABLE');
    }

    // Transition delivery to OFFERED and record offered_at
    const [updatedDelivery] = await db
      .update(deliveries)
      .set({
        status: 'OFFERED',
        offered_at: new Date(),
      })
      .where(eq(deliveries.id, id))
      .returning();

    // Log audit event
    await db.insert(deliveryEvents).values({
      delivery_id: id,
      event_type: 'DELIVERY_OFFERED',
      actor: actor || 'ADMIN',
    });

    const recordedDispatches: DeliveryOfferDispatch[] = [];
    let sentCount = 0;
    let failedCount = 0;

    // Distribute to each active driver individually
    for (const driver of eligibleDrivers) {
      try {
        const sendResult = await telegramBot.sendDeliveryOffer(
          driver.telegram_chat_id,
          updatedDelivery
        );

        const dispatchStatus = sendResult.success ? 'SENT' : 'FAILED';
        if (dispatchStatus === 'SENT') {
          sentCount++;
        } else {
          failedCount++;
        }

        const [disp] = await db
          .insert(deliveryOfferDispatches)
          .values({
            delivery_id: id,
            driver_id: driver.id,
            telegram_chat_id: driver.telegram_chat_id,
            status: dispatchStatus,
            error_code: sendResult.errorCode || null,
          })
          .returning();

        recordedDispatches.push(disp as DeliveryOfferDispatch);
      } catch (err: any) {
        failedCount++;
        // Idempotency safety or database record on error
        try {
          const [disp] = await db
            .insert(deliveryOfferDispatches)
            .values({
              delivery_id: id,
              driver_id: driver.id,
              telegram_chat_id: driver.telegram_chat_id,
              status: 'FAILED',
              error_code: err.message || 'DISPATCH_EXCEPTION',
            })
            .returning();
          recordedDispatches.push(disp as DeliveryOfferDispatch);
        } catch (dbErr) {
          // Unique constraint might catch duplicate
        }
      }
    }

    return {
      delivery: updatedDelivery as Delivery,
      dispatches: recordedDispatches,
      stats: { sent: sentCount, failed: failedCount },
    };
  }

  /**
   * Cancel Delivery: DRAFT -> CANCELLED or OFFERED -> CANCELLED
   * If OFFERED was cancelled, notifies drivers who received SENT offer
   */
  public async cancelDelivery(id: number, actor?: string): Promise<Delivery> {
    const delivery = await this.getDeliveryById(id);
    if (!delivery) throw new Error('DELIVERY_NOT_FOUND');

    if (delivery.status === 'CANCELLED') {
      throw new Error('DELIVERY_ALREADY_CANCELLED');
    }

    const previousStatus = delivery.status;

    const [updatedDelivery] = await db
      .update(deliveries)
      .set({ status: 'CANCELLED' })
      .where(eq(deliveries.id, id))
      .returning();

    // Log audit event
    await db.insert(deliveryEvents).values({
      delivery_id: id,
      event_type: 'DELIVERY_CANCELLED',
      actor: actor || 'ADMIN',
    });

    // If it was OFFERED, notify all drivers who received SENT dispatch
    if (previousStatus === 'OFFERED') {
      const dispatches = await db
        .select()
        .from(deliveryOfferDispatches)
        .where(eq(deliveryOfferDispatches.delivery_id, id));

      for (const disp of dispatches) {
        if (disp.status === 'SENT') {
          await telegramBot.sendDeliveryCancellation(disp.telegram_chat_id, id).catch((e) => {
            console.error(`[DeliveryService] Cancellation notify failed for chat ${disp.telegram_chat_id}:`, e.message);
          });
        }
      }
    }

    return updatedDelivery as Delivery;
  }
}

export const deliveryService = new DeliveryService();
