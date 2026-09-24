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
} from './types.ts';

interface WizardState {
  step: 'NAME' | 'PHONE' | 'VEHICLE' | 'PIX' | 'CONFIRM';
  data: {
    name?: string;
    phone?: string;
    vehicle_type?: VehicleType;
    pix_key?: string;
  };
  lastPromptTime: number;
}

export class TelegramBotService {
  private token: string | null = null;
  private isPolling = false;
  private shouldStop = false;
  private offset = 0;
  private sessions = new Map<string, WizardState>();
  private botInfo: { id: number; username: string; first_name: string } | null = null;
  private driverService: any = null;

  constructor() {
    this.updateTokenFromEnv();
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

  public isConfigured(): boolean {
    return !!this.token;
  }

  public getStatus() {
    return {
      configured: !!this.token,
      polling: this.isPolling,
      botUsername: this.botInfo?.username || null,
      activeSessions: this.sessions.size,
    };
  }

  /**
   * Safe Telegram HTTP request helper
   * Never prints or leaks the token in logs or exceptions
   */
  private async callTelegramApi(method: string, body?: any): Promise<any> {
    if (!this.token) {
      throw new Error('TELEGRAM_BOT_TOKEN_NOT_CONFIGURED');
    }

    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data: any = await response.json();
      if (!data.ok) {
        throw new Error(data.description || `Telegram API error: ${response.status}`);
      }
      return data.result;
    } catch (error: any) {
      // Mask token if it inadvertently appeared in error message
      const sanitized =
        error?.message?.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]') ||
        'Telegram API error';
      throw new Error(sanitized);
    }
  }

  public async sendMessage(chatId: string | number, text: string, extra: any = {}): Promise<boolean> {
    if (!this.token) {
      console.warn(`[Telegram] Skipping message to chat ${chatId}: TELEGRAM_BOT_TOKEN is not configured.`);
      return false;
    }

    try {
      await this.callTelegramApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        ...extra,
      });
      return true;
    } catch (err: any) {
      console.error(`[Telegram] Failed to send message to chat ${chatId}:`, err.message);
      return false;
    }
  }

  /**
   * M2: Send delivery offer to an ACTIVE driver
   * Enforces strict privacy: never sends full destination address, customer name or phone.
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
  ): Promise<{ success: boolean; errorCode?: string }> {
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
      `⚠️ *Observação:*\n${obsText}\n\n` +
      `_Funcionalidade de aceite será habilitada na próxima etapa._`;

    try {
      await this.callTelegramApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      });
      return { success: true };
    } catch (err: any) {
      console.error(`[Telegram] Failed to dispatch offer #${delivery.id} to chat ${chatId}:`, err.message);
      return { success: false, errorCode: err.message || 'DISPATCH_FAILED' };
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
    while (!this.shouldStop && this.token) {
      try {
        const updates = await this.callTelegramApi('getUpdates', {
          offset: this.offset,
          timeout: 20,
          allowed_updates: ['message', 'callback_query'],
        });

        if (Array.isArray(updates)) {
          for (const update of updates) {
            this.offset = Math.max(this.offset, update.update_id + 1);
            await this.handleUpdate(update).catch((e) =>
              console.error('[Telegram Bot] Error handling update:', e.message)
            );
          }
        }
      } catch (err: any) {
        if (this.shouldStop) break;
        console.error('[Telegram Bot] Polling error (will retry in 5s):', err.message);
        await new Promise((r) => setTimeout(r, 5000));
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

    // Check for /start command
    if (rawText === '/start') {
      await this.handleStartCommand(telegramUserId, chatId, message.from);
      return;
    }

    // Check if user has an active registration session
    const session = this.sessions.get(telegramUserId);
    if (!session) {
      // User is not in registration and didn't send /start
      // Check if driver is already registered
      if (this.driverService) {
        const existing = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (existing) {
          if (existing.status === 'PENDING') {
            await this.sendMessage(chatId, 'Seu cadastro está aguardando aprovação.');
          } else if (existing.status === 'ACTIVE') {
            await this.sendMessage(
              chatId,
              'Seu cadastro está ativo.\n\nVocê está habilitado para receber ofertas de entrega.'
            );
          } else if (existing.status === 'BLOCKED') {
            await this.sendMessage(chatId, 'Seu cadastro não está ativo no momento.');
          }
          return;
        }
      }

      await this.sendMessage(
        chatId,
        'Olá! Para iniciar seu cadastro na Kantine Delivery, envie o comando /start'
      );
      return;
    }

    // Process Wizard steps
    await this.processWizardInput(telegramUserId, chatId, rawText, session);
  }

  private async handleStartCommand(telegramUserId: string, chatId: string, fromUser: any) {
    // 8. /start PARA MOTORISTA EXISTENTE
    if (this.driverService) {
      const existing = await this.driverService.getDriverByTelegramUserId(telegramUserId);
      if (existing) {
        // Clear any lingering session
        this.sessions.delete(telegramUserId);

        if (existing.status === 'PENDING') {
          await this.sendMessage(chatId, 'Seu cadastro está aguardando aprovação.');
        } else if (existing.status === 'ACTIVE') {
          await this.sendMessage(
            chatId,
            'Seu cadastro está ativo.\n\nVocê está habilitado para receber ofertas de entrega.'
          );
        } else if (existing.status === 'BLOCKED') {
          await this.sendMessage(chatId, 'Seu cadastro não está ativo no momento.');
        }
        return;
      }
    }

    // User not registered: (Re)start fresh registration
    // This correctly restarts an unfinished registration if /start is sent again
    this.sessions.set(telegramUserId, {
      step: 'NAME',
      data: {},
      lastPromptTime: Date.now(),
    });

    await this.sendMessage(
      chatId,
      'Olá! Bem-vindo à Central Privada de Entregas da Kantine.\n\nPor favor, informe seu *nome completo*:'
    );
  }

  private async processWizardInput(
    telegramUserId: string,
    chatId: string,
    text: string,
    session: WizardState
  ) {
    // Check for cancel / confirm text commands
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
      session.data.name = text;
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
      session.data.phone = text;
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
        // Exclusividade de opções: texto livre como "carro", "moto", "sedan", etc. é rejeitado
        await this.sendMessage(chatId, 'Selecione uma das opções abaixo:', {
          reply_markup: this.getVehicleInlineKeyboard(),
        });
        return;
      }

      session.data.vehicle_type = parsed;
      session.step = 'PIX';
      await this.sendMessage(
        chatId,
        'Informe sua *chave Pix* para recebimento dos repasses:'
      );
      return;
    }

    if (session.step === 'PIX') {
      if (!text || text.length < 3) {
        await this.sendMessage(chatId, 'Por favor, informe uma chave Pix válida:');
        return;
      }
      session.data.pix_key = text;
      session.step = 'CONFIRM';

      // Friendly Portuguese vehicle label for summary (never the canonical raw code)
      const vehicleFriendlyLabel = getVehicleTypeLabel(session.data.vehicle_type!);

      const summary =
        `*CADASTRO DE MOTORISTA*\n\n` +
        `*Nome:* ${session.data.name}\n` +
        `*Telefone:* ${session.data.phone}\n` +
        `*Veículo:* ${vehicleFriendlyLabel}\n` +
        `*Pix:* ${session.data.pix_key}`;

      await this.sendMessage(chatId, summary, {
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

    // Vehicle selection callback
    if (data && data.startsWith('veh_')) {
      if (session && session.step === 'VEHICLE') {
        const parsed = parseVehicleInput(data);
        if (parsed) {
          session.data.vehicle_type = parsed;
          session.step = 'PIX';
          await this.sendMessage(
            chatId,
            'Informe sua *chave Pix* para recebimento dos repasses:'
          );
        }
      }
      return;
    }

    if (data === 'confirm_reg') {
      if (
        !session ||
        !session.data.name ||
        !session.data.phone ||
        !session.data.vehicle_type ||
        !session.data.pix_key
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
        pix_key: session.data.pix_key!,
      });

      this.sessions.delete(telegramUserId);

      // 7. Resposta de confirmação
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
        if (existing?.status === 'PENDING') {
          await this.sendMessage(chatId, 'Seu cadastro está aguardando aprovação.');
        } else if (existing?.status === 'ACTIVE') {
          await this.sendMessage(
            chatId,
            'Seu cadastro está ativo.\n\nVocê está habilitado para receber ofertas de entrega.'
          );
        } else {
          await this.sendMessage(chatId, 'Seu cadastro não está ativo no momento.');
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
