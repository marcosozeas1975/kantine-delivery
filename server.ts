import crypto from "crypto";
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateFreightExcelWorkbook } from './scripts/generate_freight_excel.ts';
import { driverService } from './src/server/driverService.ts';
import { deliveryService } from './src/server/deliveryService.ts';
import { routeService } from './src/server/routeService.ts';
import { routeEditService } from './src/server/routeEditService.ts';
import { referralService } from './src/server/referralService.ts';
import { deliveryConfigService } from './src/server/deliveryConfigService.ts';
import {
  calculateRoutePricing as calculateFreightPricing,
  generateWhatsAppProposalMessage,
  UBERLANDIA_70_NEIGHBORHOODS,
  MOTO_RADIUS_TARIFF_TABLE,
  DEFAULT_FREIGHT_PARAMETERS,
  PICKUP_PRESETS,
  findNeighborhoodRecord,
} from './src/server/freightEngine.ts';
import { telegramBot } from './src/server/telegramBot.ts';
import { requireAdminAuth, AuthRequest } from './src/middleware/auth.ts';
import { canReceiveDeliveryOffers, canReceiveRouteOffer } from './src/server/eligibility.ts';
import { DriverStatus, DeliveryStatus, RouteStatus, PricingVehicleCategory } from './src/server/types.ts';
import { takeatService } from './src/server/takeatService.ts';
import { scheduleService, OFFER_LEAD_MINUTES } from './src/server/scheduleService.ts';
import { initDbConstraints } from './src/db/index.ts';
import { mercadoPagoService } from './src/server/mercadoPagoService.ts';
import { searchAddressSuggestions } from './src/server/geocodingService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const args = process.argv.slice(2);
const portFlagIndex = args.indexOf('--port');
const cliPort = portFlagIndex !== -1 && args[portFlagIndex + 1] ? Number(args[portFlagIndex + 1]) : null;
const PORT = cliPort || (process.env.PORT ? Number(process.env.PORT) : 3000);

// Process-level resilience against transient DB socket drops or external service resets
process.on('uncaughtException', (err: any) => {
  const isPgSocketDrop =
    err?.message?.includes('Connection terminated unexpectedly') ||
    err?.message?.includes('Connection terminated') ||
    err?.code === 'ECONNRESET' ||
    err?.code === 'EPIPE';

  if (isPgSocketDrop) {
    console.warn('[Server] Caught transient socket termination error (recovering):', err.message);
    return;
  }
  console.error('[Server] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[Server] Unhandled Promise Rejection (handled):', reason?.message || reason);
});

app.use(express.json());

// Autocomplete & Reconhecimento de Endereço em Uberlândia (Tipo Apps de Transporte)
app.get('/api/geocode/autocomplete', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const originLat = req.query.originLat ? parseFloat(req.query.originLat as string) : undefined;
    const originLng = req.query.originLng ? parseFloat(req.query.originLng as string) : undefined;

    const originCoords = originLat && originLng ? { lat: originLat, lng: originLng } : undefined;
    const suggestions = await searchAddressSuggestions(q, originCoords);
    res.json({ suggestions });
  } catch (err: any) {
    console.error('[API /api/geocode/autocomplete error]:', err?.message || err);
    res.status(500).json({ error: 'Falha no reconhecimento de endereço', suggestions: [] });
  }
});

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

