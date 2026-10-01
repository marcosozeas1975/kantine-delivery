import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { driverService } from './src/server/driverService.ts';
import { deliveryService } from './src/server/deliveryService.ts';
import { routeService } from './src/server/routeService.ts';
import { routeEditService } from './src/server/routeEditService.ts';
import { referralService } from './src/server/referralService.ts';
import { deliveryConfigService } from './src/server/deliveryConfigService.ts';
import { telegramBot } from './src/server/telegramBot.ts';
import { requireAdminAuth, AuthRequest } from './src/middleware/auth.ts';
import { canReceiveDeliveryOffers, canReceiveRouteOffer } from './src/server/eligibility.ts';
import { DriverStatus, DeliveryStatus, RouteStatus, PricingVehicleCategory } from './src/server/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Wire services to Telegram Bot
telegramBot.setDriverService(driverService);
telegramBot.setDeliveryService(deliveryService);
telegramBot.setRouteService(routeService);
telegramBot.setReferralService(referralService);

// Security: Prevent Telegram token from ever appearing in any response or header
app.use((_req, res, next) => {
  res.removeHeader('X-Powered-By');
  next();
});

// Admin API Routes

// 1. List drivers (filtered by status: PENDING, ACTIVE, BLOCKED, EXCLUDED)
app.get('/api/admin/drivers', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as DriverStatus | undefined;
    if (status && !['PENDING', 'ACTIVE', 'BLOCKED', 'EXCLUDED'].includes(status)) {
      return res.status(400).json({ error: 'INVALID_STATUS_FILTER' });
    }
    const driversList = await driverService.getDrivers(status);
    res.json(driversList);
  } catch (err: any) {
    console.error('[API GET /api/admin/drivers failed]', err.message);
    res.status(500).json({ error: 'Failed to retrieve drivers' });
  }
});

// 2. Get driver details + audit events
app.get('/api/admin/drivers/:id', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const driver = await driverService.getDriverById(id);
    if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });

    const events = await driverService.getDriverEvents(id);
    const eligible = canReceiveDeliveryOffers(driver);

    res.json({
      driver,
      events,
      canReceiveDeliveryOffers: eligible,
    });
  } catch (err: any) {
    console.error(`[API GET /api/admin/drivers/${req.params.id} failed]`, err.message);
    res.status(500).json({ error: 'Failed to fetch driver details' });
  }
});

// 3. Approve driver (PENDING -> ACTIVE)
app.post('/api/admin/drivers/:id/approve', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const driver = await driverService.approveDriver(id);
    res.json({
      success: true,
      driver,
      canReceiveDeliveryOffers: canReceiveDeliveryOffers(driver),
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/approve failed]`, err.message);
    if (err.message === 'DRIVER_NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.message.startsWith('CANNOT_APPROVE_FROM_STATUS')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to approve driver' });
  }
});

// 4. Block driver (PENDING -> BLOCKED, ACTIVE -> BLOCKED)
app.post('/api/admin/drivers/:id/block', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const driver = await driverService.blockDriver(id);
    res.json({
      success: true,
      driver,
      canReceiveDeliveryOffers: canReceiveDeliveryOffers(driver),
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/block failed]`, err.message);
    if (err.message === 'DRIVER_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Failed to block driver' });
  }
});

// 5. Reactivate driver (BLOCKED -> ACTIVE)
app.post('/api/admin/drivers/:id/reactivate', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const driver = await driverService.reactivateDriver(id);
    res.json({
      success: true,
      driver,
      canReceiveDeliveryOffers: canReceiveDeliveryOffers(driver),
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/reactivate failed]`, err.message);
    if (err.message === 'DRIVER_NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.message.startsWith('CANNOT_REACTIVATE_FROM_STATUS')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to reactivate driver' });
  }
});

// 5b. Reject reactivation request for BLOCKED driver
app.post('/api/admin/drivers/:id/reject-reactivation', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const { reason } = req.body;
    const actor = req.user?.email || 'ADMIN';
    const driver = await driverService.rejectReactivation(id, reason || '', actor);
    res.json({ success: true, driver });
  } catch (err: any) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/reject-reactivation failed]`, err.message);
    if (err.message === 'DRIVER_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message || 'Failed to reject reactivation' });
  }
});

