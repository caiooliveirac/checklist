import { plantoesDb } from "./db.js";
import { nameMatchScore } from "./text.js";

/**
 * Integração read-only com o banco do plantoes (plantoes.mnrs.com.br), que
 * roda no mesmo servidor. Daqui vem quem está de plantão em cada USA agora e
 * o telegram_user_id provável do médico (via mensagens do grupo do bot).
 */

export interface OnDuty {
  baseId: number;
  baseCode: string;
  baseLabel: string;
  doctorId: string | null;
  doctorName: string | null;
  displayName: string | null;
  shiftLabel: string | null;
  startedAt: string | null;
  scheduledEndAt: string | null;
  occupancyId: string | null;
  /** Telegram user id resolvido por matching de nome nas mensagens do grupo. */
  telegramUserId: string | null;
}

/** Bases USA de contingência caso o banco do plantoes esteja indisponível. */
const FALLBACK_BASES = [
  "SM01", "CB02", "PR03", "PM04", "BR05", "CN10",
  "PP20", "IT30", "PM40", "CZ50", "BR60", "CC70",
];

interface CacheEntry {
  at: number;
  data: OnDuty[];
  degraded: boolean;
}

let cache: CacheEntry | null = null;
const CACHE_MS = 15_000;

async function queryBoard(): Promise<OnDuty[]> {
  if (!plantoesDb) throw new Error("PLANTOES_DATABASE_URL não configurado");

  const { rows } = await plantoesDb.query(`
    SELECT
      b.id            AS base_id,
      b.code          AS base_code,
      b.label         AS base_label,
      d.id            AS doctor_id,
      d.full_name     AS full_name,
      d.display_name  AS display_name,
      o.shift_label   AS shift_label,
      o.started_at    AS started_at,
      o.scheduled_end_at AS scheduled_end_at,
      o.id            AS occupancy_id
    FROM operations_v2.intervention_bases b
    LEFT JOIN LATERAL (
      SELECT * FROM operations_v2.intervention_occupancies io
      WHERE io.base_id = b.id AND io.ended_at IS NULL
      ORDER BY io.started_at DESC
      LIMIT 1
    ) o ON true
    LEFT JOIN operations_v2.doctors d ON d.id = o.doctor_id
    WHERE b.is_active
    ORDER BY b.sort_order, b.code
  `);

  const senders = await recentGroupSenders();

  return rows.map((r) => {
    const doctorName: string | null = r.display_name ?? r.full_name ?? null;
    return {
      baseId: r.base_id,
      baseCode: r.base_code,
      baseLabel: r.base_label,
      doctorId: r.doctor_id ?? null,
      doctorName: r.full_name ?? null,
      displayName: doctorName,
      shiftLabel: r.shift_label ?? null,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
      scheduledEndAt: r.scheduled_end_at ? new Date(r.scheduled_end_at).toISOString() : null,
      occupancyId: r.occupancy_id ?? null,
      telegramUserId: doctorName ? resolveTelegramId(r.full_name ?? doctorName, senders) : null,
    };
  });
}

interface GroupSender {
  telegramId: string;
  name: string;
}

/** Remetentes recentes do grupo do plantões (últimas 36h), mais recentes primeiro. */
async function recentGroupSenders(): Promise<GroupSender[]> {
  if (!plantoesDb) return [];
  try {
    const { rows } = await plantoesDb.query(`
      SELECT DISTINCT ON (sender_telegram_id)
        sender_telegram_id AS id,
        sender_name        AS name
      FROM operations_v2.telegram_ingested_messages
      WHERE created_at > now() - interval '36 hours'
        AND sender_telegram_id IS NOT NULL
        AND sender_name IS NOT NULL
      ORDER BY sender_telegram_id, created_at DESC
    `);
    return rows.map((r) => ({ telegramId: String(r.id), name: String(r.name) }));
  } catch {
    return [];
  }
}

export function resolveTelegramId(doctorName: string, senders: GroupSender[]): string | null {
  let best: { id: string; score: number } | null = null;
  for (const s of senders) {
    const score = nameMatchScore(doctorName, s.name);
    if (score >= 2 && (!best || score > best.score)) best = { id: s.telegramId, score };
  }
  return best?.id ?? null;
}

/** Board com cache de 15s; nunca lança — degrada para a lista fixa de bases. */
export async function getBoard(): Promise<{ board: OnDuty[]; degraded: boolean }> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return { board: cache.data, degraded: cache.degraded };
  try {
    const data = await queryBoard();
    cache = { at: now, data, degraded: false };
    return { board: data, degraded: false };
  } catch (err) {
    console.error("[plantoes] falha ao consultar board:", err);
    const data: OnDuty[] = FALLBACK_BASES.map((code, i) => ({
      baseId: -(i + 1),
      baseCode: code,
      baseLabel: code,
      doctorId: null,
      doctorName: null,
      displayName: null,
      shiftLabel: null,
      startedAt: null,
      scheduledEndAt: null,
      occupancyId: null,
      telegramUserId: null,
    }));
    cache = { at: now, data, degraded: true };
    return { board: data, degraded: true };
  }
}

export async function plantoesHealthy(): Promise<boolean> {
  if (!plantoesDb) return false;
  try {
    await plantoesDb.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
