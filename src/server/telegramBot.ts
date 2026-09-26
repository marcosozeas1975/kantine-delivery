/**
 * Telegram Bot Service - Kantine Delivery M1
 * Long Polling mode.
 * STRICT SECURITY: TELEGRAM_BOT_TOKEN is never logged, never returned in responses, never exposed.
 */

import {
  VehicleType,
  VEHICLE_OPTIONS,
  getVehicleTypeLabel,
  parseVehicleInput,
  Driver,
  PixKeyType,
  Route,
  RouteStop,
} from './types.ts';
import {
  validateAndNormalizePix,
  maskPixKey,
  normalizeGeneralPhone,
} from './pixValidation.ts';
import {
  generateRouteNavigationLinks,
  buildGoogleMapsDestinationUrl,
} from './mapsNavigation.ts';
import { routeEditService } from './routeEditService.ts';

export function isMockChatId(chatId: any): boolean {
  if (!chatId) return true;
  const str = String(chatId).trim();
  if (/^(chat_|test_|mock_|fake_|sample_|invalid_|tg_)/i.test(str)) return true;
  if (!str.startsWith('@') && !/^-?\d+$/.test(str)) return true;
  return false;
}

/**
 * TG-ACCEPT & TG-PRIVACY:
 * Build closed route offer message for non-winning drivers.
 * Keeps route stops, deadline, and pickup visible as history,
 * but clearly indicates that the route is already accepted by another driver.
 * NEVER reveals winner's name, phone, telegram, vehicle, pix or personal data.
 */
export function buildRouteOfferClosedText(route: Route): string {
  const stopsCount = route.stops?.length || 1;
  const stopsHeader = stopsCount === 1 ? '1 ENTREGA' : `${stopsCount} ENTREGAS`;
  const numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  let stopsText = '';
  if (route.stops && route.stops.length > 0) {
    stopsText = route.stops
      .map((s, idx) => {
        const numEmoji = idx + 1 <= 10 ? numberEmojis[idx + 1] : `#${idx + 1}`;
        const deadlineLine = s.desired_deadline?.trim()
          ? `\n⏱️ Desejável: ${s.desired_deadline.trim()}`
          : '';
        return `${numEmoji} ${s.destination_neighborhood}${deadlineLine}`;
      })
      .join('\n\n');
  }

  let feeStr = (route.total_fee || '').trim();
  if (!feeStr.includes(',')) {
    const num = parseFloat(feeStr);
    if (!isNaN(num)) feeStr = num.toFixed(2).replace('.', ',');
  }

  const pickupNeighborhood = route.pickup_neighborhood_snapshot?.trim();
  const pickupNeighborhoodLine = pickupNeighborhood ? `\nBairro: ${pickupNeighborhood}` : '';

  return (
    `🔒 *ROTA #${route.id} — JÁ ACEITA POR OUTRO MOTORISTA*\n\n` +
    `📍 *RETIRADA:*\n${route.pickup_name}${pickupNeighborhoodLine}\n\n` +
    `📦 *${stopsHeader}*\n\n` +
    `${stopsText}\n\n` +
    `🏁 *ENCERRAMENTO MÁXIMO:*\n${route.final_deadline}\n\n` +
    `💰 *FRETE TOTAL:*\nR$ ${feeStr}\n\n` +
    `🔒 ROTA JÁ ACEITA POR OUTRO MOTORISTA`
  );
}

interface WizardState {
  step: 'NAME' | 'PHONE' | 'VEHICLE' | 'PIX_TYPE' | 'PIX_VALUE' | 'CONFIRM';
  data: {
    name?: string;
    phone?: string;
    vehicle_type?: VehicleType;
    pix_key_type?: PixKeyType;
    pix_key_value?: string;
    pix_key?: string;
    invite_token?: string;
  };
  lastPromptTime: number;
}

interface EditProfileState {
  driverId: number;
  field: 'NAME' | 'PHONE' | 'VEHICLE' | 'PIX_TYPE' | 'PIX_VALUE' | 'CONFIRM';
  pendingData: {
    name?: string;
    phone?: string;
    vehicle_type?: VehicleType;
    pix_key_type?: PixKeyType;
    pix_key_value?: string;
  };
}

interface M4DriverSession {
  mode: 'AWAITING_PIN' | 'AWAITING_PHOTO' | 'AWAITING_INCIDENT_NOTE';
  routeId: number;
  stopId: number;
}

interface ReferralSession {
  indicatorDriverId: number;
  step: 'AWAITING_NAME' | 'AWAITING_PHONE' | 'AWAITING_CONFIRMATION';
  data: {
    referredName?: string;
    referredPhone?: string;
  };
}