// 5c. Exclude driver (Deactivate and archive with reason and historical memory)
app.post('/api/admin/drivers/:id/exclude', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const { reason } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({ error: 'Motivo da exclusão é obrigatório (mínimo 3 caracteres).' });
    }

    const actor = req.user?.email || 'ADMIN';
    const driver = await driverService.excludeDriver(id, reason.trim(), actor);
    res.json({ success: true, driver });
  } catch (err: any) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/exclude failed]`, err.message);
    if (err.message === 'DRIVER_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message || 'Failed to exclude driver' });
  }
});

// 5d. Approve reinclusion request for EXCLUDED driver
app.post('/api/admin/drivers/:id/reinclusion/approve', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const { targetStatus, notes } = req.body;
    const actor = req.user?.email || 'ADMIN';
    const driver = await driverService.approveReinclusion(id, { targetStatus, notes }, actor);
    res.json({ success: true, driver });
  } catch (err: any) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/reinclusion/approve failed]`, err.message);
    if (err.message === 'DRIVER_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message || 'Failed to approve reinclusion' });
  }
});

// 5e. Reject reinclusion request for EXCLUDED driver
app.post('/api/admin/drivers/:id/reinclusion/reject', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const { reason } = req.body;
    const actor = req.user?.email || 'ADMIN';
    const driver = await driverService.rejectReinclusion(id, reason || '', actor);
    res.json({ success: true, driver });
  } catch (err: any) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/reinclusion/reject failed]`, err.message);
    if (err.message === 'DRIVER_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message || 'Failed to reject reinclusion' });
  }
});

// 6. Test eligibility check endpoint
app.get('/api/admin/drivers/:id/eligibility', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const driver = await driverService.getDriverById(id);
    if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });

    res.json({
      driver_id: driver.id,
      status: driver.status,
      canReceiveDeliveryOffers: canReceiveDeliveryOffers(driver),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// M1.1: Update driver profile (name, phone, vehicle_type, pix)
app.patch('/api/admin/drivers/:id', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const actorId = req.user?.email || req.user?.uid || 'ADMIN';
    const updated = await driverService.updateDriverProfile(id, req.body, {
      actor_type: 'ADMIN',
      actor_id: actorId,
    });

    res.json({ success: true, driver: updated });
  } catch (err: any) {
    console.error(`[API PATCH /api/admin/drivers/${req.params.id} failed]`, err.message);
    if (err.message === 'DRIVER_NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    // Return validation / logic error as HTTP 400
    res.status(400).json({ error: err.message || 'Falha ao atualizar dados do motorista.' });
  }
});

// M1.1: Get driver audit events
app.get('/api/admin/drivers/:id/events', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const events = await driverService.getDriverEvents(id);
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch driver events' });
  }
});

// 7. Telegram Bot status (never reveals token)
app.get('/api/admin/telegram/status', requireAdminAuth, (_req: AuthRequest, res) => {
  const status = telegramBot.getStatus();
  res.json({
    configured: status.configured,
    polling: status.polling,
    botUsername: status.botUsername,
    activeSessions: status.activeSessions,
  });
});

// Driver Invitations API (Convites de Motoristas)
app.get('/api/admin/driver-invitations', requireAdminAuth, async (_req: AuthRequest, res) => {
  try {
    const invites = await driverService.getDriverInvitations();
    const status = telegramBot.getStatus();
    const botUsername = status.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'KantineDeliveryBot';
    res.json({
      invitations: invites,
      botUsername: status.botUsername,
      defaultInviteLink: `https://t.me/${botUsername}?start=cadastro`,
    });
  } catch (err: any) {
    console.error('[API GET /api/admin/driver-invitations failed]', err.message);
    res.status(500).json({ error: 'Failed to retrieve driver invitations' });
  }
});

app.post('/api/admin/driver-invitations', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { name, phone, vehicle_type } = req.body;
    const actorId = req.user?.email || req.user?.uid || 'ADMIN';
    const invitation = await driverService.createDriverInvitation({
      name,
      phone,
      vehicle_type,
      created_by: actorId,
    });
    const status = telegramBot.getStatus();
    const botUsername = status.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'KantineDeliveryBot';
    const inviteLink = `https://t.me/${botUsername}?start=${invitation.token}`;
    res.json({
      success: true,
      invitation,
      inviteLink,
      botUsername: status.botUsername,
    });
  } catch (err: any) {
    console.error('[API POST /api/admin/driver-invitations failed]', err.message);
    res.status(500).json({ error: 'Failed to create driver invitation' });
  }
});

app.post('/api/admin/driver-invitations/:id/cancel', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_INVITATION_ID' });
    const success = await driverService.cancelDriverInvitation(id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to cancel driver invitation' });
  }
});

// ==========================================
// M1.2 — Controlled Referrals (Indicação Controlada de Motoristas)
// ==========================================

// 1. List referrals with optional status and search filters
app.get('/api/admin/referrals', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as any;
    const search = req.query.search as string | undefined;
    const referrals = await referralService.getReferrals({ status, search });
    res.json(referrals);
  } catch (err: any) {
    console.error('[API GET /api/admin/referrals failed]', err.message);
    res.status(500).json({ error: 'Failed to retrieve referrals' });
  }
});

