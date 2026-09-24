import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { driverService } from './src/server/driverService.ts';
import { deliveryService } from './src/server/deliveryService.ts';
import { telegramBot } from './src/server/telegramBot.ts';
import { requireAdminAuth, AuthRequest } from './src/middleware/auth.ts';
import { canReceiveDeliveryOffers } from './src/server/eligibility.ts';
import { DriverStatus, DeliveryStatus } from './src/server/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Security: Prevent Telegram token from ever appearing in any response or header
app.use((_req, res, next) => {
  res.removeHeader('X-Powered-By');
  next();
});

// Admin API Routes

// 1. List drivers (filtered by status: PENDING, ACTIVE, BLOCKED)
app.get('/api/admin/drivers', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as DriverStatus | undefined;
    if (status && !['PENDING', 'ACTIVE', 'BLOCKED'].includes(status)) {
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

// ==========================================
// M2 — Delivery Management API Endpoints
// ==========================================

// 10. List Deliveries (filtered by status: DRAFT, OFFERED, CANCELLED)
app.get('/api/admin/deliveries', requireAdminAuth, async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as DeliveryStatus | undefined;
    if (status && !['DRAFT', 'OFFERED', 'CANCELLED'].includes(status)) {
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
    res.status(500).json({ error: 'Failed to cancel delivery' });
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