// 5d. Reinclusion requires new invite and approval ("processo zerado")
app.post('/api/admin/drivers/:id/reinclusion/approve', requireAdminAuth, async (req: AuthRequest, res) => {
  return res.status(400).json({
    error: 'EXCLUDED_DRIVER_REQUIRES_NEW_INVITE',
    message: 'Motoristas excluídos têm o processo zerado e só podem ser reinseridos através de novo convite e aprovação (pois podem ter mudado de veículo, telefone ou chave PIX).'
  });
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

// 5f. Reinvite excluded driver with new invite token
app.post('/api/admin/drivers/:id/reinvite', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_DRIVER_ID' });

    const driver = await driverService.getDriverById(id);
    if (!driver) return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });

    const actorId = req.user?.email || req.user?.uid || 'ADMIN';
    const invitation = await driverService.createDriverInvitation({
      name: driver.name,
      phone: driver.phone,
      vehicle_type: 'CAR',
      created_by: actorId,
    });

    const status = telegramBot.getStatus();
    const botUsername = status.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'KantineEntregasbot';
    const inviteLink = `https://t.me/${botUsername}?start=${invitation.token}`;

    res.json({
      success: true,
      message: 'Novo convite gerado com sucesso. O motorista reiniciará o cadastro do zero.',
      invitation,
      inviteLink,
      botUsername: status.botUsername || 'KantineEntregasbot',
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/reinvite failed]`, err.message);
    res.status(500).json({ error: err.message || 'Failed to generate reinvite' });
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
    const botUsername = status.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'KantineEntregasbot';
    res.json({
      invitations: invites,
      botUsername: status.botUsername || 'KantineEntregasbot',
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
    const botUsername = status.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'KantineEntregasbot';
    const inviteLink = `https://t.me/${botUsername}?start=${invitation.token}`;
    res.json({
      success: true,
      invitation,
      inviteLink,
      botUsername: status.botUsername || 'KantineEntregasbot',
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

app.post('/api/admin/driver-invitations/:id/convert', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_INVITATION_ID' });
    const driver = await driverService.convertInvitationToDriver(id);
    res.json({ success: true, driver });
  } catch (err: any) {
    console.error(`[API POST /api/admin/driver-invitations/${req.params.id}/convert failed]`, err.message);
    res.status(500).json({ error: err.message || 'Failed to convert invitation to driver' });
  }
});

// Admin endpoint to completely reset drivers, invitations, routes and operational history
app.post('/api/admin/system/reset-drivers-history', requireAdminAuth, async (_req: AuthRequest, res) => {
  try {
    await driverService.resetAllDriversAndHistory();
    await telegramBot.clearAllSessions();
    const status = telegramBot.getStatus();
    res.json({
      success: true,
      message: 'Todos os motoristas, convites, rotas e históricos foram limpos com sucesso. O Telegram Kantine Entregas foi zerado para novos cadastros.',
      botUsername: status.botUsername || 'KantineEntregasbot',
    });
  } catch (err: any) {
    console.error('[API POST /api/admin/system/reset-drivers-history failed]', err.message);
    res.status(500).json({ error: err.message || 'Falha ao resetar motoristas e histórico.' });
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
    if (
      status &&
      ![
        'DRAFT',
        'OFFERED',
        'ACCEPTED',
        'ARRIVED_PICKUP',
        'PICKED_UP',
        'IN_TRANSIT',
        'COMPLETED',
        'CANCELLED',
      ].includes(status)
    ) {
      return res.status(400).json({ error: 'INVALID_STATUS_FILTER' });
    }
    const routesList = await routeService.getRoutes(status);
    res.json(await scheduleService.decorate(routesList));
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

    const details: any = await routeService.getRouteDetails(id);
    if (details?.route) details.route = (await scheduleService.decorate([details.route]))[0];
    res.json(details);
  } catch (err: any) {
    console.error(`[API GET /api/admin/routes/${req.params.id} failed]`, err.message);
    if (err.message === 'ROUTE_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'Failed to fetch route details' });
  }
});

// Update Route accepted vehicle types (instant change for DRAFT and OFFERED routes)
app.patch('/api/admin/routes/:id/vehicle-types', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    const { accepted_vehicle_types } = req.body;
    if (!Array.isArray(accepted_vehicle_types) || accepted_vehicle_types.length === 0) {
      return res.status(400).json({ error: 'AT_LEAST_ONE_VEHICLE_TYPE_REQUIRED' });
    }

    const updated = await routeService.updateRouteVehicleTypes(
      id,
      accepted_vehicle_types,
      req.user?.email || 'ADMIN'
    );
    res.json({ success: true, route: updated });
  } catch (err: any) {
    console.error(`[API PATCH /api/admin/routes/${req.params.id}/vehicle-types failed]`, err.message);
    if (err.message === 'ROUTE_NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message || 'Failed to update vehicle types' });
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

// Cancel Route (Allows cancellation in any status, automatically forwarding to Pendências for resolution)
app.post('/api/admin/routes/:id/cancel', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    const { reason, compensation_amount, resolution_type, resolution_note } = req.body || {};
    const route = await routeService.cancelRoute(id, req.user?.email || 'ADMIN', reason, {
      compensation_amount:
        compensation_amount !== undefined && compensation_amount !== '' && compensation_amount !== null
          ? parseFloat(String(compensation_amount).replace(',', '.'))
          : undefined,
      resolution_type,
      resolution_note,
    });
    res.json({
      success: true,
      route,
      message: `Rota #${id} cancelada com sucesso e encaminhada para o setor de Pendências Operacionais.`,
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/cancel failed]`, err.message);
    if (err.message === 'ROUTE_NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.message === 'ROUTE_ALREADY_CANCELLED') return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message || 'Failed to cancel route' });
  }
});

// M4.4 Preview e Classificação de Edição de Rota
// ==========================================
// AGENDAMENTO DE CORRIDAS (data/hora de entrega + oferta programada)
// ==========================================

// Define/altera (ou remove, com null) a data e hora de entrega da rota
app.post('/api/admin/routes/:id/scheduled-for', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });
    const raw = req.body?.scheduled_for;
    const when = raw ? new Date(raw) : null;
    if (when && isNaN(when.getTime())) return res.status(400).json({ error: 'INVALID_DATE', message: 'Data/hora inválida.' });
    const route = await routeService.getRouteById(id);
    if (!route) return res.status(404).json({ error: 'ROUTE_NOT_FOUND' });
    if (route.status !== 'DRAFT') return res.status(409).json({ error: 'ROUTE_NOT_DRAFT', message: 'Só dá para mudar o horário de rotas em rascunho.' });
    res.json({ success: true, schedule: await scheduleService.setScheduledFor(id, when) });
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/scheduled-for]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Programa a publicação da oferta (entrega − antecedência); se já passou da hora, publica agora
app.post('/api/admin/routes/:id/schedule', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });
    if (req.body?.scheduled_for) {
      const when = new Date(req.body.scheduled_for);
      if (isNaN(when.getTime())) return res.status(400).json({ error: 'INVALID_DATE', message: 'Data/hora inválida.' });
      await scheduleService.setScheduledFor(id, when);
    }
    const r = await scheduleService.schedulePublish(id, req.user?.email || 'ADMIN');
    res.json({ success: true, ...r, leadMinutes: OFFER_LEAD_MINUTES() });
  } catch (err: any) {
    const msg = String(err?.message || '');
    const known: Record<string, [number, string]> = {
      ROUTE_NOT_FOUND: [404, 'Rota não encontrada.'],
      ROUTE_NOT_DRAFT: [409, 'Só rotas em rascunho podem ter a oferta agendada.'],
      SCHEDULED_FOR_REQUIRED: [400, 'Informe a data e hora da entrega.'],
      SCHEDULED_FOR_IN_PAST: [400, 'A data/hora da entrega já passou.'],
      NO_ACTIVE_DRIVERS_AVAILABLE: [400, 'Horário da oferta já chegou, mas nenhum motorista ativo com veículo compatível está disponível. A rota segue como rascunho.'],
    };
    if (known[msg]) return res.status(known[msg][0]).json({ error: msg, message: known[msg][1] });
    console.error(`[API POST /api/admin/routes/${req.params.id}/schedule]`, msg);
    res.status(500).json({ error: msg || 'Falha ao agendar a oferta.' });
  }
});

// Desfaz a oferta programada (a rota volta a ser rascunho comum)
app.post('/api/admin/routes/:id/unschedule', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });
    res.json({ success: true, schedule: await scheduleService.unschedulePublish(id, req.user?.email || 'ADMIN') });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Disparo externo do agendador (a ponte do Zelo chama a cada minuto), com a mesma senha do webhook da Matriz.
// Garante a publicação na hora certa mesmo se o servidor estiver "dormindo" entre requisições.
app.post('/api/webhooks/scheduler/tick', async (req, res) => {
  try {
    const config = await takeatService.getConfig('MATRIZ');
    const expected = String(config.webhook_secret || process.env.TAKEAT_WEBHOOK_SECRET || '').trim();
    const token = String(req.headers['x-webhook-token'] || req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'INVALID_WEBHOOK_TOKEN' });
    res.json({ success: true, ...(await scheduleService.tick()) });
  } catch (err: any) {
    console.error('[agendador tick]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Excluir de vez uma rota que nunca teve entregador (rascunho ou cancelada sem motorista)
app.delete('/api/admin/routes/:id', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });
    await routeService.deleteRouteWithoutDriver(id);
    res.json({ success: true, message: `Rota #${id} excluída.` });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg === 'ROUTE_NOT_FOUND') return res.status(404).json({ error: msg });
    if (msg === 'ROUTE_HAS_DRIVER' || msg === 'ROUTE_NOT_DELETABLE') {
      return res.status(409).json({ error: msg, message: 'Só rotas em rascunho ou canceladas que nunca tiveram entregador podem ser excluídas.' });
    }
    console.error(`[API DELETE /api/admin/routes/${req.params.id} error]`, msg);
    res.status(500).json({ error: msg || 'Falha ao excluir rota.' });
  }
});

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

// M4.4 Descartar Proposta Rejeitada
app.post('/api/admin/routes/:id/discard-rejected-proposal', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    await routeEditService.discardRejectedProposal(id, req.user?.email || 'ADMIN');
    const refreshed = await routeService.getRouteById(id);
    res.json({ success: true, route: refreshed });
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
app.get('/api/telegram/file-url/:fileId', requireAdminAuth, async (req, res) => {
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
    const { resolution_type, resolution_note, compensation_amount, adjust_route_fee } = req.body;
    const actor = req.user?.email || req.user?.uid || 'ADMIN';

    if (!resolution_type) {
      return res.status(400).json({ error: 'MISSING_RESOLUTION_TYPE' });
    }

    const updatedStop = await routeService.resolveStopIncident(stopId, {
      resolution_type,
      resolution_note,
      resolved_by: actor,
      compensation_amount:
        compensation_amount !== undefined && compensation_amount !== '' && compensation_amount !== null
          ? parseFloat(String(compensation_amount).replace(',', '.'))
          : undefined,
      adjust_route_fee: adjust_route_fee !== false,
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

// Finalizar corrida tratada e liberar para pagamento
app.post('/api/admin/routes/:id/finalize', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    if (isNaN(routeId)) return res.status(400).json({ error: 'INVALID_ROUTE_ID' });

    const actor = req.user?.email || req.user?.uid || 'ADMIN';
    const updatedRoute = await routeService.finalizeAndCompleteRoute(routeId, actor);

    // Notificar motorista pelo Telegram que a corrida foi finalizada
    if (updatedRoute.accepted_driver_id) {
      const driver = await driverService.getDriverById(updatedRoute.accepted_driver_id).catch(() => null);
      const chatId = driver?.telegram_chat_id || driver?.telegram_user_id;
      if (chatId) {
        await telegramBot.sendFinalRouteSummary(chatId, updatedRoute.id).catch(() => null);
      }
    }

    res.json({ success: true, route: updatedRoute });
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/finalize error]`, err.message);
    res.status(500).json({ error: err.message });
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
  }
});

// Mercado Pago: Status de Conexão e Informações da Conta
app.get('/api/admin/payments/mercadopago/status', requireAdminAuth, async (_req, res) => {
  try {
    const info = await mercadoPagoService.getAccountInfo();
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ configured: false, error: err.message });
  }
});

// Mercado Pago: Repasse Automatizado via Transferência Pix para Motorista
app.post('/api/admin/routes/:id/pay-mercadopago', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const actor = req.user?.email || req.user?.uid || 'ADMIN';

    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: 'ROUTE_NOT_FOUND' });
    }
    if (route.status !== 'COMPLETED' && route.status !== 'CANCELLED') {
      return res.status(400).json({ error: `Apenas rotas concluídas ou canceladas podem receber repasse (Status atual: ${route.status}).` });
    }
    if (route.payment_status === 'PAID') {
      return res.status(400).json({ error: 'Esta rota já foi paga anteriormente.' });
    }
    if (!route.accepted_driver_id) {
      return res.status(400).json({ error: 'Rota não possui motorista associado.' });
    }

    const driver = await driverService.getDriverById(route.accepted_driver_id);
    if (!driver) {
      return res.status(404).json({ error: 'Motorista não encontrado no sistema.' });
    }

    const pixKey = (driver.pix_key_value || driver.pix_key || '').trim();
    if (!pixKey) {
      return res.status(400).json({ error: 'O motorista não possui chave Pix cadastrada para repasse.' });
    }

    const totalNum = parseFloat(String(route.total_fee || '0').replace(',', '.')) || 0;
    const storeRate =
      route.management_rate_snapshot != null && !isNaN(parseFloat(String(route.management_rate_snapshot)))
        ? parseFloat(String(route.management_rate_snapshot))
        : 0.10;
    const driverFeeNum = Math.round(totalNum * (1 - storeRate) * 100) / 100;

    const payoutResult = await mercadoPagoService.executePixPayout({
      routeId,
      amount: driverFeeNum,
      driverName: driver.name,
      pixKey,
      pixKeyType: driver.pix_key_type || 'RANDOM',
      description: `Repasse Pix Rota #${routeId}`,
    });

    if (!payoutResult.success) {
      return res.status(400).json({
        error: payoutResult.message,
        details: payoutResult.raw,
      });
    }

    const updatedRoute = await routeService.registerRoutePayment(routeId, {
      paid_by: actor,
      payment_method: 'PIX_MERCADO_PAGO',
      payment_reference: payoutResult.payoutId,
      payment_note: `Repasse Pix automatizado via Mercado Pago (ID: ${payoutResult.payoutId})`,
    });

    res.json({
      success: true,
      route: updatedRoute,
      payoutId: payoutResult.payoutId,
      message: payoutResult.message,
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/pay-mercadopago error]`, err.message);
    res.status(500).json({ error: err.message });
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

// ==========================================
// MOTOR DE FRETES & PRECIFICAÇÃO KANTINE
// ==========================================

// 1. Obter configurações, tabelas de preço e presets
app.get('/api/admin/freight-engine/config', requireAdminAuth, async (_req, res) => {
  try {
    res.json({
      neighborhoods: UBERLANDIA_70_NEIGHBORHOODS,
      motoRadiusTable: MOTO_RADIUS_TARIFF_TABLE,
      parameters: DEFAULT_FREIGHT_PARAMETERS,
      pickupPresets: PICKUP_PRESETS,
    });
  } catch (err: any) {
    console.error('[API GET /api/admin/freight-engine/config error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Calcular Rota pelo Motor de Fretes
app.post('/api/admin/freight-engine/calculate', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { modality, origin, stops, parameters } = req.body;
    if (!modality || !['CAR', 'MOTO'].includes(modality)) {
      return res.status(400).json({ error: 'INVALID_MODALITY: Modalidade deve ser CAR ou MOTO' });
    }
    if (!origin || !origin.name || !origin.address) {
      return res.status(400).json({ error: 'INVALID_ORIGIN: Origem é obrigatória' });
    }
    if (!Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ error: 'STOPS_REQUIRED: Ao menos uma parada é obrigatória' });
    }

    const result = calculateFreightPricing(
      modality,
      origin,
      stops,
      parameters || DEFAULT_FREIGHT_PARAMETERS
    );

    res.json(result);
  } catch (err: any) {
    console.error('[API POST /api/admin/freight-engine/calculate error]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// 3. Gerar Texto Formatado para WhatsApp (Seção 13 do Briefing)
app.post('/api/admin/freight-engine/whatsapp-proposal', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { modality, originNameOrAddress, stops, driverFee, googleMapsUrl, observations } = req.body;
    const message = generateWhatsAppProposalMessage({
      modality: modality || 'MOTO',
      originNameOrAddress: originNameOrAddress || 'Kantine Matriz',
      stops: stops || [],
      driverFee: Number(driverFee) || 0,
      googleMapsUrl,
      observations,
    });
    res.json({ message });
  } catch (err: any) {
    console.error('[API POST /api/admin/freight-engine/whatsapp-proposal error]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// 4. Sincronizar os 70 Bairros no Banco de Dados (idempotente)
app.post('/api/admin/freight-engine/seed-70-neighborhoods', requireAdminAuth, async (_req, res) => {
  try {
    let insertedNeighborhoods = 0;
    let insertedPrices = 0;

    for (const record of UBERLANDIA_70_NEIGHBORHOODS) {
      const neighborhood = await deliveryConfigService.findOrCreateNeighborhood(record.name);
      if (neighborhood) {
        insertedNeighborhoods++;
        await deliveryConfigService.upsertFreightPrice({
          neighborhood_id: neighborhood.id,
          modality_code: 'CONVENCIONAL',
          vehicle_category: 'CAR',
          price: record.carFee,
          active: true,
        });
        insertedPrices++;
      }
    }

    res.json({
      success: true,
      total_neighborhoods: UBERLANDIA_70_NEIGHBORHOODS.length,
      seeded_neighborhoods: insertedNeighborhoods,
      seeded_prices: insertedPrices,
    });
  } catch (err: any) {
    console.error('[API POST /api/admin/freight-engine/seed-70-neighborhoods error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. Exportar / Baixar Tabela de Fretes Completa em Excel (.xlsx) com 110 Bairros & Raio Moto
app.get(
  [
    '/api/admin/freight-engine/export-excel',
    '/api/freight-engine/download-excel',
    '/api/freight-engine/download-excel/Tabela_de_Fretes.xlsx',
    '/api/freight-engine/download-excel/Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx',
  ],
  async (req, res) => {
    try {
      const exportDir = path.resolve(__dirname, 'public', 'downloads');
      fs.mkdirSync(exportDir, { recursive: true });
      const filePathShort = path.join(exportDir, 'Tabela_de_Fretes.xlsx');
      const filePathLong = path.join(exportDir, 'Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx');

      // Se qualquer um dos arquivos não existir ou for solicitado via ?fresh=true, regenera
      if (!fs.existsSync(filePathShort) || !fs.existsSync(filePathLong) || req.query.fresh === 'true') {
        const wb = await generateFreightExcelWorkbook();
        await wb.xlsx.writeFile(filePathShort);
        await wb.xlsx.writeFile(filePathLong);
      }

      const requestedFile = req.path.endsWith('Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx')
        ? filePathLong
        : filePathShort;
      const downloadFilename = req.path.endsWith('Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx')
        ? 'Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx'
        : 'Tabela_de_Fretes.xlsx';

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.download(requestedFile, downloadFilename);
    } catch (err: any) {
      console.error('[API GET /api/freight-engine/download-excel error]', err.message);
      res.status(500).json({ error: 'Falha ao gerar/baixar planilha Excel: ' + err.message });
    }
  }
);

// Driver Route Details Endpoint (M4.2 Parte P: Strict Privacy)
app.get('/api/driver/routes/:id', requireAdminAuth, async (req, res) => {
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

// ==========================================
// INTEGRAÇÃO TAKEAT (PDV & DELIVERY PRÓPRIO MULTI-LOJA)
// ==========================================

// Helper para processamento de webhook com validação opcional de token
async function handleTakeatWebhook(req: any, res: any, explicitStoreKey?: string) {
  try {
    const rawPayload = req.body;
    console.log(`[Takeat Webhook Received (${explicitStoreKey || 'AUTO'})]`, JSON.stringify(rawPayload).slice(0, 300));

    // Webhook Secret OBRIGATÓRIO: sem ele, qualquer pessoa poderia criar pedidos (e despachar entregadores)
    const storeKeyToValidate = (String(explicitStoreKey || '').toUpperCase() === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ') as 'MATRIZ' | 'VINHEDOS';
    const config = await takeatService.getConfig(storeKeyToValidate);
    const expected = String(config.webhook_secret || process.env.TAKEAT_WEBHOOK_SECRET || '').trim();
    if (!expected) {
      return res.status(503).json({ error: 'WEBHOOK_SECRET_NOT_CONFIGURED', details: `Cadastre o Webhook secret da loja ${storeKeyToValidate} nas configurações do Takeat.` });
    }
    const rawToken = String(req.headers['x-webhook-token'] || req.headers['authorization'] || req.headers['x-takeat-signature'] || '');
    const token = rawToken.replace(/^Bearer\s+/i, '').trim();
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.warn(`[Takeat Webhook ${storeKeyToValidate}] token inválido — pedido recusado`);
      return res.status(401).json({ error: 'INVALID_WEBHOOK_TOKEN' });
    }

    const result = await takeatService.processIncomingWebhook(rawPayload, explicitStoreKey);
    res.status(200).json({
      success: true,
      action: result.action,
      storeKey: result.storeKey,
      orderId: result.order.id,
      displayId: result.order.display_id,
      status: result.order.status,
      calculatedFreight: result.order.calculated_freight_value,
      routeId: result.order.created_route_id ?? null,
      draftError: result.draftError ?? null,
    });
  } catch (err: any) {
    console.error('[Takeat Webhook Error]', err.message);
    res.status(500).json({ error: 'FAILED_TO_PROCESS_TAKEAT_WEBHOOK', details: err.message });
  }
}

// 1. Webhook Específico para Loja Matriz
app.post('/api/webhooks/takeat/matriz', async (req, res) => {
  await handleTakeatWebhook(req, res, 'MATRIZ');
});

// 2. Webhook Específico para Loja Vinhedos
app.post('/api/webhooks/takeat/vinhedos', async (req, res) => {
  await handleTakeatWebhook(req, res, 'VINHEDOS');
});

// 3. Webhook Unificado com Auto-Detecção por Store ID ou Query Param (?store=matriz|vinhedos)
app.post('/api/webhooks/takeat', async (req, res) => {
  const storeParam = (req.query.store as string) || (req.query.loja as string) || undefined;
  await handleTakeatWebhook(req, res, storeParam);
});

// 4. Obter Configurações de Todas as Lojas (Matriz e Vinhedos)
app.get('/api/admin/takeat/configs', requireAdminAuth, async (_req, res) => {
  try {
    const all = await takeatService.getAllConfigs();
    res.json({
      MATRIZ: {
        ...all.MATRIZ,
        has_api_key: Boolean(all.MATRIZ.api_key && all.MATRIZ.api_key.trim().length > 0),
        has_webhook_secret: Boolean(all.MATRIZ.webhook_secret && all.MATRIZ.webhook_secret.trim().length > 0),
      },
      VINHEDOS: {
        ...all.VINHEDOS,
        has_api_key: Boolean(all.VINHEDOS.api_key && all.VINHEDOS.api_key.trim().length > 0),
        has_webhook_secret: Boolean(all.VINHEDOS.webhook_secret && all.VINHEDOS.webhook_secret.trim().length > 0),
      },
    });
  } catch (err: any) {
    console.error('[API GET /api/admin/takeat/configs error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. Obter Configuração de Loja Específica
app.get('/api/admin/takeat/config', requireAdminAuth, async (req, res) => {
  try {
    const storeKey = ((req.query.store as string)?.toUpperCase() === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ') as 'MATRIZ' | 'VINHEDOS';
    const config = await takeatService.getConfig(storeKey);
    res.json({
      ...config,
      has_api_key: Boolean(config.api_key && config.api_key.trim().length > 0),
      has_webhook_secret: Boolean(config.webhook_secret && config.webhook_secret.trim().length > 0),
    });
  } catch (err: any) {
    console.error('[API GET /api/admin/takeat/config error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6. Salvar Configurações e Chaves do Takeat (por loja)
app.post('/api/admin/takeat/config', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const {
      store_key,
      store_name,
      api_key,
      webhook_secret,
      store_id,
      default_pickup_preset,
      auto_calculate_freight,
      preferred_modality,
      notification_sound_enabled,
      is_active,
    } = req.body;

    const targetStore = (String(store_key).toUpperCase() === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ') as 'MATRIZ' | 'VINHEDOS';

    const saved = await takeatService.saveConfig(targetStore, {
      store_name,
      api_key,
      webhook_secret,
      store_id,
      default_pickup_preset,
      auto_calculate_freight,
      preferred_modality,
      notification_sound_enabled,
      is_active,
    });

    res.json({
      ...saved,
      has_api_key: Boolean(saved.api_key && saved.api_key.trim().length > 0),
      has_webhook_secret: Boolean(saved.webhook_secret && saved.webhook_secret.trim().length > 0),
    });
  } catch (err: any) {
    console.error('[API POST /api/admin/takeat/config error]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// 7. Listar Pedidos do Takeat (com filtros por status e por loja)
app.get('/api/admin/takeat/orders', requireAdminAuth, async (req, res) => {
  try {
    const status = (req.query.status as string) || undefined;
    const store = (req.query.store as string) || undefined;
    const orders = await takeatService.getOrders(status, store);
    const pendingCounts = await takeatService.getPendingCount();
    res.json({
      orders,
      pendingCount: pendingCounts.total,
      pendingCounts,
    });
  } catch (err: any) {
    console.error('[API GET /api/admin/takeat/orders error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 8. Contagem Rápida de Pedidos Pendentes (para badge pulsante no menu)
app.get('/api/admin/takeat/pending-count', requireAdminAuth, async (_req, res) => {
  try {
    const counts = await takeatService.getPendingCount();
    res.json({ count: counts.total, ...counts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Simular Pedido de Teste do Takeat (suporta Matriz ou Vinhedos)
app.post('/api/admin/takeat/simulate', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const { storeKey, store_key, neighborhood, items, customerName, total } = req.body;
    const targetStore = (String(storeKey || store_key || '').toUpperCase() === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ') as 'MATRIZ' | 'VINHEDOS';
    const order = await takeatService.simulateTestOrder({
      storeKey: targetStore,
      neighborhood,
      items,
      customerName,
      total,
    });
    const pendingCounts = await takeatService.getPendingCount();
    res.json({ success: true, order, pendingCount: pendingCounts.total, pendingCounts });
  } catch (err: any) {
    console.error('[API POST /api/admin/takeat/simulate error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 10. Sincronizar Pedidos da Takeat Ativamente via Chave REST (Polling / Pull)
app.post('/api/admin/takeat/sync', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const storeKey = ((req.body?.storeKey || req.body?.store_key || 'MATRIZ') as string).toUpperCase() === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ';
    const result = await takeatService.syncOrdersFromRestApi(storeKey);
    const pendingCounts = await takeatService.getPendingCount();
    res.json({
      ...result,
      pendingCount: pendingCounts.total,
      pendingCounts,
    });
  } catch (err: any) {
    console.error('[API POST /api/admin/takeat/sync error]', err.message);
    res.status(400).json({ error: err.message });
  }
});

// 7. Converter Pedido Takeat em Rota do Kantine Delivery
app.post('/api/admin/takeat/orders/:id/create-route', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: 'INVALID_ORDER_ID' });

    const { offerNow, modality, pickupPreset } = req.body;
    const result = await takeatService.convertOrderToRoute(orderId, {
      offerNow: Boolean(offerNow),
      modality: modality || 'MOTO',
      pickupPreset,
    });

    res.json({
      success: true,
      route: result.route,
      order: result.order,
    });
  } catch (err: any) {
    console.error(`[API POST /api/admin/takeat/orders/${req.params.id}/create-route error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// 8. Dispensar Pedido Takeat
app.post('/api/admin/takeat/orders/:id/dismiss', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: 'INVALID_ORDER_ID' });

    const updated = await takeatService.dismissOrder(orderId);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    console.error(`[API POST /api/admin/takeat/orders/${req.params.id}/dismiss error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// 9. Excluir Pedido Takeat
app.delete('/api/admin/takeat/orders/:id', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: 'INVALID_ORDER_ID' });

    await takeatService.deleteOrder(orderId);
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[API DELETE /api/admin/takeat/orders/${req.params.id} error]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Explicit API 404 handler so unmatched API routes never fall through to Vite SPA HTML shell
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API_ENDPOINT_NOT_FOUND', message: 'Rota de API não encontrada' });
});

// Dedicated favicon route to prevent 404/500/503 from browsers & proxies
app.get('/favicon.ico', (_req, res) => {
  const icoPath = path.resolve(__dirname, 'public', 'favicon.ico');
  if (fs.existsSync(icoPath)) {
    res.type('image/x-icon');
    return res.sendFile(icoPath);
  }
  const svgPath = path.resolve(__dirname, 'public', 'logo_kantine.svg');
  if (fs.existsSync(svgPath)) {
    res.type('image/svg+xml');
    return res.sendFile(svgPath);
  }
  res.status(204).end();
});

// Mount Vite in development or static dist in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexPath = path.resolve(distPath, 'index.html');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
    app.get('*', (_req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send(`<!doctype html><html><head><meta charset="UTF-8"><title>Kantine Delivery</title></head><body><div id="root">Carregando Kantine Delivery...</div></body></html>`);
      }
    });
  }

  // Global Express error handler preventing unhandled 500 crashes
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Express Global Error]:', err?.stack || err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err?.message || 'Erro interno no servidor' });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Kantine Delivery M1] Server running on http://0.0.0.0:${PORT}`);
  });

  initDbConstraints().catch((err) => {
    console.error('[initDbConstraints] Startup check warning:', err.message);
  });

  // Agendador interno: publica as ofertas programadas a cada minuto (a ponte do Zelo também dispara)
  setInterval(() => {
    scheduleService.tick().then((r) => {
      if (r.published || r.failed) console.log('[agendador]', JSON.stringify(r));
    }).catch((e) => console.warn('[agendador]', e?.message));
  }, 60_000);

  // Start Telegram Bot polling
  telegramBot.start().catch((err) => {
    console.error('[Kantine Delivery M1] Telegram Bot start error:', err.message);
  });
}

startServer().catch((err) => {
  console.error('[Kantine Delivery M1] Startup error:', err);
  process.exit(1);
});