// 2. Approve referral (PENDING_REVIEW -> APPROVED, generates 7-day token, notifies indicator driver)
app.post('/api/admin/referrals/:id/approve', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_REFERRAL_ID' });

    const adminActor = req.user?.email || req.user?.uid || 'ADMIN';
    const result = await referralService.approveReferral(id, adminActor);
    res.json({
      success: true,
      referral: result.referral,
      inviteLink: result.inviteLink,
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/referrals/${req.params.id}/approve failed]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// 3. Reject referral (PENDING_REVIEW -> REJECTED)
app.post('/api/admin/referrals/:id/reject', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_REFERRAL_ID' });

    const { reason } = req.body || {};
    const adminActor = req.user?.email || req.user?.uid || 'ADMIN';
    const referral = await referralService.rejectReferral(id, adminActor, reason);
    res.json({
      success: true,
      referral,
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/referrals/${req.params.id}/reject failed]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// 4. Get audit events for a referral
app.get('/api/admin/referrals/:id/events', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_REFERRAL_ID' });

    const events = await referralService.getReferralEvents(id);
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch referral events' });
  }
});

// 8. Configure Telegram Bot Token securely at runtime (operator secret setup)
app.post('/api/admin/telegram/configure', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string' || !token.includes(':')) {
      return res.status(400).json({ error: 'INVALID_TOKEN_FORMAT' });
    }

    telegramBot.stop();
    telegramBot.updateTokenFromEnv(token);
    await telegramBot.start();

    const status = telegramBot.getStatus();
    res.json({
      success: true,
      configured: status.configured,
      polling: status.polling,
      botUsername: status.botUsername,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to configure Telegram bot' });
  }
});

// 9. Manual Telegram simulation endpoint for testing / automation
app.post('/api/admin/telegram/simulate-update', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { update } = req.body;
    if (!update) return res.status(400).json({ error: 'MISSING_UPDATE' });
    await telegramBot.handleUpdate(update);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Telegram audit/test inspection endpoints
app.get('/api/admin/telegram/recent-messages', requireAdminAuth, (_req: AuthRequest, res) => {
  res.json(telegramBot.getRecentDispatches());
});

app.post('/api/admin/telegram/clear-recent-messages', requireAdminAuth, (_req: AuthRequest, res) => {
  telegramBot.clearRecentDispatches();
  res.json({ success: true });
});

// ==========================================
// M2 — Delivery Management API Endpoints
// ==========================================

// 10. List Deliveries (filtered by status: DRAFT, OFFERED, ACCEPTED, CANCELLED)
app.get('/api/admin/deliveries', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as DeliveryStatus | undefined;
    if (status && !['DRAFT', 'OFFERED', 'ACCEPTED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'INVALID_STATUS_FILTER' });
    }
    const deliveriesList = await deliveryService.getDeliveries(status);
    res.json(deliveriesList);
  } catch (err: any) {
    console.error('[API GET /api/admin/deliveries failed]', err.message);
    res.status(500).json({ error: 'Failed to retrieve deliveries' });
  }
});

// 11. Create Delivery Draft (DRAFT status, no Telegram message sent)
app.post('/api/admin/deliveries', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const {
      pickup_location,
      destination_address,
      destination_neighborhood,
      cargo_description,
      delivery_fee,
      delivery_mode,
      observations,
    } = req.body;

    const delivery = await deliveryService.createDraft(
      {
        pickup_location,
        destination_address,
        destination_neighborhood,
        cargo_description,
        delivery_fee,
        delivery_mode,
        observations,
      },
      req.user?.email || 'ADMIN'
    );

    res.status(201).json({ success: true, delivery });
  } catch (err: any) {
    console.error('[API POST /api/admin/deliveries failed]', err.message);
    if (err.message === 'MISSING_REQUIRED_FIELDS') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create delivery draft' });
  }
});

// 12. Get Delivery details, dispatches, and audit events
app.get('/api/admin/deliveries/:id', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DELIVERY_ID' });

    const details = await deliveryService.getDeliveryDetails(id);
    res.json(details);
  } catch (err: any) {
    console.error(`[API GET /api/admin/deliveries/${req.params.id} failed]`, err.message);
    if (err.message === 'DELIVERY_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Failed to fetch delivery details' });
  }
});

