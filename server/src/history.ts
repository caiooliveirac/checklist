import { db } from "./db.js";
import { bahiaDay, bahiaTime } from "./day.js";
import { getChecklistDef, itemByKey, type ChecklistDef } from "./checklist-def.js";
import type { AnsweredItem } from "./submissions.js";

/**
 * Histórico de materiais por unidade: em que dias cada item foi reportado
 * presente/faltando e por quem — a trilha para localizar sumiços.
 */

export const HISTORY_DAYS = 14;

export interface HistoryRow {
  day: string; // YYYY-MM-DD
  doctorName: string;
  createdAt: Date;
  items: AnsweredItem[];
}

/** Última submissão de cada dia da janela, mais recente primeiro. */
export async function recentHistory(baseCode: string, days = HISTORY_DAYS): Promise<HistoryRow[]> {
  const cutoff = bahiaDay(new Date(Date.now() - (days - 1) * 86_400_000));
  const { rows } = await db.query(
    `SELECT DISTINCT ON (day) day::text AS day, doctor_name, created_at, items
     FROM submissions
     WHERE base_code = $1 AND day >= $2
     ORDER BY day DESC, created_at DESC`,
    [baseCode.toUpperCase(), cutoff],
  );
  return rows.map((r) => ({
    day: String(r.day),
    doctorName: String(r.doctor_name),
    createdAt: new Date(r.created_at),
    items: Array.isArray(r.items) ? (r.items as AnsweredItem[]) : [],
  }));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "2026-07-16" → "16/07". */
function fmtDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/** Dias-calendário da janela (hoje primeiro), no fuso da Bahia. */
function windowDays(days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(bahiaDay(new Date(Date.now() - i * 86_400_000)));
  return out;
}

/**
 * Rótulos de botão para todos os materiais, desambiguando rótulos curtos
 * repetidos entre seções (ex.: "Máscaras" adulto × pediátrica).
 */
export function materialButtons(def: ChecklistDef = getChecklistDef()): { key: string; label: string }[] {
  const all = def.groups.flatMap((g) => g.items.map((i) => ({ group: g.title, key: i.key, label: i.shortLabel })));
  const counts = new Map<string, number>();
  for (const a of all) counts.set(a.label, (counts.get(a.label) ?? 0) + 1);
  return all.map((a) => {
    if ((counts.get(a.label) ?? 0) <= 1) return { key: a.key, label: a.label };
    const ped = /PEDI|INFANTIL|NEONATAL/i.test(a.group);
    return { key: a.key, label: `${a.label} (${ped ? "ped" : "adulto"})` };
  });
}

/** Histórico de um material numa unidade: linha por dia + último a reportar presente. */
export async function materialHistoryText(baseCode: string, itemKey: string): Promise<string> {
  const def = getChecklistDef();
  const item = itemByKey(def, itemKey);
  if (!item) return `Material não encontrado (${esc(itemKey)}).`;

  const history = await recentHistory(baseCode);
  const byDay = new Map(history.map((h) => [h.day, h]));
  const code = baseCode.toUpperCase();

  const lines = [
    `🔎 <b>${esc(item.shortLabel)}</b> — ${esc(code)}, últimos ${HISTORY_DAYS} dias`,
    `<i>${esc(item.label)}</i>`,
    "",
  ];

  let lastPresent: { day: string; row: HistoryRow; answer: AnsweredItem } | null = null;
  let anyData = false;

  for (const day of windowDays(HISTORY_DAYS)) {
    const row = byDay.get(day);
    if (!row) {
      lines.push(`${fmtDay(day)} · <i>sem checklist</i>`);
      continue;
    }
    anyData = true;
    const answer = row.items.find((i) => i.key === itemKey);
    if (!answer) {
      lines.push(`${fmtDay(day)} · <i>item não constava</i>`);
      continue;
    }
    const who = esc(row.doctorName);
    if (answer.state === "ok") {
      if (!lastPresent) lastPresent = { day, row, answer };
      const extra = [answer.value ? `: ${esc(answer.value)}` : "", answer.obs ? ` — <i>${esc(answer.obs)}</i>` : ""].join("");
      lines.push(`${fmtDay(day)} ✅ presente — ${who}${extra}`);
    } else {
      lines.push(`${fmtDay(day)} 🚫 <b>FALTANDO</b> — ${who}${answer.obs ? ` — <i>${esc(answer.obs)}</i>` : ""}`);
    }
  }

  lines.push("");
  if (!anyData) {
    lines.push(`Nenhum checklist da ${esc(code)} na janela.`);
  } else if (lastPresent) {
    lines.push(
      `👉 <b>Último a reportar presente:</b> ${esc(lastPresent.row.doctorName)} em ${fmtDay(lastPresent.day)} às ${bahiaTime(lastPresent.row.createdAt)}`,
    );
  } else {
    lines.push("👉 Nenhum registro de presença na janela.");
  }
  return lines.join("\n");
}

export interface MissingSummary {
  key: string;
  label: string;
  days: { day: string; doctorName: string; obs?: string }[];
}

/** Itens que faltaram nos últimos dias numa unidade. */
export async function recentMissing(baseCode: string): Promise<{ history: HistoryRow[]; missing: MissingSummary[] }> {
  const def = getChecklistDef();
  const history = await recentHistory(baseCode);
  const byKey = new Map<string, MissingSummary>();
  for (const row of history) {
    for (const answer of row.items) {
      if (answer.state !== "missing") continue;
      const item = itemByKey(def, answer.key);
      let entry = byKey.get(answer.key);
      if (!entry) {
        entry = { key: answer.key, label: item?.shortLabel ?? answer.key, days: [] };
        byKey.set(answer.key, entry);
      }
      const dayEntry: { day: string; doctorName: string; obs?: string } = { day: row.day, doctorName: row.doctorName };
      if (answer.obs) dayEntry.obs = answer.obs;
      entry.days.push(dayEntry);
    }
  }
  const missing = [...byKey.values()].sort((a, b) => b.days.length - a.days.length);
  return { history, missing };
}

export function missingSummaryText(baseCode: string, data: { history: HistoryRow[]; missing: MissingSummary[] }): string {
  const code = baseCode.toUpperCase();
  if (data.history.length === 0) {
    return `📉 <b>${esc(code)}</b> — nenhum checklist nos últimos ${HISTORY_DAYS} dias.`;
  }
  if (data.missing.length === 0) {
    return `📉 <b>${esc(code)}</b> — nenhuma falta reportada nos últimos ${HISTORY_DAYS} dias ✨ (${data.history.length} ${data.history.length === 1 ? "checklist" : "checklists"} na janela)`;
  }
  const lines = [`📉 <b>${esc(code)} — faltas nos últimos ${HISTORY_DAYS} dias</b>`, ""];
  for (const m of data.missing) {
    const daysTxt = m.days
      .slice(0, 4)
      .map((d) => `${fmtDay(d.day)} (${esc(d.doctorName.split(" ")[0] ?? d.doctorName)})`)
      .join(", ");
    lines.push(`🚫 <b>${esc(m.label)}</b> — faltou em ${daysTxt}${m.days.length > 4 ? ` +${m.days.length - 4}` : ""}`);
  }
  lines.push("", "👇 Toque num item para ver o histórico completo (quem reportou presente por último).");
  return lines.join("\n");
}
