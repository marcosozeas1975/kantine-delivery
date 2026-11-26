// Agendamento de corridas: data/hora de entrega e publicação programada da oferta.
//
// Fluxo ("revisar e agendar"): a rota fica em RASCUNHO com a data/hora de entrega (vinda do Takeat,
// do site ou informada à mão). Ao clicar em "Agendar oferta", a publicação é programada para
// OFFER_LEAD_MINUTES (padrão 90) antes da entrega; o agendador publica sozinho na hora certa.
//
// Os dados ficam numa tabela própria (route_schedules), fora da tabela de rotas: se algo falhar
// aqui, só o agendamento é afetado — as rotas continuam funcionando normalmente.
import { sql } from 'drizzle-orm';
import { db as appDb, getAdminDb } from '../db/index.ts';

// Tudo de route_schedules passa pela conexão admin (dona da tabela)
const db = { execute: (q: any) => getAdminDb().execute(q) };
import { routeService } from './routeService.ts';

export const OFFER_LEAD_MINUTES = () => {
  const n = Number(process.env.OFFER_LEAD_MINUTES);
  return Number.isFinite(n) && n >= 0 && n <= 24 * 60 ? n : 90;
};

export interface RouteSchedule {
  route_id: number;
  scheduled_for: string | null; // ISO: data/hora de entrega
  publish_at: string | null; // ISO: quando a oferta será publicada (null = não agendada)
  publish_error: string | null;
  published_at: string | null;
}

const fmtBRT = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const iso = (v: any): string | null => (v ? new Date(v).toISOString() : null);

let tableReady: Promise<boolean> | null = null;

export let lastScheduleTableError: string | null = null;

const CREATE_SQL = sql`CREATE TABLE IF NOT EXISTS "route_schedules" (
  "route_id" integer PRIMARY KEY,
  "scheduled_for" timestamptz,
  "publish_at" timestamptz,
  "publish_error" text,
  "published_at" timestamptz,
  "updated_at" timestamptz DEFAULT now() NOT NULL
)`;

/** Garante a tabela (cria pela conexão admin; se não der, confere se já existe). */
export function ensureScheduleTable(): Promise<boolean> {
  if (!tableReady) {
    tableReady = (async () => {
      try {
        await db.execute(CREATE_SQL);
        lastScheduleTableError = null;
        return true;
      } catch (e: any) {
        try {
          await db.execute(sql`SELECT 1 FROM "route_schedules" LIMIT 1`);
          lastScheduleTableError = null;
          return true;
        } catch {
          // Última tentativa: a conexão comum do app
          try {
            await appDb.execute(CREATE_SQL);
            return true;
          } catch (e2: any) {
            const why = (x: any) => String(x?.cause?.message || x?.message || x || '').split('\n')[0].slice(0, 200);
            lastScheduleTableError = `admin: ${why(e)} | app: ${why(e2)}`;
            console.error('[agendamento] tabela route_schedules indisponível:', lastScheduleTableError);
            tableReady = null; // tenta de novo na próxima chamada
            return false;
          }
        }
      }
    })();
  }
  return tableReady;
}

function rowOf(r: any): RouteSchedule {
  return {
    route_id: Number(r.route_id),
    scheduled_for: iso(r.scheduled_for),
    publish_at: iso(r.publish_at),
    publish_error: r.publish_error || null,
    published_at: iso(r.published_at),
  };
}

const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : res?.rows || []);