// 13. Publish Delivery (DRAFT -> OFFERED, distributes offer to all ACTIVE drivers)
app.post('/api/admin/deliveries/:id/publish', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DELIVERY_ID' });

    const result = await deliveryService.publishDelivery(id, req.user?.email || 'ADMIN');
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[API POST /api/admin/deliveries/${req.params.id}/publish failed]`, err.message);
    if (err.message === 'DELIVERY_NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.message === 'NO_ACTIVE_DRIVERS_AVAILABLE') {
      return res.status(400).json({
        error: 'NO_ACTIVE_DRIVERS_AVAILABLE',
        code: 'NO_ELIGIBLE_DRIVERS',
        message: 'Nenhum motorista ativo disponível para receber esta entrega. A entrega permanece como rascunho.',
      });
    }
    if (err.message === 'DELIVERY_ALREADY_OFFERED' || err.message === 'CANNOT_PUBLISH_CANCELLED_DELIVERY') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to publish delivery' });
  }
});

// 14. Cancel Delivery (DRAFT -> CANCELLED or OFFERED -> CANCELLED)
app.post('/api/admin/deliveries/:id/cancel', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DELIVERY_ID' });

    const delivery = await deliveryService.cancelDelivery(id, req.user?.email || 'ADMIN');
    res.json({ success: true, delivery });
  } catch (err: any) {
    console.error(`[API POST /api/admin/deliveries/${req.params.id}/cancel failed]`, err.message);
    if (err.message === 'DELIVERY_NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.message === 'DELIVERY_ALREADY_CANCELLED') return res.status(400).json({ error: err.message });
    if (err.message === 'CANNOT_CANCEL_ACCEPTED_DELIVERY') {
      return res.status(400).json({
        error: 'CANNOT_CANCEL_ACCEPTED_DELIVERY',
        message: 'Entregas já aceitas não podem ser canceladas neste marco.',
      });
    }
    res.status(500).json({ error: 'Failed to cancel delivery' });
  }
});

// 15. Accept Delivery (Atomic and exclusive acceptance in M3)
app.post('/api/admin/deliveries/:id/accept', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DELIVERY_ID' });

    const { driver_id, telegram_user_id } = req.body;
    if (!driver_id && !telegram_user_id) {
      return res.status(400).json({ error: 'MISSING_DRIVER_IDENTIFIER' });
    }

    const result = await deliveryService.acceptDelivery(id, {
      driverId: driver_id ? parseInt(driver_id, 10) : undefined,
      telegramUserId: telegram_user_id ? String(telegram_user_id) : undefined,
    });

    if (result.status === 'WON' || result.status === 'ALREADY_WON') {
      return res.status(200).json({ success: true, ...result });
    } else if (result.status === 'LOST') {
      return res.status(409).json({ success: false, ...result });
    } else {
      return res.status(400).json({ success: false, ...result });
    }
  } catch (err: any) {
    console.error(`[API POST /api/admin/deliveries/${req.params.id}/accept failed]`, err.message);
    res.status(500).json({ error: 'Failed to process delivery acceptance' });
  }
});

// ==========================================
// M2.1 — Pickup Locations API Endpoints
// ==========================================

// List Pickup Locations
app.get('/api/admin/pickup-locations', requireAdminAuth, async (_req: AuthRequest, res) => {
  try {
    const locations = await routeService.getPickupLocations();
    res.json(locations);
  } catch (err: any) {
    console.error('[API GET /api/admin/pickup-locations failed]', err.message);
    res.status(500).json({ error: 'Failed to retrieve pickup locations' });
  }
});

// Create Pickup Location
app.post('/api/admin/pickup-locations', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { name, address, neighborhood, active } = req.body;
    const location = await routeService.createPickupLocation({ name, address, neighborhood, active });
    res.status(201).json({ success: true, location });
  } catch (err: any) {
    console.error('[API POST /api/admin/pickup-locations failed]', err.message);
    if (err.message === 'MISSING_PICKUP_LOCATION_FIELDS') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to create pickup location' });
  }
});

// Update Pickup Location
app.patch('/api/admin/pickup-locations/:id', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_LOCATION_ID' });

    const updated = await routeService.updatePickupLocation(id, req.body);
    res.json({ success: true, location: updated });
  } catch (err: any) {
    console.error(`[API PATCH /api/admin/pickup-locations/${req.params.id} failed]`, err.message);
    if (err.message === 'PICKUP_LOCATION_NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to update pickup location' });
  }
});

// ==========================================
// M2.1 — Multi-Stop Routes API Endpoints
// ==========================================

// List Routes (filtered by status: DRAFT, OFFERED, ACCEPTED, CANCELLED)
app.get('/api/admin/routes', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as RouteStatus | undefined;
    if (status && !['DRAFT', 'OFFERED', 'ACCEPTED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'INVALID_STATUS_FILTER' });
    }
    const routesList = await routeService.getRoutes(status);
    res.json(routesList);
  } catch (err: any) {
    console.error('[API GET /api/admin/routes failed]', err.message);
    res.status(500).json({ error: 'Failed to retrieve routes' });
  }
});

// Create Route Draft (DRAFT status, no Telegram message sent)
app.post('/api/admin/routes', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const route = await routeService.createDraft(req.body, req.user?.email || 'ADMIN');
    res.status(201).json({ success: true, route });
  } catch (err: any) {
    console.error('[API POST /api/admin/routes failed]', err.message);
    res.status(400).json({ error: err.message || 'Failed to create route draft' });
  }
});

// Get Route details, stops, dispatches, and audit events
app.get('/api/admin/routes/:id', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    const details = await routeService.getRouteDetails(id);
    res.json(details);
  } catch (err: any) {
    console.error(`[API GET /api/admin/routes/${req.params.id} failed]`, err.message);
    if (err.message === 'ROUTE_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Failed to fetch route details' });
  }
});

// Publish Route (DRAFT -> OFFERED, distributes offer only to compatible ACTIVE drivers)
app.post('/api/admin/routes/:id/publish', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    const result = await routeService.publishRoute(id, req.user?.email || 'ADMIN', req.body);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/publish failed]`, err.message);
    if (err.message === 'ROUTE_NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.message.startsWith('NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION')) {
      return res.status(400).json({
        error: err.message,
        code: 'NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION',
        message: err.message.replace(/^NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION:\s*/, ''),
      });
    }
    if (err.message === 'NO_ACTIVE_DRIVERS_AVAILABLE') {
      return res.status(400).json({
        error: 'NO_ACTIVE_DRIVERS_AVAILABLE',
        code: 'NO_ELIGIBLE_DRIVERS',
        message: 'Nenhum motorista ativo com veículo compatível disponível para esta rota. A rota permanece como rascunho.',
      });
    }
    if (err.message === 'ROUTE_ALREADY_OFFERED' || err.message === 'CANNOT_PUBLISH_CANCELLED_ROUTE') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Failed to publish route' });
  }
});

