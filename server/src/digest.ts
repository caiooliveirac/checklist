import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { bahiaDay, bahiaDayLabel, bahiaTime } from "./day.js";
import { getBoard, type OnDuty } from "./plantoes.js";
import { latestByBase, type DaySubmission } from "./submissions.js";
import { getChecklistDef, itemByKey } from "./checklist-def.js";

/**
 * Digest da situação do dia: quem fez e quem não fez o checklist, com o médico
 * de plantão (via plantoes) e link de contato no Telegram quando resolvível.
 */

export interface DigestData {
  day: string;
  dayLabel: string;
  done: { base: OnDuty; sub: DaySubmission }[];
  pending: OnDuty[];
  degraded: boolean;
}

export async function collectDigestData(now: Date = new Date()): Promise<DigestData> {
  const day = bahiaDay(now);
  const [{ board, degraded }, subs] = await Promise.all([getBoard(), latestByBase(day)]);

  const done: { base: OnDuty; sub: DaySubmission }[] = [];
  const pending: OnDuty[] = [];
  for (const base of board) {
    const sub = subs.get(base.baseCode);
    if (sub) done.push({ base, sub });
    else pending.push(base);
  }
  return { day, dayLabel: bahiaDayLabel(now), done, pending, degraded };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function doctorRef(base: OnDuty): string {
  const name = base.displayName ?? base.doctorName;
  if (!name) return "<i>sem médico registrado no plantoes</i>";
  const label = esc(name);
  const shift = base.shiftLabel ? ` (${esc(base.shiftLabel)})` : "";
  if (base.telegramUserId) {
    return `<a href="tg://user?id=${base.telegramUserId}">${label}</a>${shift}`;
  }
  return `<b>${label}</b>${shift}`;
}

/** Mensagem HTML do digest para o Telegram. */
export function renderDigestMessage(data: DigestData, slot: string): string {
  const total = data.done.length + data.pending.length;
  const lines: string[] = [];
  lines.push(`📋 <b>Checklist USA — ${esc(data.dayLabel)} · ${esc(slot)}</b>`);
  if (data.degraded) lines.push("⚠️ <i>plantoes indisponível — sem nomes de plantão</i>");
  lines.push("");

  if (data.pending.length === 0) {
    lines.push(`🎉 <b>Todas as ${total} USAs enviaram o checklist hoje.</b>`);
  } else {
    lines.push(`⚠️ <b>Pendentes (${data.pending.length}/${total})</b> — médico de plantão:`);
    for (const base of data.pending) {
      lines.push(`• <b>${esc(base.baseCode)}</b> — ${doctorRef(base)}`);
    }
  }

  lines.push("");
  if (data.done.length > 0) {
    lines.push(`✅ <b>Feitos (${data.done.length}/${total})</b>:`);
    for (const { base, sub } of data.done) {
      const time = bahiaTime(new Date(sub.createdAt));
      const missing =
        sub.missingCount > 0 ? ` — 🚫 ${sub.missingCount} ${sub.missingCount === 1 ? "item" : "itens"}` : "";
      lines.push(`• <b>${esc(base.baseCode)}</b> ${time} — ${esc(sub.doctorName)}${missing}`);
    }
  } else {
    lines.push("✅ <b>Feitos:</b> nenhum até agora.");
  }

  const withMissing = data.done.filter((d) => d.sub.missingCount > 0);
  if (withMissing.length > 0) {
    const def = getChecklistDef();
    lines.push("");
    lines.push("🚫 <b>Itens faltando reportados:</b>");
    for (const { base, sub } of withMissing) {
      for (const item of sub.items.filter((i) => i.state === "missing")) {
        const label = itemByKey(def, item.key)?.shortLabel ?? item.key;
        const obs = item.obs ? ` — <i>${esc(item.obs)}</i>` : "";
        lines.push(`• ${esc(base.baseCode)}: ${esc(label)}${obs}`);
      }
    }
  }

  return lines.join("\n");
}

/** Já houve envio com sucesso deste slot hoje? (dedupe) */
export async function alreadySent(day: string, slot: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM digest_logs WHERE day = $1 AND slot = $2 AND status = 'success' LIMIT 1`,
    [day, slot],
  );
  return rows.length > 0;
}

export async function logDigest(entry: {
  day: string;
  slot: string;
  status: "success" | "skipped" | "error";
  recipients?: string;
  message?: string;
  error?: string;
}): Promise<void> {
  await db.query(
    `INSERT INTO digest_logs (id, day, slot, status, recipients, message, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      randomUUID(),
      entry.day,
      entry.slot,
      entry.status,
      entry.recipients ?? "",
      entry.message ?? "",
      entry.error ?? "",
    ],
  );
}