export class ScheduleService {
  /** Agendamentos das rotas informadas (falha aqui nunca derruba a listagem de rotas). */
  async getMany(routeIds: number[]): Promise<Map<number, RouteSchedule>> {
    const out = new Map<number, RouteSchedule>();
    const ids = routeIds.filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length || !(await ensureScheduleTable())) return out;
    try {
      const res = await db.execute(
        sql`SELECT * FROM "route_schedules" WHERE "route_id" IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`
      );
      for (const r of rowsOf(res)) out.set(Number(r.route_id), rowOf(r));
    } catch (e: any) {
      console.warn('[agendamento] leitura falhou:', e?.message);
    }
    return out;
  }

  async get(routeId: number): Promise<RouteSchedule | null> {
    return (await this.getMany([routeId])).get(routeId) || null;
  }

  /** Acrescenta scheduled_for / publish_at / publish_error às rotas (para a tela). */
  async decorate<T extends { id: number }>(list: T[]): Promise<(T & Partial<RouteSchedule>)[]> {
    const map = await this.getMany(list.map((r) => r.id));
    return list.map((r) => {
      const s = map.get(r.id);
      return s
        ? { ...r, scheduled_for: s.scheduled_for, publish_at: s.publish_at, publish_error: s.publish_error, schedule_published_at: s.published_at }
        : r;
    });
  }

  /** Define (ou remove, com null) a data/hora de entrega. Ajusta a publicação programada, se houver. */
  async setScheduledFor(routeId: number, when: Date | null): Promise<RouteSchedule> {
    if (!(await ensureScheduleTable())) throw new Error(`SCHEDULE_UNAVAILABLE: ${lastScheduleTableError || ''}`);
    const current = await this.get(routeId);
    const publishAt =
      when && current?.publish_at ? new Date(when.getTime() - OFFER_LEAD_MINUTES() * 60_000) : null;
    await db.execute(sql`
      INSERT INTO "route_schedules" ("route_id", "scheduled_for", "publish_at", "publish_error", "updated_at")
      VALUES (${routeId}, ${when ? when.toISOString() : null}, ${publishAt ? publishAt.toISOString() : null}, NULL, now())
      ON CONFLICT ("route_id") DO UPDATE SET
        "scheduled_for" = EXCLUDED."scheduled_for",
        "publish_at" = EXCLUDED."publish_at",
        "publish_error" = NULL,
        "updated_at" = now()`);
    if (when) await routeService.setFinalDeadlineText(routeId, `Entregar às ${fmtBRT(when)}`).catch(() => {});
    return (await this.get(routeId))!;
  }

  /**
   * Programa a publicação da oferta (entrega − antecedência). Se esse horário já passou,
   * publica na hora. A rota precisa estar em rascunho e ter data/hora de entrega.
   */
  async schedulePublish(routeId: number, actor: string): Promise<{ schedule: RouteSchedule; publishedNow: boolean }> {
    const route = await routeService.getRouteById(routeId);
    if (!route) throw new Error('ROUTE_NOT_FOUND');
    if (route.status !== 'DRAFT') throw new Error('ROUTE_NOT_DRAFT');
    const s = await this.get(routeId);
    if (!s?.scheduled_for) throw new Error('SCHEDULED_FOR_REQUIRED');
    const delivery = new Date(s.scheduled_for);
    if (delivery.getTime() < Date.now()) throw new Error('SCHEDULED_FOR_IN_PAST');
    const publishAt = new Date(delivery.getTime() - OFFER_LEAD_MINUTES() * 60_000);

    if (publishAt.getTime() <= Date.now()) {
      await routeService.publishRoute(routeId, actor);
      await db.execute(sql`UPDATE "route_schedules" SET "publish_at" = NULL, "publish_error" = NULL,
        "published_at" = now(), "updated_at" = now() WHERE "route_id" = ${routeId}`);
      return { schedule: (await this.get(routeId))!, publishedNow: true };
    }
    await db.execute(sql`UPDATE "route_schedules" SET "publish_at" = ${publishAt.toISOString()}, "publish_error" = NULL,
      "updated_at" = now() WHERE "route_id" = ${routeId}`);
    await routeService.logRouteEvent(routeId, 'ROUTE_UPDATED', actor, `Oferta agendada para ${fmtBRT(publishAt)} (entrega ${fmtBRT(delivery)}).`).catch(() => {});
    return { schedule: (await this.get(routeId))!, publishedNow: false };
  }

  async unschedulePublish(routeId: number, actor: string): Promise<RouteSchedule | null> {
    if (!(await ensureScheduleTable())) throw new Error('SCHEDULE_UNAVAILABLE');
    await db.execute(sql`UPDATE "route_schedules" SET "publish_at" = NULL, "publish_error" = NULL, "updated_at" = now()
      WHERE "route_id" = ${routeId}`);
    await routeService.logRouteEvent(routeId, 'ROUTE_UPDATED', actor, 'Oferta agendada desfeita (volta a ser rascunho comum).').catch(() => {});
    return this.get(routeId);
  }

  /**
   * Publica as ofertas cujo horário chegou. Cada rota é "reservada" com um UPDATE atômico,
   * então duas execuções simultâneas (timer interno + chamada externa) não publicam em dobro.
   */
  async tick(): Promise<{ due: number; published: number; failed: number }> {
    const result = { due: 0, published: 0, failed: 0 };
    if (!(await ensureScheduleTable())) return result;
    const dueRes = await db.execute(
      sql`SELECT "route_id", "publish_at" FROM "route_schedules" WHERE "publish_at" IS NOT NULL AND "publish_at" <= now() ORDER BY "publish_at" LIMIT 20`
    );
    for (const r of rowsOf(dueRes)) {
      result.due++;
      const id = Number(r.route_id);
      const claimed = rowsOf(
        await db.execute(sql`UPDATE "route_schedules" SET "publish_at" = NULL, "updated_at" = now()
          WHERE "route_id" = ${id} AND "publish_at" IS NOT NULL RETURNING "route_id"`)
      );
      if (!claimed.length) continue; // outra execução já pegou
      try {
        const route = await routeService.getRouteById(id);
        if (!route || route.status !== 'DRAFT') continue; // publicada à mão, cancelada ou excluída
        await routeService.publishRoute(id, 'AGENDADOR');
        await db.execute(sql`UPDATE "route_schedules" SET "published_at" = now(), "publish_error" = NULL, "updated_at" = now()
          WHERE "route_id" = ${id}`);
        result.published++;
      } catch (e: any) {
        result.failed++;
        const msg = String(e?.message || e).slice(0, 300);
        // Nova tentativa em 5 min (ex.: nenhum motorista ativo no momento), até o horário da entrega
        const s = await this.get(id).catch(() => null);
        const stillTime = s?.scheduled_for && Date.parse(s.scheduled_for) > Date.now();
        await db.execute(sql`UPDATE "route_schedules" SET
          "publish_at" = ${stillTime ? sql`now() + interval '5 minutes'` : sql`NULL`},
          "publish_error" = ${msg}, "updated_at" = now() WHERE "route_id" = ${id}`).catch(() => {});
        console.warn(`[agendamento] rota #${id} não publicada: ${msg}`);
      }
    }
    return result;
  }
}

export const scheduleService = new ScheduleService();