// Cancel Route (DRAFT -> CANCELLED or OFFERED -> CANCELLED)
app.post('/api/admin/routes/:id/cancel', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    const route = await routeService.cancelRoute(id, req.user?.email || 'ADMIN');
    res.json({ success: true, route });
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/cancel failed]`, err.message);
    if (err.message === 'ROUTE_NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.message === 'ROUTE_ALREADY_CANCELLED') return res.status(400).json({ error: err.message });
    if (err.message === 'CANNOT_CANCEL_ACCEPTED_ROUTE') {
      return res.status(400).json({
        error: 'CANNOT_CANCEL_ACCEPTED_ROUTE',
        message: 'Rotas já aceitas não podem ser canceladas neste marco.',
      });
    }
    res.status(500).json({ error: 'Failed to cancel route' });
  }
});

// M4.4 Preview e Classificação de Edição de Rota
app.post('/api/admin/routes/:id/edit-preview', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    const route = await routeService.getRouteById(id);
    if (!route) return res.status(404).json({ error: 'ROUTE_NOT_FOUND' });

    const analysis = routeEditService.classifyRouteEdit(route, req.body);
    res.json(analysis);
  } catch (err: any) {
    if (err.message?.startsWith('CANNOT_EDIT_')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// M4.4 Executar Edição Controlada de Rota
app.post('/api/admin/routes/:id/edit', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    const actor = req.user?.email || 'ADMIN';
    const result = await routeEditService.executeRouteEdit(id, req.body, actor);
    res.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message === 'ROUTE_NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.message?.startsWith('CONCURRENT_MODIFICATION_CONFLICT')) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.startsWith('CANNOT_EDIT_')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// M4.4 Histórico de Versões e Atualizações da Rota
app.get('/api/admin/routes/:id/updates', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    const updates = await routeEditService.getRouteUpdates(id);
    res.json(updates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Accept Route (Atomic and exclusive acceptance in M3/M2.1)
app.post('/api/admin/routes/:id/accept', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    const { driver_id, telegram_user_id } = req.body;
    if (!driver_id && !telegram_user_id) {
      return res.status(400).json({ error: 'MISSING_DRIVER_IDENTIFIER' });
    }

    const result = await routeService.acceptRoute(id, {
      driverId: driver_id ? parseInt(driver_id, 10) : undefined,
      telegramUserId: telegram_user_id ? String(telegram_user_id) : undefined,
    });

    if (result.status === 'WON' || result.status === 'ALREADY_WON') {
      return res.status(200).json({ success: true, ...result });
    } else if (result.status === 'LOST') {
      return res.status(409).json({ success: false, ...result });
    } else {
      return res.status(400).json({ success: false, ...result });
    }
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/accept failed]`, err.message);
    res.status(500).json({ error: 'Failed to process route acceptance' });
  }
});