export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class TelegramBotService {
  private token: string | null = null;
  private isPolling = false;
  private shouldStop = false;
  private offset = 0;
  private sessions = new Map<string, WizardState>();
  private editSessions = new Map<string, EditProfileState>();
  private m4DriverSessions = new Map<string, M4DriverSession>();
  private referralSessions = new Map<string, ReferralSession>();
  private botInfo: { id: number; username: string; first_name: string } | null = null;
  private driverService: any = null;
  private deliveryService: any = null;
  private routeService: any = null;
  private referralService: any = null;
  private recentDispatches: Array<{
    method?: string;
    chatId: string | number;
    messageId?: string | number;
    text: string;
    markup?: any;
    timestamp: number;
  }> = [];

  constructor() {
    this.updateTokenFromEnv();
  }

  public getRecentDispatches() {
    return [...this.recentDispatches];
  }

  public clearRecentDispatches() {
    this.recentDispatches = [];
  }

  private recordRecentDispatch(entry: {
    method?: string;
    chatId: string | number;
    messageId?: string | number;
    text: string;
    markup?: any;
    timestamp: number;
  }) {
    this.recentDispatches.push(entry);
    if (this.recentDispatches.length > 200) {
      this.recentDispatches.shift();
    }
  }

  /**
   * Resolve public file URL from Telegram file_id (for photo proof viewing)
   */
  public async getFileUrl(fileId: string): Promise<string | null> {
    if (!this.token || !fileId) return null;
    try {
      const res = await this.callTelegramApi('getFile', { file_id: fileId });
      if (res && res.file_path) {
        return `https://api.telegram.org/file/bot${this.token}/${res.file_path}`;
      }
      return null;
    } catch (err: any) {
      console.warn('[TelegramBot.getFileUrl] Error:', err.message);
      return null;
    }
  }

  public updateTokenFromEnv(customToken?: string) {
    const raw = customToken || process.env.TELEGRAM_BOT_TOKEN;
    if (raw && raw.trim() && raw.trim() !== 'MY_TELEGRAM_BOT_TOKEN') {
      this.token = raw.trim();
    } else {
      this.token = null;
    }
  }

  public setDriverService(service: any) {
    this.driverService = service;
  }

  public setDeliveryService(service: any) {
    this.deliveryService = service;
  }

  public setRouteService(service: any) {
    this.routeService = service;
  }

  public setReferralService(service: any) {
    this.referralService = service;
  }

  public isConfigured(): boolean {
    return !!this.token;
  }

  public getStatus() {
    return {
      configured: !!this.token,
      polling: this.isPolling,
      botUsername: this.botInfo?.username || process.env.TELEGRAM_BOT_USERNAME || null,
      activeSessions: this.sessions.size,
    };
  }

  /**
   * Safe Telegram HTTP request helper
   * Never prints or leaks the token in logs or exceptions
   */
  private async callTelegramApi(method: string, body?: any, timeoutMs: number = 15000): Promise<any> {
    if ((method === 'sendMessage' || method === 'editMessageText' || method === 'editMessageReplyMarkup') && body?.chat_id) {
      this.recordRecentDispatch({
        method,
        chatId: body.chat_id,
        messageId: body.message_id,
        text: body.text || '',
        markup: body.reply_markup,
        timestamp: Date.now(),
      });
    }

    if (body?.chat_id && isMockChatId(body.chat_id)) {
      const parsedMsgId = body.message_id
        ? (typeof body.message_id === 'number' ? body.message_id : parseInt(String(body.message_id), 10))
        : Math.floor(100000 + Math.random() * 900000);

      return {
        message_id: !isNaN(parsedMsgId) ? parsedMsgId : Math.floor(100000 + Math.random() * 900000),
        chat: { id: body.chat_id, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: body.text || '',
      };
    }

    if (!this.token) {
      throw new Error('TELEGRAM_BOT_TOKEN_NOT_CONFIGURED');
    }

    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data: any = await response.json();
      if (!data.ok) {
        throw new Error(data.description || `Telegram API error: ${response.status}`);
      }
      return data.result;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`Telegram API request timed out after ${timeoutMs}ms`);
      }
      // Mask token if it inadvertently appeared in error message
      const sanitized =
        error?.message?.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]') ||
        'Telegram API error';
      throw new Error(sanitized);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async sendMessage(chatId: string | number, text: string, extra: any = {}): Promise<boolean> {
    if (!this.token && !isMockChatId(chatId)) {
      console.warn(`[Telegram] Skipping message to chat ${chatId}: TELEGRAM_BOT_TOKEN is not configured.`);
      return false;
    }

    const parseMode = extra.parse_mode !== undefined ? extra.parse_mode : 'Markdown';
    try {
      await this.callTelegramApi('sendMessage', {
        chat_id: chatId,
        text,
        ...extra,
        parse_mode: parseMode,
      });
      return true;
    } catch (err: any) {
      if (err.message && err.message.includes("can't parse entities")) {
        try {
          const plainText = text.replace(/<[^>]*>/g, '').replace(/[*_`]/g, '');
          const fallbackExtra = { ...extra };
          delete fallbackExtra.parse_mode;
          await this.callTelegramApi('sendMessage', {
            chat_id: chatId,
            text: plainText,
            ...fallbackExtra,
          });
          return true;
        } catch (fallbackErr: any) {
          console.warn(`[Telegram] Fallback message failed for chat ${chatId}:`, fallbackErr.message);
        }
      }
      const isExpectedUnreachable =
        err.message?.includes('chat not found') ||
        err.message?.includes('bot was blocked') ||
        err.message?.includes('user is deactivated') ||
        err.message?.includes('Forbidden');
      if (isExpectedUnreachable) {
        console.info(`[Telegram] Skipped message to chat ${chatId} (${err.message})`);
      } else {
        console.warn(`[Telegram] Failed to send message to chat ${chatId}:`, err.message);
      }
      return false;
    }
  }

  /**
   * M2/M3: Send delivery offer to an ACTIVE driver
   * Enforces strict privacy: never sends full destination address, customer name or phone.
   * Includes inline button [✅ ACEITAR ENTREGA] for atomic acceptance in M3.
   */
  public async sendDeliveryOffer(
    chatId: string | number,
    delivery: {
      id: number;
      pickup_location: string;
      destination_neighborhood: string;
      cargo_description: string;
      delivery_fee: string;
      delivery_mode: string;
      observations: string | null;
    }
  ): Promise<{ success: boolean; errorCode?: string; messageId?: string }> {
    if (!this.token) {
      return { success: false, errorCode: 'TELEGRAM_BOT_TOKEN_NOT_CONFIGURED' };
    }

    const modeLabel = delivery.delivery_mode === 'NO_CONTACT' ? 'Sem contato' : 'Presencial';
    const obsText = delivery.observations?.trim() ? delivery.observations.trim() : 'Nenhuma';
    
    // Normalize fee formatting to R$ X,XX
    let feeStr = delivery.delivery_fee.trim();
    if (!feeStr.includes(',')) {
      const num = parseFloat(feeStr);
      if (!isNaN(num)) feeStr = num.toFixed(2).replace('.', ',');
    }

    const text =
      `🛵 *NOVA ENTREGA #${delivery.id}*\n\n` +
      `📍 *Retirada:*\n${delivery.pickup_location}\n\n` +
      `🏁 *Destino:*\nBairro ${delivery.destination_neighborhood}\n\n` +
      `📦 *Carga:*\n${delivery.cargo_description}\n\n` +
      `💰 *Frete:*\nR$ ${feeStr}\n\n` +
      `🤝 *Modalidade:*\n${modeLabel}\n\n` +
      `⚠️ *Observação:*\n${obsText}`;

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '✅ ACEITAR ENTREGA',
            callback_data: `accept_delivery:${delivery.id}`,
          },
        ],
      ],
    };

    try {
      const result = await this.callTelegramApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      });
      return {
        success: true,
        messageId: result?.message_id ? String(result.message_id) : undefined,
      };
    } catch (err: any) {
      const isExpected =
        err.message?.includes('chat not found') ||
        err.message?.includes('bot was blocked') ||
        err.message?.includes('user is deactivated') ||
        err.message?.includes('Forbidden');
      if (isExpected) {
        console.info(`[Telegram] Skipped dispatch offer #${delivery.id} to chat ${chatId} (${err.message})`);
      } else {
        console.warn(`[Telegram] Failed to dispatch offer #${delivery.id} to chat ${chatId}:`, err.message);
      }
      return { success: false, errorCode: err.message || 'DISPATCH_FAILED' };
    }
  }

  /**
   * M3: Send confirmation to winning driver with full destination address revealed
   */
  public async sendDeliveryAcceptedWon(
    chatId: string | number,
    delivery: {
      id: number;
      pickup_location: string;
      destination_address: string;
      destination_neighborhood: string;
      cargo_description: string;
      delivery_fee: string;
      delivery_mode: string;
      observations: string | null;
    }
  ): Promise<boolean> {
    if (!this.token) return false;

    const modeLabel = delivery.delivery_mode === 'NO_CONTACT' ? 'Sem contato' : 'Presencial';
    const obsText = delivery.observations?.trim() ? delivery.observations.trim() : 'Nenhuma';
    let feeStr = delivery.delivery_fee.trim();
    if (!feeStr.includes(',')) {
      const num = parseFloat(feeStr);
      if (!isNaN(num)) feeStr = num.toFixed(2).replace('.', ',');
    }

    const text =
      `✅ *ENTREGA CONFIRMADA*\n\n` +
      `Entrega #${delivery.id} reservada para você!\n\n` +
      `📍 *Endereço de Entrega:*\n${delivery.destination_address}\n` +
      `Bairro: ${delivery.destination_neighborhood}\n\n` +
      `📦 *Carga:*\n${delivery.cargo_description}\n\n` +
      `💰 *Frete:*\nR$ ${feeStr}\n\n` +
      `🤝 *Modalidade:*\n${modeLabel}\n\n` +
      `⚠️ *Observação:*\n${obsText}`;

    return this.sendMessage(chatId, text);
  }

  /**
   * M3: Send notification to driver who attempted to accept an already taken delivery
   * Strictly preserves privacy: does NOT reveal winner's name, phone, or Telegram info
   */
  public async sendDeliveryAlreadyAccepted(chatId: string | number): Promise<boolean> {
    if (!this.token) return false;
    return this.sendMessage(chatId, '❌ Esta entrega já foi aceita por outro motorista.');
  }

  /**
   * M3: Acknowledge Telegram callback query with optional notification toast/alert
   */
  public async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert: boolean = false
  ): Promise<boolean> {
    if (!this.token || !callbackQueryId) return false;
    try {
      await this.callTelegramApi('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * M3: Invalidate or update offer button on other drivers' messages after delivery is accepted (UX improvement)
   */
  public async invalidateOfferMarkup(
    chatId: string | number,
    messageId: string | number
  ): Promise<boolean> {
    if (!this.token || !messageId) return false;
    try {
      await this.callTelegramApi('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🔒 Entrega já aceita',
                callback_data: 'noop_accepted',
              },
            ],
          ],
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * M2: Send cancellation notification to drivers who received the offer
   */
  public async sendDeliveryCancellation(
    chatId: string | number,
    deliveryId: number
  ): Promise<boolean> {
    if (!this.token) return false;
    const text = `❌ *ENTREGA #${deliveryId} CANCELADA*`;
    return this.sendMessage(chatId, text);
  }

  // ==========================================
  // M2.1: Multi-Stop Routes Messaging
  // ==========================================

  /**
   * TG-ACCEPT: Build closed message text for losing drivers.
   * Keeps route history visible, clearly indicates closed/accepted status,
   * and preserves strict winner privacy (NO winner name, phone, telegram, pix, vehicle).
   */
  public buildRouteOfferClosedText(route: Route): string {
    return buildRouteOfferClosedText(route);
  }

  /**
   * M2.1: Send route offer to eligible driver
   * Respects strict privacy before acceptance (Seção 26 & 27).
   */
  public async sendRouteOffer(
    chatId: string | number,
    route: Route,
    driverVehicle?: string
  ): Promise<{ success: boolean; errorCode?: string; messageId?: string }> {
    if (!this.token && !isMockChatId(chatId)) {
      return { success: false, errorCode: 'TELEGRAM_BOT_TOKEN_NOT_CONFIGURED' };
    }

    const stopsCount = route.stops?.length || 1;
    const stopsHeader = stopsCount === 1 ? '1 ENTREGA' : `${stopsCount} ENTREGAS`;

    const numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

    let stopsText = '';
    if (route.stops && route.stops.length > 0) {
      stopsText = route.stops
        .map((s, idx) => {
          const numEmoji = idx + 1 <= 10 ? numberEmojis[idx + 1] : `#${idx + 1}`;
          const deadlineLine = s.desired_deadline?.trim()
            ? `\n⏱️ Desejável: ${s.desired_deadline.trim()}`
            : '';
          return `${numEmoji} ${s.destination_neighborhood}${deadlineLine}`;
        })
        .join('\n\n');
    }

    // Normalize fee formatting to R$ X,XX
    let feeStr = route.total_fee.trim();
    if (!feeStr.includes(',')) {
      const num = parseFloat(feeStr);
      if (!isNaN(num)) feeStr = num.toFixed(2).replace('.', ',');
    }

    const pickupNeighborhood = route.pickup_neighborhood_snapshot?.trim();
    const pickupNeighborhoodLine = pickupNeighborhood ? `\nBairro: ${pickupNeighborhood}` : '';

    const text =
      `🛵 *NOVA ROTA #${route.id}*\n\n` +
      `📍 *RETIRADA:*\n${route.pickup_name}${pickupNeighborhoodLine}\n\n` +
      `📦 *${stopsHeader}*\n\n` +
      `${stopsText}\n\n` +
      `🏁 *ENCERRAMENTO MÁXIMO:*\n${route.final_deadline}\n\n` +
      `💰 *FRETE TOTAL:*\nR$ ${feeStr}\n\n` +
      `🚗 *Compatível com seu veículo*`;

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '✅ ACEITAR ROTA',
            callback_data: `accept_route:${route.id}:${route.route_version || 1}`,
          },
        ],
      ],
    };

    try {
      const result = await this.callTelegramApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      });
      return {
        success: true,
        messageId: result?.message_id ? String(result.message_id) : undefined,
      };
    } catch (err: any) {
      const isExpected =
        err.message?.includes('chat not found') ||
        err.message?.includes('bot was blocked') ||
        err.message?.includes('user is deactivated') ||
        err.message?.includes('Forbidden');
      if (isExpected) {
        console.info(`[Telegram] Skipped dispatch route offer #${route.id} to chat ${chatId} (${err.message})`);
      } else {
        console.warn(`[Telegram] Failed to dispatch route offer #${route.id} to chat ${chatId}:`, err.message);
      }
      return { success: false, errorCode: err.message || 'DISPATCH_FAILED' };
    }
  }

  /**
   * M4 Seção 7 & M4.3 Seção 12: Send confirmation to winning driver with pickup details, navigation links and arrival action
   */
  public async sendRouteAcceptedWon(
    chatId: string | number,
    route: Route
  ): Promise<boolean> {
    if (!this.token && !isMockChatId(chatId)) return false;

    const total = route.stops?.length || 0;
    const pickupNeighborhood = route.pickup_neighborhood_snapshot?.trim();
    const neighborhoodLine = pickupNeighborhood ? `\nBairro: ${pickupNeighborhood}` : '';

    const numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    let stopsSummary = '';
    if (route.stops && route.stops.length > 0) {
      const sortedStops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
      stopsSummary = sortedStops
        .map((s, idx) => {
          const numEmoji = idx + 1 <= 10 ? numberEmojis[idx + 1] : `#${idx + 1}`;
          return `${numEmoji} ${s.destination_neighborhood || s.destination_address}`;
        })
        .join('\n');
    }

    let feeStr = (route.total_fee || '').trim();
    if (!feeStr.includes(',')) {
      const num = parseFloat(feeStr);
      if (!isNaN(num)) feeStr = num.toFixed(2).replace('.', ',');
    }

    const navLinks = generateRouteNavigationLinks(route);

    let text =
      `✅ *ROTA #${route.id} ACEITA*\n\n` +
      `📍 *RETIRADA*\n` +
      `${route.pickup_name}\n` +
      `${route.pickup_address}${neighborhoodLine}\n\n` +
      `📦 *${total} ${total === 1 ? 'ENTREGA' : 'ENTREGAS'}*\n\n` +
      (stopsSummary ? `${stopsSummary}\n\n` : '') +
      (navLinks.maxStopsExceeded
        ? `ℹ️ Esta rota possui várias entregas. Utilize a navegação disponível em cada parada.\n\n`
        : '') +
      `💰 *FRETE*\nR$ ${feeStr}\n\n` +
      `🏁 *Encerramento desejado:*\n${route.final_deadline}`;

    const inlineKeyboard: any[] = [];

    // M4.3 Seção 8 & 12: Link geral no Google Maps (máximo 4 entregas)
    if (navLinks.generalRouteUrl) {
      inlineKeyboard.push([
        {
          text: '🗺️ ABRIR ROTA NO GOOGLE MAPS',
          url: navLinks.generalRouteUrl,
        },
      ]);
    }

    // M4.3 Seção 11 & 12: Link individual para Coleta
    if (navLinks.pickupUrl) {
      inlineKeyboard.push([
        {
          text: '🗺️ IR PARA COLETA',
          url: navLinks.pickupUrl,
        },
      ]);
    }

    // Preservar botão de confirmação de chegada na coleta
    inlineKeyboard.push([
      {
        text: '📦 CHEGUEI PARA COLETA',
        callback_data: `route_arrived_pickup:${route.id}`,
      },
    ]);

    return this.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });
  }

  /**
   * M4 Seção 11 & M4.3 Seção 10: Apresentação da Parada ao Motorista com link individual Maps
   */
  public async sendStopCard(
    chatId: string | number,
    route: Route,
    stop: RouteStop
  ): Promise<boolean> {
    const total = route.stops?.length || 1;
    const modeLabel = stop.delivery_mode === 'NO_CONTACT' ? 'SEM CONTATO' : 'PRESENCIAL';
    const desiredDeadline = stop.desired_deadline ? stop.desired_deadline : 'Não informado';
    const observations = stop.observations ? stop.observations : 'Nenhuma';

    const text =
      `📦 *ENTREGA ${stop.sequence} DE ${total}*\n\n` +
      `📍 *Endereço:*\n${stop.destination_address}\n\n` +
      `🏘️ *Bairro:*\n${stop.destination_neighborhood}\n\n` +
      `📦 *Pedido:*\n${stop.cargo_description}\n\n` +
      `⏱️ *Prazo desejável:*\n${desiredDeadline}\n\n` +
      `🤝 *Modalidade:*\n${modeLabel}\n\n` +
      `⚠️ *Observações:*\n${observations}`;

    const buttons: any[] = [];

    // M4.3 Seção 10: Link individual por parada
    if (stop.destination_address && stop.destination_address.trim().length > 0) {
      const stopMapsUrl = buildGoogleMapsDestinationUrl(stop.destination_address);
      if (stopMapsUrl) {
        buttons.push([
          {
            text: '🗺️ ABRIR NO MAPS',
            url: stopMapsUrl,
          },
        ]);
      }
    } else {
      console.warn(`[Google Maps] Parada #${stop.id} sem endereço válido para gerar navegação.`);
    }

    buttons.push([{ text: '📦 REALIZAR ENTREGA', callback_data: `stop_deliver:${stop.id}` }]);
    buttons.push([{ text: '⚠️ PROBLEMA NESTA ENTREGA', callback_data: `stop_incident:${stop.id}` }]);

    // M4 Seção 12: Preservar sequence como ordem recomendada, permitindo acessar outra parada pendente
    const pendingStops = (route.stops || []).filter((s) => s.status === 'PENDING' && s.id !== stop.id);
    if (pendingStops.length > 0) {
      buttons.push([
        { text: '🔄 VER OUTRAS PARADAS PENDENTES', callback_data: `route_choose_stop:${route.id}` },
      ]);
    }

    return this.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  }

  /**
   * M4 Seção 25: Resumo final para o motorista ao concluir a rota
   */
  public async sendFinalRouteSummary(
    chatId: string | number,
    routeId: number
  ): Promise<boolean> {
    const route = await this.routeService?.getRouteById(routeId);
    if (!route) return false;

    const total = route.stops?.length || 0;
    const deliveredCount = (route.stops || []).filter((s: RouteStop) => s.status === 'DELIVERED').length;
    const incidentCount = (route.stops || []).filter((s: RouteStop) => s.status === 'INCIDENT').length;

    const completedDate = route.completed_at ? new Date(route.completed_at) : new Date();
    const timeStr = completedDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const text =
      `🏁 *ROTA #${route.id} ENCERRADA*\n\n` +
      `📦 ${total} entregas\n\n` +
      `✅ Entregues: ${deliveredCount}\n` +
      `⚠️ Com problema: ${incidentCount}\n\n` +
      `⏱️ *Encerrada às:*\n${timeStr}\n\n` +
      `Obrigado.`;

    return this.sendMessage(chatId, text);
  }

  /**
   * M2.1: Send cancellation notification to drivers who received the route offer
   */
  public async sendRouteCancellation(
    chatId: string | number,
    routeId: number
  ): Promise<boolean> {
    if (!this.token && !isMockChatId(chatId)) return false;
    const text = `❌ *ROTA #${routeId} CANCELADA*`;
    return this.sendMessage(chatId, text);
  }

  /**
   * M4.4 Seção 11: Notificação de Correção Operacional pós-aceite ao motorista vencedor
   */
  public async sendRouteOperationalUpdate(
    chatId: string | number,
    route: Route,
    oldVersion: number,
    newVersion: number,
    diffSummary: string
  ): Promise<boolean> {
    if (!this.token && !isMockChatId(chatId)) return false;

    const navLinks = generateRouteNavigationLinks(route);

    const text =
      `⚠️ *ROTA #${route.id} ATUALIZADA*\n\n` +
      `A loja realizou uma correção na sua rota.\n\n` +
      `*Versão anterior:* ${oldVersion}\n` +
      `*Nova versão:* ${newVersion}\n\n` +
      `${diffSummary}\n\n` +
      `Confira os dados antes de continuar.`;

    const inlineKeyboard: any[] = [];

    // Link do Maps atualizado (Seção 18)
    if (navLinks.generalRouteUrl) {
      inlineKeyboard.push([
        {
          text: '🗺️ ABRIR ROTA ATUALIZADA',
          url: navLinks.generalRouteUrl,
        },
      ]);
    } else if (navLinks.pickupUrl) {
      inlineKeyboard.push([
        {
          text: '🗺️ ABRIR ROTA ATUALIZADA',
          url: navLinks.pickupUrl,
        },
      ]);
    }

    // Botão CIENTE (Seção 12)
    inlineKeyboard.push([
      {
        text: '✅ CIENTE',
        callback_data: `route_ack:${route.id}:${newVersion}`,
      },
    ]);

    return this.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });
  }

  /**
   * M4.4 Seção 14: Notificação de Alteração Material pendente de aprovação do motorista vencedor
   */
  public async sendRouteMaterialChangeProposal(
    chatId: string | number,
    route: Route,
    updateId: number,
    diffSummary: string
  ): Promise<boolean> {
    if (!this.token && !isMockChatId(chatId)) return false;

    const text =
      `⚠️ *ALTERAÇÃO IMPORTANTE — ROTA #${route.id}*\n\n` +
      `A loja alterou as condições da rota que você aceitou.\n\n` +
      `${diffSummary}\n\n` +
      `Você aceita as novas condições desta rota?`;

    const inlineKeyboard: any[] = [
      [
        {
          text: '✅ ACEITAR ALTERAÇÃO',
          callback_data: `route_mat_accept:${route.id}:${updateId}`,
        },
        {
          text: '❌ NÃO ACEITAR',
          callback_data: `route_mat_reject:${route.id}:${updateId}`,
        },
      ],
    ];

    return this.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });
  }

  /**
   * M4.4 Seção 14 & 15: Confirmação da decisão da alteração material
   */
  public async sendRouteMaterialDecisionConfirmation(
    chatId: string | number,
    route: Route,
    accepted: boolean
  ): Promise<boolean> {
    if (!this.token && !isMockChatId(chatId)) return false;

    if (accepted) {
      const navLinks = generateRouteNavigationLinks(route);
      const text =
        `✅ *ALTERAÇÃO APROVADA*\n\n` +
        `Você aceitou as novas condições da Rota #${route.id} (v${route.route_version}).\n` +
        `As novas informações já estão em vigor no seu painel.`;

      const inlineKeyboard: any[] = [];
      if (navLinks.generalRouteUrl) {
        inlineKeyboard.push([
          {
            text: '🗺️ ABRIR ROTA ATUALIZADA',
            url: navLinks.generalRouteUrl,
          },
        ]);
      } else if (navLinks.pickupUrl) {
        inlineKeyboard.push([
          {
            text: '🗺️ ABRIR ROTA ATUALIZADA',
            url: navLinks.pickupUrl,
          },
        ]);
      }

      return this.sendMessage(chatId, text, {
        reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined,
      });
    } else {
      const text =
        `❌ *ALTERAÇÃO RECUSADA*\n\n` +
        `Você não aceitou a alteração da Rota #${route.id}.\n` +
        `As condições anteriores da rota continuam válidas e vigentes.`;

      return this.sendMessage(chatId, text);
    }
  }

  /**
   * TG-ACCEPT: Invalidate route offer for losing driver.
   * Primary: editMessageText to display closed message & remove inline keyboard completely.
   * Fallback: if editMessageText fails or messageId is not available:
   *   1. try editMessageReplyMarkup with empty keyboard ({ inline_keyboard: [] })
   *   2. send short message: "🔒 A Rota #X já foi aceita por outro motorista."
   */
  public async invalidateRouteOffer(
    chatId: string | number,
    messageId: string | number | null | undefined,
    route: Route
  ): Promise<{
    success: boolean;
    mode: 'EDITED_TEXT' | 'FALLBACK_SENT' | 'FALLBACK_SENT_NO_MESSAGE_ID' | 'FAILED';
    error?: string;
  }> {
    if (!this.token && !isMockChatId(chatId)) {
      return { success: false, mode: 'FAILED', error: 'TELEGRAM_BOT_TOKEN_NOT_CONFIGURED' };
    }

    const numMessageId = messageId ? parseInt(String(messageId), 10) : null;
    const closedText = buildRouteOfferClosedText(route);

    // Primary: try editMessageText with empty reply markup (removes inline keyboard completely)
    if (numMessageId && !isNaN(numMessageId)) {
      try {
        await this.callTelegramApi('editMessageText', {
          chat_id: chatId,
          message_id: numMessageId,
          text: closedText,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [],
          },
        });
        return { success: true, mode: 'EDITED_TEXT' };
      } catch (primaryErr: any) {
        console.warn(
          `[TelegramBot] Primary editMessageText failed for route #${route.id} (chat ${chatId}, msg ${messageId}): ${primaryErr.message}. Executing fallback...`
        );

        // Fallback Step 1: try removing inline keyboard on the original message
        try {
          await this.callTelegramApi('editMessageReplyMarkup', {
            chat_id: chatId,
            message_id: numMessageId,
            reply_markup: {
              inline_keyboard: [],
            },
          });
        } catch (markupErr: any) {
          console.warn(
            `[TelegramBot] Fallback editMessageReplyMarkup failed for route #${route.id} (chat ${chatId}): ${markupErr.message}`
          );
        }

        // Fallback Step 2: send short fallback message
        try {
          const fallbackText = `🔒 A Rota #${route.id} já foi aceita por outro motorista.`;
          await this.sendMessage(chatId, fallbackText);
          return { success: true, mode: 'FALLBACK_SENT', error: primaryErr.message };
        } catch (fallbackErr: any) {
          console.error(
            `[TelegramBot] Fallback sendMessage failed for route #${route.id} (chat ${chatId}): ${fallbackErr.message}`
          );
          return { success: false, mode: 'FAILED', error: fallbackErr.message };
        }
      }
    } else {
      // No message ID available to edit -> send short fallback message directly
      try {
        const fallbackText = `🔒 A Rota #${route.id} já foi aceita por outro motorista.`;
        await this.sendMessage(chatId, fallbackText);
        return { success: true, mode: 'FALLBACK_SENT_NO_MESSAGE_ID' };
      } catch (err: any) {
        console.error(
          `[TelegramBot] Fallback notification failed for route #${route.id} (chat ${chatId}, no message_id): ${err.message}`
        );
        return { success: false, mode: 'FAILED', error: err.message };
      }
    }
  }

  /**
   * M2.1 & M3: Invalidate or update offer button on other drivers' messages after route is accepted.
   * Completely removes inline keyboard ({ inline_keyboard: [] }) so no actionable button remains.
   */
  public async invalidateRouteOfferMarkup(
    chatId: string | number,
    messageId: string | number
  ): Promise<boolean> {
    if (!this.token && !isMockChatId(chatId)) return false;
    if (!messageId) return false;
    const numMessageId = parseInt(String(messageId), 10);
    if (isNaN(numMessageId)) return false;
    try {
      await this.callTelegramApi('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: numMessageId,
        reply_markup: {
          inline_keyboard: [],
        },
      });
      return true;
    } catch (err: any) {
      console.warn(`[TelegramBot.invalidateRouteOfferMarkup] Error for chat ${chatId}, msg ${messageId}:`, err.message);
      return false;
    }
  }

  public async start() {
    if (!this.token) {
      console.log('[Telegram Bot] TELEGRAM_BOT_TOKEN not configured. Polling not started.');
      return;
    }

    if (this.isPolling) return;

    try {
      const me = await this.callTelegramApi('getMe');
      this.botInfo = me;
      console.log(`[Telegram Bot] Connected successfully as @${me.username} (${me.first_name})`);
    } catch (err: any) {
      console.error('[Telegram Bot] Could not connect to Telegram API:', err.message);
      return;
    }

    this.isPolling = true;
    this.shouldStop = false;
    this.pollLoop().catch((err) => {
      console.error('[Telegram Bot] Fatal polling loop error:', err.message);
      this.isPolling = false;
    });
  }

  public stop() {
    this.shouldStop = true;
    this.isPolling = false;
  }

  private async pollLoop() {
    console.log('[Telegram Bot] Starting long polling loop...');
    let consecutiveTransientErrors = 0;

    while (!this.shouldStop && this.token) {
      try {
        const updates = await this.callTelegramApi(
          'getUpdates',
          {
            offset: this.offset,
            timeout: 10,
            allowed_updates: ['message', 'callback_query'],
          },
          18000
        );

        consecutiveTransientErrors = 0;

        if (Array.isArray(updates)) {
          for (const update of updates) {
            this.offset = Math.max(this.offset, update.update_id + 1);
            await this.handleUpdate(update).catch((e) =>
              console.warn('[Telegram Bot] Error handling update:', e.message)
            );
          }
        }
      } catch (err: any) {
        if (this.shouldStop) break;

        const errMsg = err?.message || String(err);
        const isTransientNetwork =
          errMsg.includes('fetch failed') ||
          errMsg.includes('timed out') ||
          errMsg.includes('aborted') ||
          errMsg.includes('ECONNRESET') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('EAI_AGAIN') ||
          errMsg.includes('UND_ERR_');

        if (isTransientNetwork) {
          consecutiveTransientErrors++;
          const waitTimeMs = Math.min(1000 * Math.pow(1.5, Math.min(consecutiveTransientErrors, 5)), 10000);
          console.log(`[Telegram Bot] Polling connection cycle (${errMsg}). Reconnecting in ${Math.round(waitTimeMs / 1000)}s...`);
          await new Promise((r) => setTimeout(r, waitTimeMs));
        } else if (errMsg.includes('401') || errMsg.includes('Unauthorized') || errMsg.includes('Not Found')) {
          console.warn('[Telegram Bot] Invalid or revoked bot token. Pausing polling until token update:', errMsg);
          this.isPolling = false;
          return;
        } else {
          console.warn('[Telegram Bot] Polling issue (retrying in 5s):', errMsg);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }
    this.isPolling = false;
    console.log('[Telegram Bot] Polling stopped.');
  }

  /**
   * Helper to build 2-column inline keyboard for vehicle types
   */
  private getVehicleInlineKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: '🚗 CARRO HATCH', callback_data: 'veh_CAR_HATCH' },
          { text: '🚘 CARRO SEDAN', callback_data: 'veh_CAR_SEDAN' },
        ],
        [
          { text: '🚙 CARRO SW', callback_data: 'veh_CAR_SW' },
          { text: '🏍️ MOTO COM BAG', callback_data: 'veh_MOTO_WITH_BAG' },
        ],
        [
          { text: '🏍️ MOTO SEM BAG', callback_data: 'veh_MOTO_WITHOUT_BAG' },
          { text: '🚚 OUTRO', callback_data: 'veh_OTHER' },
        ],
      ],
    };
  }

  /**
   * Handle incoming Telegram message or callback query
   */
  public async handleUpdate(update: any) {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    const message = update.message;
    if (!message || !message.from) return;

    const telegramUserId = message.from.id.toString();
    const chatId = message.chat.id.toString();
    const rawText = (message.text || '').trim();

    // Check for /start command (supports /start, /start <payload>, /start=<payload>)
    const isStart = rawText === '/start' || rawText.startsWith('/start ') || rawText.startsWith('/start=');
    if (isStart) {
      const payload = rawText.replace(/^\/start[= ]*/, '').trim();
      await this.handleStartCommand(telegramUserId, chatId, message.from, payload);
      return;
    }

    // Direct access to profile via commands
    const lowerText = rawText.toLowerCase();
    if (
      lowerText === '/meuperfil' ||
      lowerText === '/meucadastro' ||
      lowerText === '/perfil' ||
      lowerText === 'meu perfil' ||
      lowerText === 'meu cadastro' ||
      lowerText === '👤 meu cadastro'
    ) {
      this.editSessions.delete(telegramUserId);
      if (this.driverService) {
        const existing = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (existing) {
          await this.sendMyProfile(chatId, telegramUserId);
          return;
        }
      }
    }

    // M1.2: Commands to refer a driver or see referrals
    if (
      lowerText === '/indicar' ||
      lowerText === '/indicarmotorista' ||
      lowerText === 'indicar motorista' ||
      lowerText === '👥 indicar motorista'
    ) {
      await this.startReferralFlow(telegramUserId, chatId);
      return;
    }

    if (
      lowerText === '/minhasindicacoes' ||
      lowerText === '/indicacoes' ||
      lowerText === 'minhas indicações' ||
      lowerText === 'minhas indicacoes' ||
      lowerText === '📋 minhas indicações' ||
      lowerText === '📋 minhas indicacoes'
    ) {
      await this.showMyReferrals(telegramUserId, chatId);
      return;
    }

    // Check if user has an active referral creation session (M1.2)
    const referralSession = this.referralSessions.get(telegramUserId);
    if (referralSession) {
      await this.processReferralInput(telegramUserId, chatId, rawText, referralSession);
      return;
    }

    // Check if user has an active profile editing session
    const editSession = this.editSessions.get(telegramUserId);
    if (editSession) {
      await this.processEditInput(telegramUserId, chatId, rawText, editSession);
      return;
    }

    // Check if user has an active M4 operational delivery session (PIN input, Photo proof, or Incident note)
    const m4Session = this.m4DriverSessions.get(telegramUserId);
    if (m4Session) {
      await this.processM4Input(telegramUserId, chatId, message, m4Session);
      return;
    }

    // Check if user has an active registration session
    const session = this.sessions.get(telegramUserId);
    if (!session) {
      // User is not in registration/editing and didn't send /start
      // Check if driver is already registered
      if (this.driverService) {
        const existing = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (existing) {
          await this.sendMainMenu(chatId, existing);
          return;
        }
      }

      // M1.2 Section 20: Closed registration
      await this.sendMessage(
        chatId,
        '👋 *Kantine Entregas*\n\n' +
          'O cadastro de novos motoristas é realizado somente por convite.\n\n' +
          'Se você recebeu uma indicação aprovada, utilize o link de convite enviado pelo motorista que fez sua indicação.'
      );
      return;
    }

    // Process Wizard steps
    await this.processWizardInput(telegramUserId, chatId, rawText, session);
  }

  private async handleStartCommand(
    telegramUserId: string,
    chatId: string,
    fromUser: any,
    payload?: string
  ) {
    // Clear any lingering session
    this.sessions.delete(telegramUserId);
    this.editSessions.delete(telegramUserId);
    this.referralSessions.delete(telegramUserId);

    // M1.1 & M1.2 Section 21: Existing drivers are NEVER asked for invite
    if (this.driverService) {
      const existing = await this.driverService.getDriverByTelegramUserId(telegramUserId);
      if (existing) {
        await this.sendMainMenu(chatId, existing);
        return;
      }
    }

    // M1.2: Check if payload has an invite token
    if (payload && payload.trim()) {
      const cleanToken = payload.replace(/^invite_/, '').trim();
      const refSvc = this.referralService || (await import('./referralService.ts')).referralService;

      // 1. Check in driver_referrals (M1.2)
      try {
        const validation = await refSvc.validateInviteToken(cleanToken);
        if (validation.valid && validation.referral) {
          const ref = validation.referral;

          // Check if already bound to another user
          if (validation.alreadyBoundUser && validation.alreadyBoundUser !== telegramUserId) {
            await this.sendMessage(
              chatId,
              '❌ *Este convite já foi utilizado por outro usuário.*'
            );
            return;
          }

          // Consume / bind invite to this Telegram user
          try {
            await refSvc.consumeInvite(cleanToken, telegramUserId);
          } catch (consumeErr: any) {
            if (consumeErr.message?.includes('ANOTHER_USER')) {
              await this.sendMessage(
                chatId,
                '❌ *Este convite já foi utilizado por outro usuário.*'
              );
              return;
            }
            await this.sendMessage(
              chatId,
              `❌ ${consumeErr.message}`
            );
            return;
          }

          // Start registration wizard for the nominee
          this.sessions.set(telegramUserId, {
            step: 'NAME',
            data: {
              name: ref.referred_name || undefined,
              phone: ref.referred_phone || undefined,
              invite_token: cleanToken,
            },
            lastPromptTime: Date.now(),
          });

          await this.sendMessage(
            chatId,
            `👋 Olá, *${escapeHtml(ref.referred_name)}*! Seu convite foi validado com sucesso. 🚀\n\n` +
              `Para dar início ao seu cadastro na Kantine Delivery, por favor confirme seu *nome completo*:`
          );
          return;
        }

        if (validation.error === 'TOKEN_EXPIRED') {
          await this.sendMessage(
            chatId,
            '❌ *Este convite expirou.*\n\nPeça ao motorista que realizou sua indicação para solicitar uma nova autorização à Kantine.'
          );
          return;
        }
      } catch (err: any) {
        console.warn('[TelegramBot] Validation of referral token failed:', err.message);
      }

      // 2. Fallback check for legacy M1 driverInvitations
      if (this.driverService?.getInviteByToken) {
        try {
          const legacyInvite = await this.driverService.getInviteByToken(cleanToken);
          if (legacyInvite && legacyInvite.status === 'PENDING') {
            this.sessions.set(telegramUserId, {
              step: 'NAME',
              data: {
                name: legacyInvite.name || undefined,
                phone: legacyInvite.phone || undefined,
                invite_token: cleanToken,
              },
              lastPromptTime: Date.now(),
            });
            await this.sendMessage(
              chatId,
              `👋 Olá, *${escapeHtml(legacyInvite.name || 'Motorista')}*! Seu convite foi validado.\n\nPor favor confirme seu *nome completo*:`
            );
            return;
          }
        } catch {
          // ignore
        }
      }

      // Invalid token
      await this.sendMessage(
        chatId,
        '❌ *Convite inválido ou não encontrado.*\n\nVerifique o link enviado pelo motorista que realizou sua indicação.'
      );
      return;
    }

    // M1.2 Section 20: NO INVITE AND NOT REGISTERED -> CLOSED REGISTRATION!
    const closedMsg =
      `👋 *Kantine Entregas*\n\n` +
      `O cadastro de novos motoristas é realizado somente por convite.\n\n` +
      `Se você recebeu uma indicação aprovada, utilize o link de convite enviado pelo motorista que fez sua indicação.`;

    await this.sendMessage(chatId, closedMsg);
  }

  private async sendMainMenu(chatId: string, driver: Driver) {
    const firstName = driver.name.split(' ')[0] || driver.name;
    const statusLabel =
      driver.status === 'ACTIVE'
        ? 'ATIVO'
        : driver.status === 'PENDING'
        ? 'AGUARDANDO APROVAÇÃO'
        : 'BLOQUEADO';

    const msg =
      `<b>KANTINE ENTREGAS</b>\n\n` +
      `Olá, ${escapeHtml(firstName)}.\n\n` +
      `<b>Status:</b> ${escapeHtml(statusLabel)}`;

    const buttons: any[] = [
      [{ text: '👤 MEU CADASTRO', callback_data: 'menu_my_profile' }],
    ];

    if (driver.status === 'ACTIVE') {
      buttons.push([
        { text: '👥 INDICAR MOTORISTA', callback_data: 'menu_refer_driver' },
        { text: '📋 MINHAS INDICAÇÕES', callback_data: 'menu_my_referrals' },
      ]);
    } else {
      buttons.push([
        { text: '📋 MINHAS INDICAÇÕES', callback_data: 'menu_my_referrals' },
      ]);
    }

    await this.sendMessage(chatId, msg, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  }

  private async sendMyProfile(chatId: string, telegramUserId: string) {
    if (!this.driverService) return;
    const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
    if (!driver) {
      await this.sendMessage(chatId, 'Cadastro não encontrado.');
      return;
    }

    const vehicleFriendly = getVehicleTypeLabel(driver.vehicle_type);
    const pixTypeDisplay = driver.pix_key_type === 'REQUIRES_UPDATE' ? '' : `${driver.pix_key_type} `;
    const pixMasked = maskPixKey(driver.pix_key_type, driver.pix_key_value || driver.pix_key);

    const msg =
      `👤 <b>MEU CADASTRO</b>\n\n` +
      `<b>Nome:</b> ${escapeHtml(driver.name)}\n` +
      `<b>Telefone:</b> ${escapeHtml(driver.phone)}\n` +
      `<b>Veículo:</b> ${escapeHtml(vehicleFriendly)}\n` +
      `<b>Pix:</b> ${escapeHtml(pixTypeDisplay + pixMasked)}`;

    await this.sendMessage(chatId, msg, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ ALTERAR NOME', callback_data: 'edit_profile_name' }],
          [{ text: '📱 ALTERAR TELEFONE', callback_data: 'edit_profile_phone' }],
          [{ text: '🚗 ALTERAR VEÍCULO', callback_data: 'edit_profile_vehicle' }],
          [{ text: '💳 ALTERAR PIX', callback_data: 'edit_profile_pix' }],
          [{ text: '↩️ VOLTAR', callback_data: 'menu_start' }],
        ],
      },
    });
  }

  /**
   * M1.2: Start nomination flow for ACTIVE drivers
   */
  public async startReferralFlow(telegramUserId: string, chatId: string) {
    if (!this.driverService) {
      await this.sendMessage(chatId, 'Serviço temporariamente indisponível.');
      return;
    }
    const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
    if (!driver || driver.status !== 'ACTIVE') {
      await this.sendMessage(
        chatId,
        '⚠️ *Apenas motoristas com cadastro ATIVO podem indicar novos motoristas.*'
      );
      return;
    }

    this.editSessions.delete(telegramUserId);
    this.sessions.delete(telegramUserId);
    this.referralSessions.set(telegramUserId, {
      indicatorDriverId: driver.id,
      step: 'AWAITING_NAME',
      data: {},
    });

    const msg =
      `👥 *INDICAÇÃO DE MOTORISTA*\n\n` +
      `Como motorista ativo, você pode indicar novos profissionais para a Kantine Delivery.\n\n` +
      `Digite o *nome completo* do indicado:`;

    await this.sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: [[{ text: '❌ CANCELAR', callback_data: 'cancel_referral' }]],
      },
    });
  }

  /**
   * M1.2: Process input during referral creation wizard
   */
  private async processReferralInput(
    telegramUserId: string,
    chatId: string,
    rawText: string,
    session: ReferralSession
  ) {
    const normalized = rawText.toUpperCase().trim();
    if (normalized === 'CANCELAR' || normalized === '/CANCEL') {
      this.referralSessions.delete(telegramUserId);
      await this.sendMessage(chatId, '❌ Indicação cancelada.\nNenhum dado foi salvo.');
      const driver = await this.driverService?.getDriverById(session.indicatorDriverId);
      if (driver) await this.sendMainMenu(chatId, driver);
      return;
    }

    if (session.step === 'AWAITING_NAME') {
      const name = rawText.trim();
      if (name.length < 2) {
        await this.sendMessage(
          chatId,
          '❌ Nome inválido. Por favor, digite o *nome completo* do indicado (mínimo 2 letras):',
          {
            reply_markup: {
              inline_keyboard: [[{ text: '❌ CANCELAR', callback_data: 'cancel_referral' }]],
            },
          }
        );
        return;
      }

      session.data.referredName = name;
      session.step = 'AWAITING_PHONE';

      await this.sendMessage(
        chatId,
        `Ótimo! Agora digite o *telefone com DDD* de *${escapeHtml(name)}* (ex: 34999999999):`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '❌ CANCELAR', callback_data: 'cancel_referral' }]],
          },
        }
      );
      return;
    }

    if (session.step === 'AWAITING_PHONE') {
      let canonicalPhone = '';
      try {
        const refSvc = this.referralService || (await import('./referralService.ts')).referralService;
        canonicalPhone = refSvc.normalizePhone(rawText);
      } catch {
        await this.sendMessage(
          chatId,
          '❌ Telefone inválido. Por favor, digite o telefone com DDD (ex: 34999999999):',
          {
            reply_markup: {
              inline_keyboard: [[{ text: '❌ CANCELAR', callback_data: 'cancel_referral' }]],
            },
          }
        );
        return;
      }

      session.data.referredPhone = canonicalPhone;
      session.step = 'AWAITING_CONFIRMATION';

      const refSvc = this.referralService || (await import('./referralService.ts')).referralService;
      const formattedPhone = refSvc.formatPhoneDisplay(canonicalPhone);

      // Section 8: Confirmation Screen
      const confirmMsg =
        `👥 *NOVA INDICAÇÃO*\n\n` +
        `*Nome:*\n${escapeHtml(session.data.referredName)}\n\n` +
        `*Telefone:*\n${escapeHtml(formattedPhone)}\n\n` +
        `Confirma o envio da indicação para análise da Kantine?`;

      await this.sendMessage(chatId, confirmMsg, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ CONFIRMAR INDICAÇÃO', callback_data: 'confirm_referral' }],
            [{ text: '❌ CANCELAR', callback_data: 'cancel_referral' }],
          ],
        },
      });
      return;
    }

    if (session.step === 'AWAITING_CONFIRMATION') {
      if (normalized === 'CONFIRMAR' || normalized === 'CONFIRMAR INDICAÇÃO') {
        await this.commitReferral(telegramUserId, chatId, session);
        return;
      }
      await this.sendMessage(chatId, 'Utilize os botões abaixo para confirmar ou cancelar a indicação:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ CONFIRMAR INDICAÇÃO', callback_data: 'confirm_referral' }],
            [{ text: '❌ CANCELAR', callback_data: 'cancel_referral' }],
          ],
        },
      });
    }
  }

  /**
   * M1.2: Commit the referral after indicator confirmation
   */
  private async commitReferral(telegramUserId: string, chatId: string, session: ReferralSession) {
    try {
      const driver = await this.driverService?.getDriverById(session.indicatorDriverId);
      if (!driver || driver.status !== 'ACTIVE') {
        this.referralSessions.delete(telegramUserId);
        await this.sendMessage(
          chatId,
          '⚠️ *Apenas motoristas com cadastro ATIVO podem realizar indicações.*'
        );
        return;
      }

      const refSvc = this.referralService || (await import('./referralService.ts')).referralService;
      await refSvc.createReferral(
        session.indicatorDriverId,
        session.data.referredName!,
        session.data.referredPhone!
      );

      this.referralSessions.delete(telegramUserId);

      // Section 11 of prompt: Exact response wording
      const msg =
        `✅ *Indicação enviada para análise.*\n\n` +
        `A Kantine precisa aprovar a indicação antes que o motorista indicado possa realizar o cadastro.\n\n` +
        `Você poderá acompanhar o status em "Minhas Indicações".`;

      await this.sendMessage(chatId, msg, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 MINHAS INDICAÇÕES', callback_data: 'menu_my_referrals' }],
            [{ text: '↩️ MENU PRINCIPAL', callback_data: 'menu_start' }],
          ],
        },
      });
    } catch (err: any) {
      console.error('[Telegram Bot] Referral commit error:', err.message);
      this.referralSessions.delete(telegramUserId);
      await this.sendMessage(chatId, `Erro ao criar indicação: ${err.message}`);
    }
  }

  /**
   * M1.2: Display indicator driver's referrals
   */
  public async showMyReferrals(telegramUserId: string, chatId: string) {
    if (!this.driverService) return;
    const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
    if (!driver) {
      await this.sendMessage(chatId, 'Cadastro não encontrado.');
      return;
    }

    const refSvc = this.referralService || (await import('./referralService.ts')).referralService;
    const list = await refSvc.getReferralsByDriverId(driver.id);

    if (list.length === 0) {
      const emptyMsg =
        `📋 *MINHAS INDICAÇÕES*\n\n` +
        `Você ainda não realizou nenhuma indicação.\n\n` +
        (driver.status === 'ACTIVE'
          ? `Como motorista ativo, você pode indicar novos parceiros pelo botão *👥 INDICAR MOTORISTA*.`
          : `Quando seu cadastro estiver ativo, você poderá indicar novos motoristas.`);

      const buttons: any[] = [];
      if (driver.status === 'ACTIVE') {
        buttons.push([{ text: '👥 INDICAR MOTORISTA', callback_data: 'menu_refer_driver' }]);
      }
      buttons.push([{ text: '↩️ MENU PRINCIPAL', callback_data: 'menu_start' }]);

      await this.sendMessage(chatId, emptyMsg, {
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    // Section 18 & 19: Friendly display with NO sensitive personal data
    let text = `📋 *MINHAS INDICAÇÕES*\n\n`;
    for (const r of list) {
      text += `👥 *${escapeHtml(r.referred_name)}*\n`;
      text += `Status: *${escapeHtml(r.friendly_status)}*\n`;
      if (r.status === 'APPROVED' && r.invitation_expires_at) {
        const expiresStr = new Date(r.invitation_expires_at).toLocaleDateString('pt-BR');
        text += `Convite válido até: ${expiresStr}\n`;
        if (r.invite_link) {
          text += `🔗 Convite: \`${r.invite_link}\`\n`;
        }
      }
      text += `\n`;
    }

    const buttons: any[] = [];
    if (driver.status === 'ACTIVE') {
      buttons.push([{ text: '👥 INDICAR NOVO MOTORISTA', callback_data: 'menu_refer_driver' }]);
    }
    buttons.push([{ text: '↩️ MENU PRINCIPAL', callback_data: 'menu_start' }]);

    await this.sendMessage(chatId, text.trim(), {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  private async processWizardInput(
    telegramUserId: string,
    chatId: string,
    text: string,
    session: WizardState
  ) {
    // Check for cancel text commands
    const normalized = text.toUpperCase();
    if (normalized === 'CANCELAR' || normalized === '/CANCEL') {
      this.sessions.delete(telegramUserId);
      await this.sendMessage(
        chatId,
        'Cadastro cancelado.\nQuando quiser recomeçar, envie /start.',
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    if (session.step === 'NAME') {
      if (!text || text.length < 2) {
        await this.sendMessage(chatId, 'Por favor, informe um nome válido (mínimo 2 letras):');
        return;
      }
      session.data.name = text.trim();
      session.step = 'PHONE';
      await this.sendMessage(chatId, 'Informe seu *telefone com DDD* (ex: 34999999999):');
      return;
    }

    if (session.step === 'PHONE') {
      const cleaned = text.replace(/\D/g, '');
      if (cleaned.length < 8) {
        await this.sendMessage(
          chatId,
          'Telefone inválido. Por favor, informe seu telefone com DDD (ex: 34999999999):'
        );
        return;
      }
      session.data.phone = normalizeGeneralPhone(text);
      session.step = 'VEHICLE';

      // Send vehicle selection with 2-column inline keyboard
      await this.sendMessage(chatId, 'Selecione o *tipo de veículo*:', {
        reply_markup: this.getVehicleInlineKeyboard(),
      });
      return;
    }

    if (session.step === 'VEHICLE') {
      const parsed = parseVehicleInput(text);

      if (!parsed) {
        await this.sendMessage(chatId, 'Selecione uma das opções abaixo:', {
          reply_markup: this.getVehicleInlineKeyboard(),
        });
        return;
      }

      session.data.vehicle_type = parsed;
      session.step = 'PIX_TYPE';
      await this.sendMessage(
        chatId,
        'Selecione o *tipo de chave Pix* para recebimento dos repasses:',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'CPF', callback_data: 'reg_pixtype:CPF' },
                { text: 'TELEFONE', callback_data: 'reg_pixtype:PHONE' },
              ],
              [
                { text: 'E-MAIL', callback_data: 'reg_pixtype:EMAIL' },
                { text: 'ALEATÓRIA', callback_data: 'reg_pixtype:RANDOM' },
              ],
            ],
          },
        }
      );
      return;
    }

    if (session.step === 'PIX_TYPE') {
      const upper = text.toUpperCase();
      let selectedType: PixKeyType | null = null;
      if (upper === 'CPF') selectedType = 'CPF';
      else if (upper === 'TELEFONE' || upper === 'PHONE') selectedType = 'PHONE';
      else if (upper === 'EMAIL' || upper === 'E-MAIL') selectedType = 'EMAIL';
      else if (upper === 'ALEATÓRIA' || upper === 'ALEATORIA' || upper === 'RANDOM') selectedType = 'RANDOM';

      if (!selectedType) {
        await this.sendMessage(chatId, 'Selecione o *tipo de chave Pix*:', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'CPF', callback_data: 'reg_pixtype:CPF' },
                { text: 'TELEFONE', callback_data: 'reg_pixtype:PHONE' },
              ],
              [
                { text: 'E-MAIL', callback_data: 'reg_pixtype:EMAIL' },
                { text: 'ALEATÓRIA', callback_data: 'reg_pixtype:RANDOM' },
              ],
            ],
          },
        });
        return;
      }

      session.data.pix_key_type = selectedType;
      session.step = 'PIX_VALUE';
      let promptMsg = 'Informe sua chave Pix:';
      if (selectedType === 'CPF') promptMsg = 'Informe o *CPF* utilizado como chave Pix:';
      if (selectedType === 'PHONE') promptMsg = 'Informe o *telefone com DDD* utilizado como chave Pix (ex: 34999999999):';
      if (selectedType === 'EMAIL') promptMsg = 'Informe o *e-mail* utilizado como chave Pix:';
      if (selectedType === 'RANDOM') promptMsg = 'Informe a *chave aleatória (UUID)* utilizada como chave Pix:';
      await this.sendMessage(chatId, promptMsg);
      return;
    }

    if (session.step === 'PIX_VALUE' || (session.step as any) === 'PIX') {
      const pType = session.data.pix_key_type || 'CPF';
      const valRes = validateAndNormalizePix(pType, text);
      if (!valRes.isValid) {
        await this.sendMessage(
          chatId,
          `❌ ${valRes.error}\n\nPor favor, informe novamente o valor correspondente:`
        );
        return;
      }

      session.data.pix_key_type = pType;
      session.data.pix_key_value = valRes.canonical!;
      session.data.pix_key = valRes.canonical!;
      session.step = 'CONFIRM';

      const vehicleFriendlyLabel = getVehicleTypeLabel(session.data.vehicle_type!);
      const maskedPix = maskPixKey(session.data.pix_key_type, session.data.pix_key_value);

      const summary =
        `<b>CADASTRO DE MOTORISTA</b>\n\n` +
        `<b>Nome:</b> ${escapeHtml(session.data.name)}\n` +
        `<b>Telefone:</b> ${escapeHtml(session.data.phone)}\n` +
        `<b>Veículo:</b> ${escapeHtml(vehicleFriendlyLabel)}\n` +
        `<b>Tipo Pix:</b> ${escapeHtml(session.data.pix_key_type)}\n` +
        `<b>Chave Pix:</b> ${escapeHtml(maskedPix)}`;

      await this.sendMessage(chatId, summary, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'CONFIRMAR CADASTRO', callback_data: 'confirm_reg' },
              { text: 'CANCELAR', callback_data: 'cancel_reg' },
            ],
          ],
        },
      });
      return;
    }

    if (session.step === 'CONFIRM') {
      if (normalized === 'CONFIRMAR CADASTRO' || normalized === 'CONFIRMAR') {
        await this.commitRegistration(telegramUserId, chatId, session);
        return;
      }
      await this.sendMessage(chatId, 'Utilize os botões abaixo para confirmar ou cancelar o cadastro.', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'CONFIRMAR CADASTRO', callback_data: 'confirm_reg' },
              { text: 'CANCELAR', callback_data: 'cancel_reg' },
            ],
          ],
        },
      });
    }
  }

  private async processEditInput(
    telegramUserId: string,
    chatId: string,
    text: string,
    editSession: EditProfileState
  ) {
    const normalized = text.toUpperCase();
    if (normalized === 'CANCELAR' || normalized === '/CANCEL') {
      this.editSessions.delete(telegramUserId);
      await this.sendMessage(chatId, 'Alteração cancelada.');
      await this.sendMyProfile(chatId, telegramUserId);
      return;
    }

    const driver = await this.driverService.getDriverById(editSession.driverId);
    if (!driver) {
      this.editSessions.delete(telegramUserId);
      await this.sendMessage(chatId, 'Erro: motorista não encontrado.');
      return;
    }

    if (editSession.field === 'NAME') {
      if (!text || text.trim().length < 2) {
        await this.sendMessage(chatId, 'Por favor, informe um nome válido (mínimo 2 letras):');
        return;
      }
      editSession.pendingData.name = text.trim();
      editSession.field = 'CONFIRM';

      const msg =
        `<b>CONFIRMAR ALTERAÇÃO DE NOME</b>\n\n` +
        `<b>Nome atual:</b> ${escapeHtml(driver.name)}\n` +
        `<b>Novo nome:</b> ${escapeHtml(editSession.pendingData.name)}`;

      await this.sendMessage(chatId, msg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ CONFIRMAR', callback_data: 'confirm_edit' },
              { text: '❌ CANCELAR', callback_data: 'cancel_edit' },
            ],
          ],
        },
      });
      return;
    }

    if (editSession.field === 'PHONE') {
      const cleaned = text.replace(/\D/g, '');
      if (cleaned.length < 8) {
        await this.sendMessage(
          chatId,
          'Telefone inválido. Por favor, informe seu telefone com DDD:'
        );
        return;
      }
      editSession.pendingData.phone = normalizeGeneralPhone(text);
      editSession.field = 'CONFIRM';

      const msg =
        `<b>CONFIRMAR ALTERAÇÃO DE TELEFONE</b>\n\n` +
        `<b>Telefone atual:</b> ${escapeHtml(driver.phone)}\n` +
        `<b>Novo telefone:</b> ${escapeHtml(editSession.pendingData.phone)}`;

      await this.sendMessage(chatId, msg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ CONFIRMAR', callback_data: 'confirm_edit' },
              { text: '❌ CANCELAR', callback_data: 'cancel_edit' },
            ],
          ],
        },
      });
      return;
    }

    if (editSession.field === 'PIX_VALUE') {
      const valRes = validateAndNormalizePix(editSession.pendingData.pix_key_type!, text);
      if (!valRes.isValid) {
        await this.sendMessage(
          chatId,
          `❌ ${valRes.error}\n\nPor favor, informe novamente o valor da sua chave Pix:`
        );
        return;
      }

      editSession.pendingData.pix_key_value = valRes.canonical!;
      editSession.field = 'CONFIRM';

      const oldMasked = maskPixKey(driver.pix_key_type, driver.pix_key_value || driver.pix_key);
      const newMasked = maskPixKey(editSession.pendingData.pix_key_type!, valRes.canonical!);

      const msg =
        `<b>CONFIRMAR ALTERAÇÃO DE CHAVE PIX</b>\n\n` +
        `<b>Tipo atual:</b> ${escapeHtml(driver.pix_key_type)}\n` +
        `<b>Pix atual:</b> ${escapeHtml(oldMasked)}\n\n` +
        `<b>Novo tipo:</b> ${escapeHtml(editSession.pendingData.pix_key_type!)}\n` +
        `<b>Nova chave:</b> ${escapeHtml(newMasked)}`;

      await this.sendMessage(chatId, msg, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ CONFIRMAR ALTERAÇÃO', callback_data: 'confirm_edit' },
              { text: '❌ CANCELAR', callback_data: 'cancel_edit' },
            ],
          ],
        },
      });
      return;
    }

    if (editSession.field === 'CONFIRM') {
      if (normalized === 'CONFIRMAR' || normalized === 'CONFIRMAR ALTERAÇÃO') {
        await this.executeProfileEdit(telegramUserId, chatId, editSession);
        return;
      }
      await this.sendMessage(chatId, 'Utilize os botões abaixo para confirmar ou cancelar.', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ CONFIRMAR', callback_data: 'confirm_edit' },
              { text: '❌ CANCELAR', callback_data: 'cancel_edit' },
            ],
          ],
        },
      });
    }
  }

  private async executeProfileEdit(
    telegramUserId: string,
    chatId: string,
    editSession: EditProfileState
  ) {
    if (!this.driverService) return;

    try {
      const payload: any = {};
      if (editSession.pendingData.name) {
        payload.name = editSession.pendingData.name;
      }
      if (editSession.pendingData.phone) {
        payload.phone = editSession.pendingData.phone;
      }
      if (editSession.pendingData.vehicle_type) {
        payload.vehicle_type = editSession.pendingData.vehicle_type;
      }
      if (editSession.pendingData.pix_key_type && editSession.pendingData.pix_key_value) {
        payload.pix = {
          pix_key_type: editSession.pendingData.pix_key_type,
          pix_key_value: editSession.pendingData.pix_key_value,
        };
      }

      await this.driverService.updateDriverProfile(editSession.driverId, payload, {
        actor_type: 'DRIVER',
        actor_id: telegramUserId,
      });

      this.editSessions.delete(telegramUserId);
      await this.sendMessage(chatId, '✅ Dados cadastrais atualizados com sucesso!');
      await this.sendMyProfile(chatId, telegramUserId);
    } catch (err: any) {
      this.editSessions.delete(telegramUserId);
      console.error('[executeProfileEdit failed]', err.message);
      await this.sendMessage(chatId, `Erro ao atualizar cadastro: ${err.message}`);
      await this.sendMyProfile(chatId, telegramUserId);
    }
  }

  /**
   * Process interactive inputs during M4 route execution: PIN, Photo evidence, Incident note
   */
  private async processM4Input(
    telegramUserId: string,
    chatId: string,
    message: any,
    session: M4DriverSession
  ) {
    if (!this.routeService) return;

    if (session.mode === 'AWAITING_PIN') {
      const pin = (message.text || '').trim();
      if (!pin) {
        await this.sendMessage(chatId, 'Informe o PIN de entrega fornecido pelo cliente:');
        return;
      }

      try {
        const result = await this.routeService.deliverStopWithPin(session.stopId, pin, { telegramUserId });
        if (!result.success) {
          await this.sendMessage(chatId, result.message);
          return;
        }

        this.m4DriverSessions.delete(telegramUserId);
        const route = await this.routeService.getRouteById(session.routeId);
        const totalStops = route?.stops?.length || 1;

        await this.sendMessage(
          chatId,
          `✅ ENTREGA ${result.stop.sequence} DE ${totalStops} CONCLUÍDA\n\nRestam:\n${result.remainingCount} entregas`
        );

        if (result.routeCompleted) {
          await this.sendFinalRouteSummary(chatId, session.routeId);
        } else if (result.nextStop && route) {
          await this.sendStopCard(chatId, route, result.nextStop);
        }
      } catch (err: any) {
        await this.sendMessage(chatId, `Erro: ${err.message}`);
      }
      return;
    }

    if (session.mode === 'AWAITING_PHOTO') {
      if (!message.photo || !Array.isArray(message.photo) || message.photo.length === 0) {
        await this.sendMessage(chatId, '📷 Envie uma foto mostrando onde o pedido foi deixado.');
        return;
      }

      const photo = message.photo[message.photo.length - 1];
      const fileId = photo.file_id;

      try {
        const result = await this.routeService.deliverStopWithPhoto(session.stopId, fileId, { telegramUserId });
        this.m4DriverSessions.delete(telegramUserId);
        const route = await this.routeService.getRouteById(session.routeId);
        const totalStops = route?.stops?.length || 1;

        await this.sendMessage(
          chatId,
          `✅ ENTREGA ${result.stop.sequence} DE ${totalStops} CONCLUÍDA\n\nRestam:\n${result.remainingCount} entregas`
        );

        if (result.routeCompleted) {
          await this.sendFinalRouteSummary(chatId, session.routeId);
        } else if (result.nextStop && route) {
          await this.sendStopCard(chatId, route, result.nextStop);
        }
      } catch (err: any) {
        await this.sendMessage(chatId, `⚠️ ${err.message}`);
      }
      return;
    }

    if (session.mode === 'AWAITING_INCIDENT_NOTE') {
      const note = (message.text || '').trim();
      if (!note) {
        await this.sendMessage(chatId, 'Descreva brevemente o motivo do problema nesta entrega:');
        return;
      }

      try {
        const result = await this.routeService.reportStopIncident(
          session.stopId,
          { incident_type: 'OUTRO', incident_note: note },
          { telegramUserId }
        );

        this.m4DriverSessions.delete(telegramUserId);
        const route = await this.routeService.getRouteById(session.routeId);

        await this.sendMessage(
          chatId,
          `⚠️ Incidente registrado para a Parada #${result.stop.sequence}: Outro (${note})\n\nRestam: ${result.remainingCount} entregas pendentes.`
        );

        if (result.routeCompleted) {
          await this.sendFinalRouteSummary(chatId, session.routeId);
        } else if (result.nextStop && route) {
          await this.sendStopCard(chatId, route, result.nextStop);
        }
      } catch (err: any) {
        await this.sendMessage(chatId, `⚠️ Erro ao registrar incidente: ${err.message}`);
      }
      return;
    }
  }

  private async handleCallbackQuery(query: any) {
    const data = query.data;
    const telegramUserId = query.from?.id?.toString();
    const chatId = query.message?.chat?.id?.toString() || telegramUserId;

    // Acknowledge callback query
    try {
      await this.callTelegramApi('answerCallbackQuery', {
        callback_query_id: query.id,
      });
    } catch (e) {
      // ignore
    }

    if (!telegramUserId) return;

    // ==========================================
    // M2.1 & M4.4: Accept route callback
    // ==========================================
    if (data && data.startsWith('accept_route:')) {
      const parts = data.replace('accept_route:', '').trim().split(':');
      const routeId = parseInt(parts[0], 10);
      const expectedVersion = parts[1] ? parseInt(parts[1], 10) : undefined;
      if (isNaN(routeId)) {
        await this.answerCallbackQuery(query.id, 'Dados inválidos.', true);
        return;
      }

      if (!this.routeService) {
        await this.answerCallbackQuery(query.id, 'Serviço indisponível no momento.', true);
        return;
      }

      try {
        const result = await this.routeService.acceptRoute(routeId, {
          telegramUserId,
          expectedVersion,
        });

        if (result.status === 'WON') {
          await this.answerCallbackQuery(query.id, '✅ Rota aceita por você!');
          if (result.route) {
            await this.sendRouteAcceptedWon(chatId, result.route);
          }
        } else if (result.status === 'ALREADY_WON') {
          await this.answerCallbackQuery(query.id, 'Esta rota já está confirmada para você.');
          await this.sendMessage(chatId, 'Esta rota já está confirmada para você.');
        } else if (result.status === 'LOST') {
          await this.answerCallbackQuery(query.id, '❌ Esta rota já foi aceita por outro motorista.', true);
          await this.sendMessage(chatId, '❌ Esta rota já foi aceita por outro motorista.');
          if (query.message?.message_id) {
            const currentRoute = await this.routeService.getRouteById(routeId);
            if (currentRoute) {
              await this.invalidateRouteOffer(chatId, query.message.message_id, currentRoute).catch(() => {});
            } else {
              await this.invalidateRouteOfferMarkup(chatId, query.message.message_id).catch(() => {});
            }
          }
        } else {
          // REJECTED (e.g. OUTDATED_ROUTE_VERSION, VEHICLE_INCOMPATIBLE, DRIVER_PENDING, DRIVER_BLOCKED, ROUTE_CANCELLED)
          await this.answerCallbackQuery(query.id, result.message, true);
          await this.sendMessage(chatId, result.message);
          if (result.error === 'OUTDATED_ROUTE_VERSION' && query.message?.message_id) {
            await this.invalidateRouteOfferMarkup(chatId, query.message.message_id).catch(() => {});
          }
        }
      } catch (err: any) {
        await this.answerCallbackQuery(query.id, 'Erro ao processar aceite da rota.', true);
      }
      return;
    }

    // ==========================================
    // M4.4: Ciência e Decisão de Alterações
    // ==========================================

    // Confirmação de Ciência de Correção Operacional (Seção 12)
    if (data && data.startsWith('route_ack:')) {
      const parts = data.replace('route_ack:', '').trim().split(':');
      const routeId = parseInt(parts[0], 10);
      const version = parseInt(parts[1], 10);
      if (!isNaN(routeId) && !isNaN(version) && this.driverService) {
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (driver) {
          await routeEditService.handleDriverOperationalAck(routeId, version, driver.id);
          await this.answerCallbackQuery(query.id, '✅ Ciência confirmada!');
          await this.sendMessage(chatId, `✅ Você confirmou ciência da atualização da Rota #${routeId} (v${version}).`);
        }
      }
      return;
    }

    // Aceite de Alteração Material (Seção 14 & 15)
    if (data && data.startsWith('route_mat_accept:')) {
      const parts = data.replace('route_mat_accept:', '').trim().split(':');
      const routeId = parseInt(parts[0], 10);
      const updateId = parseInt(parts[1], 10);
      if (!isNaN(routeId) && !isNaN(updateId) && this.driverService) {
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (driver) {
          try {
            await routeEditService.handleDriverMaterialDecision(routeId, updateId, driver.id, 'ACCEPT');
            await this.answerCallbackQuery(query.id, '✅ Alteração aceita com sucesso!');
          } catch (err: any) {
            await this.answerCallbackQuery(query.id, `⚠️ ${err.message}`, true);
          }
        }
      }
      return;
    }

    // Recusa de Alteração Material (Seção 14 & 15)
    if (data && data.startsWith('route_mat_reject:')) {
      const parts = data.replace('route_mat_reject:', '').trim().split(':');
      const routeId = parseInt(parts[0], 10);
      const updateId = parseInt(parts[1], 10);
      if (!isNaN(routeId) && !isNaN(updateId) && this.driverService) {
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (driver) {
          try {
            await routeEditService.handleDriverMaterialDecision(routeId, updateId, driver.id, 'REJECT');
            await this.answerCallbackQuery(query.id, '❌ Alteração recusada.');
          } catch (err: any) {
            await this.answerCallbackQuery(query.id, `⚠️ ${err.message}`, true);
          }
        }
      }
      return;
    }

    if (data === 'noop_route_accepted') {
      await this.answerCallbackQuery(query.id, '❌ Esta rota já foi aceita por outro motorista.', true);
      return;
    }

    // ==========================================
    // M4: EXECUÇÃO OPERACIONAL DA ROTA & PARADAS
    // ==========================================

    // M4 Seção 8: CHEGUEI PARA COLETA
    if (data && data.startsWith('route_arrived_pickup:')) {
      const routeId = parseInt(data.replace('route_arrived_pickup:', '').trim(), 10);
      if (isNaN(routeId) || !this.routeService) {
        await this.answerCallbackQuery(query.id, 'Dados inválidos.', true);
        return;
      }

      try {
        await this.routeService.markArrivedPickup(routeId, { telegramUserId });
        await this.answerCallbackQuery(query.id, '📍 Chegada na coleta registrada!');

        const text =
          `📍 *Chegada registrada.*\n\n` +
          `Quando estiver com todos os pedidos da rota:`;

        await this.sendMessage(chatId, text, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '📦 PEDIDOS COLETADOS',
                  callback_data: `route_picked_up:${routeId}`,
                },
              ],
            ],
          },
        });
      } catch (err: any) {
        await this.answerCallbackQuery(query.id, `Erro: ${err.message}`, true);
      }
      return;
    }

    // M4 Seção 9: PEDIDOS COLETADOS
    if (data && data.startsWith('route_picked_up:')) {
      const routeId = parseInt(data.replace('route_picked_up:', '').trim(), 10);
      if (isNaN(routeId) || !this.routeService) {
        await this.answerCallbackQuery(query.id, 'Dados inválidos.', true);
        return;
      }

      try {
        const route = await this.routeService.markPickedUp(routeId, { telegramUserId });
        await this.answerCallbackQuery(query.id, '📦 Coleta confirmada!');

        const totalStops = route.stops?.length || 0;
        const text =
          `📦 *Coleta confirmada.*\n\n` +
          `${totalStops} entregas carregadas.`;

        await this.sendMessage(chatId, text, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🛵 INICIAR ROTA',
                  callback_data: `route_start:${routeId}`,
                },
              ],
            ],
          },
        });
      } catch (err: any) {
        await this.answerCallbackQuery(query.id, `Erro: ${err.message}`, true);
      }
      return;
    }

    // M4 Seção 10: INICIAR ROTA
    if (data && data.startsWith('route_start:')) {
      const routeId = parseInt(data.replace('route_start:', '').trim(), 10);
      if (isNaN(routeId) || !this.routeService) {
        await this.answerCallbackQuery(query.id, 'Dados inválidos.', true);
        return;
      }

      try {
        const result = await this.routeService.startRoute(routeId, { telegramUserId });
        await this.answerCallbackQuery(query.id, '🛵 Rota iniciada!');

        if (result.nextStop) {
          await this.sendStopCard(chatId, result.route, result.nextStop);
        } else {
          await this.sendFinalRouteSummary(chatId, routeId);
        }
      } catch (err: any) {
        await this.answerCallbackQuery(query.id, `Erro: ${err.message}`, true);
      }
      return;
    }

    // M4 Seção 11 / Navegação: Visualizar Parada
    if (data && data.startsWith('stop_view:')) {
      const stopId = parseInt(data.replace('stop_view:', '').trim(), 10);
      if (isNaN(stopId) || !this.routeService) return;

      const stop = await this.routeService.getStopById(stopId);
      if (!stop) return;
      const route = await this.routeService.getRouteById(stop.route_id);
      if (!route) return;

      this.m4DriverSessions.delete(telegramUserId);
      await this.sendStopCard(chatId, route, stop);
      return;
    }

    // M4 Seção 12: Escolher outra parada pendente
    if (data && data.startsWith('route_choose_stop:')) {
      const routeId = parseInt(data.replace('route_choose_stop:', '').trim(), 10);
      if (isNaN(routeId) || !this.routeService) return;

      const route = await this.routeService.getRouteById(routeId);
      if (!route) return;

      const pending = (route.stops || []).filter((s: RouteStop) => s.status === 'PENDING');
      if (pending.length === 0) {
        await this.sendMessage(chatId, 'Todas as paradas desta rota já foram concluídas ou possuem incidente.');
        return;
      }

      const buttons = pending.map((s: RouteStop) => [
        {
          text: `#${s.sequence} - ${s.destination_neighborhood} (${s.cargo_description})`,
          callback_data: `stop_view:${s.id}`,
        },
      ]);

      await this.sendMessage(chatId, 'Selecione a parada que deseja realizar agora:', {
        reply_markup: {
          inline_keyboard: buttons,
        },
      });
      return;
    }

    // M4 Seção 13 & 17: REALIZAR ENTREGA
    if (data && data.startsWith('stop_deliver:')) {
      const stopId = parseInt(data.replace('stop_deliver:', '').trim(), 10);
      if (isNaN(stopId) || !this.routeService) return;

      const stop = await this.routeService.getStopById(stopId);
      if (!stop) return;

      if (stop.status !== 'PENDING') {
        await this.answerCallbackQuery(query.id, 'Esta parada já foi concluída ou possui incidente.', true);
        return;
      }

      if (stop.delivery_mode === 'IN_PERSON') {
        this.m4DriverSessions.set(telegramUserId, {
          mode: 'AWAITING_PIN',
          routeId: stop.route_id,
          stopId: stop.id,
        });

        await this.sendMessage(
          chatId,
          `Informe o PIN de entrega fornecido pelo cliente para a Parada #${stop.sequence}:`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '❌ CANCELAR', callback_data: `stop_view:${stop.id}` }]],
            },
          }
        );
      } else {
        // NO_CONTACT
        this.m4DriverSessions.set(telegramUserId, {
          mode: 'AWAITING_PHOTO',
          routeId: stop.route_id,
          stopId: stop.id,
        });

        await this.sendMessage(
          chatId,
          `📷 Envie uma foto mostrando onde o pedido da Parada #${stop.sequence} foi deixado.`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '❌ CANCELAR', callback_data: `stop_view:${stop.id}` }]],
            },
          }
        );
      }
      return;
    }

    // M4 Seção 20: PROBLEMA NESTA ENTREGA (Incidentes)
    if (data && data.startsWith('stop_incident:')) {
      const stopId = parseInt(data.replace('stop_incident:', '').trim(), 10);
      if (isNaN(stopId) || !this.routeService) return;

      const stop = await this.routeService.getStopById(stopId);
      if (!stop) return;

      if (stop.status !== 'PENDING') {
        await this.answerCallbackQuery(query.id, 'Esta parada já foi concluída ou possui incidente.', true);
        return;
      }

      await this.sendMessage(
        chatId,
        `⚠️ *Problema na Entrega #${stop.sequence}*\n\nSelecione o motivo do incidente:`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'CLIENTE AUSENTE', callback_data: `stop_inc_choice:${stop.id}:CLIENTE_AUSENTE` },
              ],
              [
                { text: 'ENDEREÇO NÃO LOCALIZADO', callback_data: `stop_inc_choice:${stop.id}:ENDERECO_NAO_LOCALIZADO` },
              ],
              [
                { text: 'CLIENTE RECUSOU', callback_data: `stop_inc_choice:${stop.id}:CLIENTE_RECUSOU` },
              ],
              [
                { text: 'OUTRO MOTIVO', callback_data: `stop_inc_choice:${stop.id}:OUTRO` },
              ],
              [
                { text: '❌ VOLTAR', callback_data: `stop_view:${stop.id}` },
              ],
            ],
          },
        }
      );
      return;
    }

    // M4 Seção 20: Escolha de Incidente
    if (data && data.startsWith('stop_inc_choice:')) {
      const parts = data.replace('stop_inc_choice:', '').split(':');
      const stopId = parseInt(parts[0], 10);
      const choice = parts[1];

      if (isNaN(stopId) || !choice || !this.routeService) return;

      if (choice === 'OUTRO') {
        const stop = await this.routeService.getStopById(stopId);
        if (!stop) return;

        this.m4DriverSessions.set(telegramUserId, {
          mode: 'AWAITING_INCIDENT_NOTE',
          routeId: stop.route_id,
          stopId: stop.id,
        });

        await this.sendMessage(
          chatId,
          `Descreva brevemente o motivo do problema nesta entrega:`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '❌ CANCELAR', callback_data: `stop_view:${stop.id}` }]],
            },
          }
        );
        return;
      }

      try {
        const result = await this.routeService.reportStopIncident(
          stopId,
          { incident_type: choice },
          { telegramUserId }
        );

        this.m4DriverSessions.delete(telegramUserId);
        const route = await this.routeService.getRouteById(result.stop.route_id);

        let label = choice;
        if (choice === 'CLIENTE_AUSENTE') label = 'Cliente Ausente';
        if (choice === 'ENDERECO_NAO_LOCALIZADO') label = 'Endereço não Localizado';
        if (choice === 'CLIENTE_RECUSOU') label = 'Cliente Recusou';

        await this.sendMessage(
          chatId,
          `⚠️ Incidente registrado para a Parada #${result.stop.sequence}: ${label}\n\nRestam: ${result.remainingCount} entregas pendentes.`
        );

        if (result.routeCompleted) {
          await this.sendFinalRouteSummary(chatId, result.stop.route_id);
        } else if (result.nextStop && route) {
          await this.sendStopCard(chatId, route, result.nextStop);
        }
      } catch (err: any) {
        await this.answerCallbackQuery(query.id, `Erro: ${err.message}`, true);
      }
      return;
    }

    // ==========================================
    // M3: Accept delivery callback (FROZEN BASELINE)
    // ==========================================
    if (data && data.startsWith('accept_delivery:')) {
      const deliveryIdStr = data.replace('accept_delivery:', '').trim();
      const deliveryId = parseInt(deliveryIdStr, 10);
      if (isNaN(deliveryId)) {
        await this.answerCallbackQuery(query.id, 'Dados inválidos.', true);
        return;
      }

      if (!this.deliveryService) {
        await this.answerCallbackQuery(query.id, 'Serviço indisponível no momento.', true);
        return;
      }

      try {
        const result = await this.deliveryService.acceptDelivery(deliveryId, {
          telegramUserId,
        });

        if (result.status === 'WON') {
          await this.answerCallbackQuery(query.id, '✅ Entrega aceita por você!');
          if (result.delivery) {
            await this.sendDeliveryAcceptedWon(chatId, result.delivery);
          }
        } else if (result.status === 'ALREADY_WON') {
          await this.answerCallbackQuery(query.id, 'Esta entrega já está confirmada para você.');
          await this.sendMessage(chatId, 'Esta entrega já está confirmada para você.');
        } else if (result.status === 'LOST') {
          await this.answerCallbackQuery(query.id, '❌ Esta entrega já foi aceita por outro motorista.', true);
          await this.sendMessage(chatId, '❌ Esta entrega já foi aceita por outro motorista.');
        } else {
          // REJECTED (PENDING, BLOCKED, NO_DISPATCH, CANCELLED)
          await this.answerCallbackQuery(query.id, result.message, true);
          await this.sendMessage(chatId, result.message);
        }
      } catch (err: any) {
        await this.answerCallbackQuery(query.id, 'Erro ao processar aceite.', true);
      }
      return;
    }

    if (data === 'noop_accepted') {
      await this.answerCallbackQuery(query.id, '❌ Esta entrega já foi aceita por outro motorista.', true);
      return;
    }

    // ==========================================
    // M1.1: Driver Profile Navigation & Actions
    // ==========================================
    if (data === 'menu_start') {
      this.editSessions.delete(telegramUserId);
      if (this.driverService) {
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (driver) {
          await this.sendMainMenu(chatId, driver);
          return;
        }
      }
      await this.handleStartCommand(telegramUserId, chatId, query.from);
      return;
    }

    if (data === 'menu_my_profile') {
      this.editSessions.delete(telegramUserId);
      await this.sendMyProfile(chatId, telegramUserId);
      return;
    }

    // ==========================================
    // M1.2: Referral Actions (Indicação Controlada)
    // ==========================================
    if (data === 'menu_refer_driver') {
      await this.startReferralFlow(telegramUserId, chatId);
      return;
    }

    if (data === 'menu_my_referrals') {
      await this.showMyReferrals(telegramUserId, chatId);
      return;
    }

    if (data === 'confirm_referral') {
      const refSession = this.referralSessions.get(telegramUserId);
      if (refSession && refSession.step === 'AWAITING_CONFIRMATION') {
        await this.commitReferral(telegramUserId, chatId, refSession);
      } else {
        await this.sendMessage(chatId, 'Sessão de indicação expirada. Inicie novamente pelo menu.');
      }
      return;
    }

    if (data === 'cancel_referral') {
      this.referralSessions.delete(telegramUserId);
      await this.sendMessage(chatId, '❌ Indicação cancelada.\nNenhum dado foi salvo.');
      if (this.driverService) {
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (driver) await this.sendMainMenu(chatId, driver);
      }
      return;
    }

    if (data === 'edit_profile_name') {
      if (!this.driverService) return;
      const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
      if (!driver) return;
      this.editSessions.set(telegramUserId, { driverId: driver.id, field: 'NAME', pendingData: {} });
      await this.sendMessage(chatId, 'Informe seu novo *nome completo*:', {
        reply_markup: {
          inline_keyboard: [[{ text: '❌ CANCELAR', callback_data: 'cancel_edit' }]],
        },
      });
      return;
    }

    if (data === 'edit_profile_phone') {
      if (!this.driverService) return;
      const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
      if (!driver) return;
      this.editSessions.set(telegramUserId, { driverId: driver.id, field: 'PHONE', pendingData: {} });
      await this.sendMessage(chatId, 'Informe seu novo *telefone com DDD* (ex: 34999999999):', {
        reply_markup: {
          inline_keyboard: [[{ text: '❌ CANCELAR', callback_data: 'cancel_edit' }]],
        },
      });
      return;
    }

    if (data === 'edit_profile_vehicle') {
      if (!this.driverService) return;
      const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
      if (!driver) return;
      this.editSessions.set(telegramUserId, { driverId: driver.id, field: 'VEHICLE', pendingData: {} });
      await this.sendMessage(chatId, 'Selecione o novo *tipo de veículo*:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚗 CARRO HATCH', callback_data: 'edit_veh:CAR_HATCH' },
              { text: '🚘 CARRO SEDAN', callback_data: 'edit_veh:CAR_SEDAN' },
            ],
            [
              { text: '🚙 CARRO SW', callback_data: 'edit_veh:CAR_SW' },
              { text: '🏍️ MOTO COM BAG', callback_data: 'edit_veh:MOTO_WITH_BAG' },
            ],
            [
              { text: '🏍️ MOTO SEM BAG', callback_data: 'edit_veh:MOTO_WITHOUT_BAG' },
              { text: '🚚 OUTRO', callback_data: 'edit_veh:OTHER' },
            ],
            [{ text: '❌ CANCELAR', callback_data: 'cancel_edit' }],
          ],
        },
      });
      return;
    }

    if (data && data.startsWith('edit_veh:')) {
      const chosenVeh = data.replace('edit_veh:', '') as VehicleType;
      let editSession = this.editSessions.get(telegramUserId);
      if (!editSession && this.driverService) {
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (driver) {
          editSession = { driverId: driver.id, field: 'VEHICLE', pendingData: {} };
          this.editSessions.set(telegramUserId, editSession);
        }
      }
      if (editSession) {
        const driver = await this.driverService.getDriverById(editSession.driverId);
        editSession.pendingData.vehicle_type = chosenVeh;
        editSession.field = 'CONFIRM';

        const oldVehLabel = driver ? getVehicleTypeLabel(driver.vehicle_type) : '';
        const newVehLabel = getVehicleTypeLabel(chosenVeh);

        const msg =
          `<b>CONFIRMAR ALTERAÇÃO DE VEÍCULO</b>\n\n` +
          `<b>Veículo atual:</b> ${escapeHtml(oldVehLabel)}\n` +
          `<b>Novo veículo:</b> ${escapeHtml(newVehLabel)}`;

        await this.sendMessage(chatId, msg, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ CONFIRMAR', callback_data: 'confirm_edit' },
                { text: '❌ CANCELAR', callback_data: 'cancel_edit' },
              ],
            ],
          },
        });
      }
      return;
    }

    if (data === 'edit_profile_pix') {
      if (!this.driverService) return;
      const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
      if (!driver) return;
      this.editSessions.set(telegramUserId, { driverId: driver.id, field: 'PIX_TYPE', pendingData: {} });
      await this.sendMessage(chatId, 'Selecione o novo *tipo de chave Pix*:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'CPF', callback_data: 'edit_pixtype:CPF' },
              { text: 'TELEFONE', callback_data: 'edit_pixtype:PHONE' },
            ],
            [
              { text: 'E-MAIL', callback_data: 'edit_pixtype:EMAIL' },
              { text: 'ALEATÓRIA', callback_data: 'edit_pixtype:RANDOM' },
            ],
            [{ text: '❌ CANCELAR', callback_data: 'cancel_edit' }],
          ],
        },
      });
      return;
    }

    if (data && data.startsWith('edit_pixtype:')) {
      const chosenPixType = data.replace('edit_pixtype:', '') as PixKeyType;
      let editSession = this.editSessions.get(telegramUserId);
      if (!editSession && this.driverService) {
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (driver) {
          editSession = { driverId: driver.id, field: 'PIX_TYPE', pendingData: {} };
          this.editSessions.set(telegramUserId, editSession);
        }
      }
      if (editSession) {
        editSession.pendingData.pix_key_type = chosenPixType;
        editSession.field = 'PIX_VALUE';

        let promptMsg = 'Informe sua nova chave Pix:';
        if (chosenPixType === 'CPF') promptMsg = 'Informe o *CPF* utilizado como chave Pix:';
        if (chosenPixType === 'PHONE') promptMsg = 'Informe o *telefone com DDD* utilizado como chave Pix (ex: 34999999999):';
        if (chosenPixType === 'EMAIL') promptMsg = 'Informe o *e-mail* utilizado como chave Pix:';
        if (chosenPixType === 'RANDOM') promptMsg = 'Informe a *chave aleatória (UUID)* utilizada como chave Pix:';

        await this.sendMessage(chatId, promptMsg, {
          reply_markup: {
            inline_keyboard: [[{ text: '❌ CANCELAR', callback_data: 'cancel_edit' }]],
          },
        });
      }
      return;
    }

    if (data === 'confirm_edit') {
      const editSession = this.editSessions.get(telegramUserId);
      if (editSession) {
        await this.executeProfileEdit(telegramUserId, chatId, editSession);
      } else {
        await this.sendMessage(chatId, 'Sessão expirada. Por favor, acesse seu cadastro novamente.');
        await this.sendMyProfile(chatId, telegramUserId);
      }
      return;
    }

    if (data === 'cancel_edit') {
      this.editSessions.delete(telegramUserId);
      await this.sendMessage(chatId, 'Alteração cancelada.');
      await this.sendMyProfile(chatId, telegramUserId);
      return;
    }

    // ==========================================
    // Registration Wizard Callbacks
    // ==========================================
    const session = this.sessions.get(telegramUserId);

    if (data === 'cancel_reg') {
      this.sessions.delete(telegramUserId);
      await this.sendMessage(
        chatId,
        'Cadastro cancelado.\nQuando quiser recomeçar, envie /start.',
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // Vehicle selection callback in registration
    if (data && data.startsWith('veh_')) {
      if (session && session.step === 'VEHICLE') {
        const parsed = parseVehicleInput(data);
        if (parsed) {
          session.data.vehicle_type = parsed;
          session.step = 'PIX_TYPE';
          await this.sendMessage(
            chatId,
            'Selecione o *tipo de chave Pix* para recebimento dos repasses:',
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: 'CPF', callback_data: 'reg_pixtype:CPF' },
                    { text: 'TELEFONE', callback_data: 'reg_pixtype:PHONE' },
                  ],
                  [
                    { text: 'E-MAIL', callback_data: 'reg_pixtype:EMAIL' },
                    { text: 'ALEATÓRIA', callback_data: 'reg_pixtype:RANDOM' },
                  ],
                ],
              },
            }
          );
        }
      }
      return;
    }

    // Pix type selection callback in registration
    if (data && data.startsWith('reg_pixtype:')) {
      const chosenPixType = data.replace('reg_pixtype:', '') as PixKeyType;
      if (session && (session.step === 'PIX_TYPE' || session.step === 'VEHICLE')) {
        session.data.pix_key_type = chosenPixType;
        session.step = 'PIX_VALUE';

        let promptMsg = 'Informe sua chave Pix:';
        if (chosenPixType === 'CPF') promptMsg = 'Informe o *CPF* utilizado como chave Pix:';
        if (chosenPixType === 'PHONE') promptMsg = 'Informe o *telefone com DDD* utilizado como chave Pix (ex: 34999999999):';
        if (chosenPixType === 'EMAIL') promptMsg = 'Informe o *e-mail* utilizado como chave Pix:';
        if (chosenPixType === 'RANDOM') promptMsg = 'Informe a *chave aleatória (UUID)* utilizada como chave Pix:';

        await this.sendMessage(chatId, promptMsg);
      }
      return;
    }

    if (data === 'confirm_reg') {
      if (
        !session ||
        !session.data.name ||
        !session.data.phone ||
        !session.data.vehicle_type ||
        (!session.data.pix_key_value && !session.data.pix_key)
      ) {
        await this.sendMessage(
          chatId,
          'Sessão expirada ou incompleta. Por favor, reinicie enviando /start.'
        );
        this.sessions.delete(telegramUserId);
        return;
      }

      await this.commitRegistration(telegramUserId, chatId, session);
    }
  }

  private async commitRegistration(telegramUserId: string, chatId: string, session: WizardState) {
    if (!this.driverService) {
      await this.sendMessage(chatId, 'Erro no serviço. Tente novamente mais tarde.');
      return;
    }

    try {
      await this.driverService.registerDriver({
        telegram_user_id: telegramUserId,
        telegram_chat_id: chatId,
        name: session.data.name!,
        phone: session.data.phone!,
        vehicle_type: session.data.vehicle_type!,
        pix_key: session.data.pix_key_value || session.data.pix_key,
        pix_key_type: session.data.pix_key_type,
        pix_key_value: session.data.pix_key_value || session.data.pix_key,
        invite_token: session.data.invite_token,
      });

      this.sessions.delete(telegramUserId);

      // Resposta de confirmação
      const responseMsg =
        'Cadastro recebido.\n\n' +
        'Sua solicitação está aguardando aprovação da Kantine.\n\n' +
        'Você receberá uma mensagem aqui quando seu cadastro for aprovado.';

      await this.sendMessage(chatId, responseMsg, {
        reply_markup: { remove_keyboard: true },
      });
    } catch (err: any) {
      // Idempotency: if already registered
      if (err.message === 'DRIVER_ALREADY_EXISTS') {
        this.sessions.delete(telegramUserId);
        const existing = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (existing) {
          await this.sendMainMenu(chatId, existing);
        }
        return;
      }

      console.error('[Telegram Bot] Registration commit error:', err.message);
      await this.sendMessage(
        chatId,
        'Ocorreu um erro ao processar seu cadastro. Por favor, tente novamente enviando /start.'
      );
    }
  }
}

export const telegramBot = new TelegramBotService();