// ==========================================
// M4: EXECUÇÃO OPERACIONAL DA ROTA & PARADAS
// ==========================================

// M4: Chegada na Coleta (ACCEPTED -> ARRIVED_PICKUP)
app.post('/api/admin/routes/:id/arrived-pickup', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.accepted_driver_id) {
      return res.status(400).json({ error: 'ROUTE_NOT_ACCEPTED: Rota ainda não possui motorista alocado' });
    }

    const driverId = route.accepted_driver_id;
    const updated = await routeService.markArrivedPickup(routeId, { driverId });
    res.json({ success: true, route: updated });
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/arrived-pickup error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// M4: Pedidos Coletados (ARRIVED_PICKUP -> PICKED_UP)
app.post('/api/admin/routes/:id/picked-up', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.accepted_driver_id) {
      return res.status(400).json({ error: 'ROUTE_NOT_ACCEPTED: Rota ainda não possui motorista alocado' });
    }

    const driverId = route.accepted_driver_id;
    const updated = await routeService.markPickedUp(routeId, { driverId });
    res.json({ success: true, route: updated });
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/picked-up error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// M4: Iniciar Rota (PICKED_UP -> IN_TRANSIT)
app.post('/api/admin/routes/:id/start', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.accepted_driver_id) {
      return res.status(400).json({ error: 'ROUTE_NOT_ACCEPTED: Rota ainda não possui motorista alocado' });
    }

    const driverId = route.accepted_driver_id;
    const result = await routeService.startRoute(routeId, { driverId });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/start error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// M4: Entrega Presencial - Validar PIN
app.post('/api/admin/routes/stops/:id/deliver-pin', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const stopId = parseInt(req.params.id, 10);
    const stop = await routeService.getStopById(stopId);
    if (!stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    const route = await routeService.getRouteById(stop.route_id);
    if (!route?.accepted_driver_id) {
      return res.status(400).json({ error: 'ROUTE_NOT_ACCEPTED: Rota ainda não possui motorista alocado' });
    }

    const driverId = route.accepted_driver_id;
    const { pin } = req.body;
    const result = await routeService.deliverStopWithPin(stopId, pin, { driverId });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/stops/${req.params.id}/deliver-pin error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// M4: Entrega Sem Contato - Foto
app.post('/api/admin/routes/stops/:id/deliver-photo', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const stopId = parseInt(req.params.id, 10);
    const stop = await routeService.getStopById(stopId);
    if (!stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    const route = await routeService.getRouteById(stop.route_id);
    if (!route?.accepted_driver_id) {
      return res.status(400).json({ error: 'ROUTE_NOT_ACCEPTED: Rota ainda não possui motorista alocado' });
    }

    const driverId = route.accepted_driver_id;
    const { proof_reference } = req.body;
    const result = await routeService.deliverStopWithPhoto(stopId, proof_reference, { driverId });
    res.json(result);
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/stops/${req.params.id}/deliver-photo error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// M4: Registrar Incidente na Parada
app.post('/api/admin/routes/stops/:id/incident', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const stopId = parseInt(req.params.id, 10);
    const stop = await routeService.getStopById(stopId);
    if (!stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    const route = await routeService.getRouteById(stop.route_id);
    if (!route?.accepted_driver_id) {
      return res.status(400).json({ error: 'ROUTE_NOT_ACCEPTED: Rota ainda não possui motorista alocado' });
    }

    const driverId = route.accepted_driver_id;
    const { incident_type, incident_note } = req.body;
    const result = await routeService.reportStopIncident(stopId, { incident_type, incident_note }, { driverId });
    res.json(result);
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/stops/${req.params.id}/incident error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// M4: Obter URL da Foto de Comprovante do Telegram
app.get('/api/telegram/file-url/:fileId', async (req, res) => {
  try {
    const fileUrl = await telegramBot.getFileUrl(req.params.fileId);
    res.json({ url: fileUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// M4.1 PARTE A: Relatório de Auditoria de Veículos dos Motoristas de Indicação
// =========================================================================
app.get('/api/admin/drivers/referral-vehicle-audit', requireAdminAuth, async (_req, res) => {
  try {
    const audit = await driverService.getReferralVehicleAudit();
    res.json(audit);
  } catch (err: any) {
    console.error('[API GET /api/admin/drivers/referral-vehicle-audit error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// M4.1 PARTE B: Gestão de Incidentes Operacionais (⚠️ PENDÊNCIAS)
// =========================================================================
app.get('/api/admin/incidents', requireAdminAuth, async (req, res) => {
  try {
    const resolution_status = (req.query.resolution_status as any) || 'ALL';
    const search = req.query.search as string | undefined;
    const incidents = await routeService.getIncidents({ resolution_status, search });
    res.json(incidents);
  } catch (err: any) {
    console.error('[API GET /api/admin/incidents error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/stops/:id/resolve', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const stopId = parseInt(req.params.id, 10);
    const { resolution_type, resolution_note } = req.body;
    const actor = req.user?.email || req.user?.uid || 'ADMIN';

    if (!resolution_type) {
      return res.status(400).json({ error: 'MISSING_RESOLUTION_TYPE' });
    }

    const updatedStop = await routeService.resolveStopIncident(stopId, {
      resolution_type,
      resolution_note,
      resolved_by: actor,
    });

    res.json({
      success: true,
      stop: updatedStop,
      message: 'Incidente resolvido com sucesso.',
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/stops/${req.params.id}/resolve error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// =========================================================================
// M4.1 PARTE C: Gestão de Pagamentos das Rotas (💰 PAGAMENTOS)
// =========================================================================
app.get('/api/admin/payments', requireAdminAuth, async (req, res) => {
  try {
    const payment_status = (req.query.payment_status as any) || 'ALL';
    const driver_id = req.query.driver_id ? parseInt(req.query.driver_id as string, 10) : undefined;
    const search = req.query.search as string | undefined;

    const paymentsData = await routeService.getPaymentsData({
      payment_status,
      driver_id,
      search,
    });

    res.json(paymentsData);
  } catch (err: any) {
    console.error('[API GET /api/admin/payments error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/routes/:id/pay', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const { payment_method, payment_reference, payment_note } = req.body;
    const actor = req.user?.email || req.user?.uid || 'ADMIN';

    const updatedRoute = await routeService.registerRoutePayment(routeId, {
      paid_by: actor,
      payment_method,
      payment_reference,
      payment_note,
    });

    res.json({
      success: true,
      route: updatedRoute,
      message: 'Pagamento da rota registrado com sucesso.',
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/pay error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// =========================================================================
// M4.2: Configurações de Entrega, Modalidades, Bairros & Tabela de Fretes
// =========================================================================

// Modalidades de Entrega (Parte B)
app.get('/api/admin/modalities', requireAdminAuth, async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const modalities = await deliveryConfigService.getModalities(activeOnly);
    res.json(modalities);
  } catch (err: any) {
    console.error('[API GET /api/admin/modalities error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/modalities', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { name, code } = req.body;
    const modality = await deliveryConfigService.createModality({ name, code });
    res.status(201).json(modality);
  } catch (err: any) {
    console.error('[API POST /api/admin/modalities error]', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/modalities/:id', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, active } = req.body;
    const updated = await deliveryConfigService.updateModality(id, { name, active });
    res.json(updated);
  } catch (err: any) {
    console.error(`[API PATCH /api/admin/modalities/${req.params.id} error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// Bairros (Parte D)
app.get('/api/admin/neighborhoods', requireAdminAuth, async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const neighborhoodsList = await deliveryConfigService.getNeighborhoods(activeOnly);
    res.json(neighborhoodsList);
  } catch (err: any) {
    console.error('[API GET /api/admin/neighborhoods error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/neighborhoods', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    const neighborhood = await deliveryConfigService.createNeighborhood(name);
    res.status(201).json(neighborhood);
  } catch (err: any) {
    console.error('[API POST /api/admin/neighborhoods error]', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/admin/neighborhoods/:id', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, active } = req.body;
    const updated = await deliveryConfigService.updateNeighborhood(id, { name, active });
    res.json(updated);
  } catch (err: any) {
    console.error(`[API PATCH /api/admin/neighborhoods/${req.params.id} error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// Parâmetros de Precificação (Parte G & H)
app.get('/api/admin/delivery-config', requireAdminAuth, async (_req, res) => {
  try {
    const config = await deliveryConfigService.getDeliveryConfig();
    res.json(config);
  } catch (err: any) {
    console.error('[API GET /api/admin/delivery-config error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/delivery-config', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { key, value } = req.body;
    if (!['LOGISTICS_MANAGEMENT_RATE', 'DEFAULT_ROUTE_DISCOUNT_PERCENT'].includes(key)) {
      return res.status(400).json({ error: 'INVALID_CONFIG_KEY' });
    }
    const updated = await deliveryConfigService.updateDeliveryConfig(key, value);
    res.json(updated);
  } catch (err: any) {
    console.error('[API PUT /api/admin/delivery-config error]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Tabela de Fretes / Matriz Tarifária (Parte E)
app.get('/api/admin/freight-prices', requireAdminAuth, async (req, res) => {
  try {
    const neighborhood_id = req.query.neighborhood_id ? parseInt(req.query.neighborhood_id as string, 10) : undefined;
    const modality_code = req.query.modality_code as string | undefined;
    const vehicle_category = req.query.vehicle_category as string | undefined;
    const activeOnly = req.query.activeOnly === 'true';

    const prices = await deliveryConfigService.getFreightPrices({
      neighborhood_id,
      modality_code,
      vehicle_category,
      activeOnly,
    });
    res.json(prices);
  } catch (err: any) {
    console.error('[API GET /api/admin/freight-prices error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/freight-prices', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { neighborhood_id, modality_code, vehicle_category, price, active } = req.body;
    const saved = await deliveryConfigService.upsertFreightPrice({
      neighborhood_id: parseInt(neighborhood_id, 10),
      modality_code: modality_code.trim().toUpperCase(),
      vehicle_category: vehicle_category as PricingVehicleCategory,
      price: typeof price === 'number' ? price : parseFloat(String(price).replace(',', '.')),
      active,
    });
    res.json(saved);
  } catch (err: any) {
    console.error('[API POST /api/admin/freight-prices error]', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/freight-prices/suggested', requireAdminAuth, async (req, res) => {
  try {
    const neighborhood = req.query.neighborhood as string;
    const modality_code = (req.query.modality_code as string) || 'CONVENCIONAL';
    const vehicle_category = (req.query.vehicle_category as PricingVehicleCategory) || 'CAR';

    if (!neighborhood) {
      return res.json({ price: 0, source: 'NONE' });
    }

    const nId = parseInt(neighborhood, 10);
    const lookupTarget = isNaN(nId) ? neighborhood : nId;

    const result = await deliveryConfigService.getSuggestedFreightPrice(
      lookupTarget,
      modality_code.trim().toUpperCase(),
      vehicle_category
    );
    res.json(result);
  } catch (err: any) {
    console.error('[API GET /api/admin/freight-prices/suggested error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Prévia de Cálculo Financeiro de Rota (Parte H & I)
app.post('/api/admin/routes/calculate-pricing', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { stops, management_rate, route_discount_percent } = req.body;
    if (!Array.isArray(stops)) {
      return res.status(400).json({ error: 'STOPS_ARRAY_REQUIRED' });
    }

    const parsedStops = stops.map((s: any) => ({
      customer_freight: typeof s.customer_freight === 'number'
        ? s.customer_freight
        : parseFloat(String(s.customer_freight || 0).replace(',', '.')) || 0,
    }));

    const config = await deliveryConfigService.getDeliveryConfig();
    const result = deliveryConfigService.calculateRoutePricing(parsedStops, {
      logistics_management_rate: management_rate !== undefined ? management_rate : config.logistics_management_rate,
      default_route_discount_percent: route_discount_percent !== undefined ? route_discount_percent : config.default_route_discount_percent,
    });

    res.json(result);
  } catch (err: any) {
    console.error('[API POST /api/admin/routes/calculate-pricing error]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Driver Route Details Endpoint (M4.2 Parte P: Strict Privacy)
app.get('/api/driver/routes/:id', async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Sanitize to ensure driver NEVER sees customer freight, management margins, discounts or override reasons
    const driverSafe = routeService.sanitizeRouteForDriver(route);
    res.json(driverSafe);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Authorized Driver Route Navigation Links Endpoint (M4.3)
app.get('/api/driver/routes/:id/navigation', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (!route.accepted_driver_id) {
      return res.status(403).json({ error: 'FORBIDDEN_PRE_ACCEPTANCE' });
    }

    const driverId = route.accepted_driver_id;
    const navLinks = await routeService.getRouteNavigation(routeId, { driverId });
    res.json(navLinks);
  } catch (err: any) {
    if (err.message === 'ROUTE_NOT_FOUND') {
      return res.status(404).json({ error: 'Route not found' });
    }
    if (
      err.message === 'DRIVER_NOT_FOUND' ||
      err.message === 'FORBIDDEN_PRE_ACCEPTANCE' ||
      err.message === 'FORBIDDEN_NOT_WINNING_DRIVER'
    ) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// Mount Vite in development or static dist in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Kantine Delivery M1] Server running on http://0.0.0.0:${PORT}`);
  });

  // Start Telegram Bot polling
  telegramBot.start().catch((err) => {
    console.error('[Kantine Delivery M1] Telegram Bot start error:', err.message);
  });
}

startServer().catch((err) => {
  console.error('[Kantine Delivery M1] Startup error:', err);
  process.exit(1);
});
