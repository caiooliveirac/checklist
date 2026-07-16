import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { bahiaDay, bahiaTime } from "./day.js";
import { getChecklistDef, itemByKey, type ChecklistDef } from "./checklist-def.js";

/** Estado respondido de um item do checklist. */
export interface AnsweredItem {
  key: string;
  state: "ok" | "missing";
  /** Observação livre (opcional; esperada quando "missing"). */
  obs?: string;
  /** Valor para itens de campo (lacre/datas). */
  value?: string;
}

export interface SubmissionInput {
  baseCode: string;
  doctorName: string;
  doctorId?: string | null;
  occupancyId?: string | null;
  shiftLabel?: string | null;
  items: AnsweredItem[];
  ipHash?: string;
  userAgent?: string;
}

export interface SubmissionRecord {
  id: string;
  day: string;
  baseCode: string;
  doctorName: string;
  shiftLabel: string | null;
  okCount: number;
  missingCount: number;
  obsCount: number;
  totalItems: number;
  summaryText: string;
  createdAt: string;
  items: AnsweredItem[];
}

export class ValidationError extends Error {}

const MAX_TEXT = 300;

function clean(s: unknown, max = MAX_TEXT): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Valida a submissão contra a definição: todo item precisa de resposta. */
export function validateItems(def: ChecklistDef, raw: AnsweredItem[]): AnsweredItem[] {
  const byKey = new Map<string, AnsweredItem>();
  for (const r of raw ?? []) {
    if (!r || typeof r.key !== "string") continue;
    const item = itemByKey(def, r.key);
    if (!item) continue;
    const state = r.state === "missing" ? "missing" : "ok";
    const entry: AnsweredItem = { key: r.key, state };
    const obs = clean(r.obs);
    if (obs) entry.obs = obs;
    const value = clean(r.value, 80);
    if (item.kind !== "check") {
      if (!value && state === "ok") throw new ValidationError(`Preencha o campo: ${item.shortLabel}`);
      if (value) entry.value = value;
    }
    byKey.set(r.key, entry);
  }

  const missingAnswers: string[] = [];
  const ordered: AnsweredItem[] = [];
  for (const g of def.groups) {
    for (const item of g.items) {
      const answer = byKey.get(item.key);
      if (!answer) {
        missingAnswers.push(item.shortLabel);
        continue;
      }
      ordered.push(answer);
    }
  }
  if (missingAnswers.length > 0) {
    throw new ValidationError(
      `Checklist incompleto — responda item a item. Pendentes: ${missingAnswers.slice(0, 5).join("; ")}${missingAnswers.length > 5 ? "…" : ""}`,
    );
  }
  return ordered;
}

/** Texto-resumo no formato consagrado (✅/🚫 + "— Obs:"), usado no Telegram e auditoria. */
export function renderSummaryText(def: ChecklistDef, items: AnsweredItem[], header: string): string {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const lines: string[] = [header];
  for (const g of def.groups) {
    lines.push(`\n${g.title}`);
    for (const item of g.items) {
      const a = byKey.get(item.key);
      if (!a) continue;
      const mark = a.state === "missing" ? "🚫" : "✅";
      let line = `${mark} ${item.shortLabel}`;
      if (a.value) line += `: ${a.value}`;
      if (a.obs) line += ` — Obs: ${a.obs}`;
      lines.push(line);
    }
  }
  return lines.join("\n");
}

export interface StoredSubmission extends SubmissionRecord {
  missingItems: { label: string; obs?: string }[];
}

export async function createSubmission(input: SubmissionInput): Promise<StoredSubmission> {
  const def = getChecklistDef();
  const baseCode = clean(input.baseCode, 16).toUpperCase();
  const doctorName = clean(input.doctorName, 120);
  if (!baseCode) throw new ValidationError("Informe a unidade (base).");
  if (!doctorName || doctorName.length < 3) throw new ValidationError("Informe o nome do médico.");

  const items = validateItems(def, input.items);
  const now = new Date();
  const day = bahiaDay(now);

  const okCount = items.filter((i) => i.state === "ok").length;
  const missingCount = items.filter((i) => i.state === "missing").length;
  const obsCount = items.filter((i) => i.obs).length;

  const header = `CHECKLIST USA — ${baseCode} — ${doctorName} — ${day} ${bahiaTime(now)}`;
  const summaryText = renderSummaryText(def, items, header);

  const id = randomUUID();
  await db.query(
    `INSERT INTO submissions
       (id, day, base_code, doctor_name, doctor_id, occupancy_id, shift_label,
        items, total_items, ok_count, missing_count, obs_count, summary_text, ip_hash, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id,
      day,
      baseCode,
      doctorName,
      input.doctorId ?? null,
      input.occupancyId ?? null,
      input.shiftLabel ?? null,
      JSON.stringify(items),
      def.totalItems,
      okCount,
      missingCount,
      obsCount,
      summaryText,
      input.ipHash ?? null,
      clean(input.userAgent, 250) || null,
    ],
  );

  const missingItems = items
    .filter((i) => i.state === "missing")
    .map((i) => {
      const item = itemByKey(def, i.key);
      const out: { label: string; obs?: string } = { label: item?.shortLabel ?? i.key };
      if (i.obs) out.obs = i.obs;
      return out;
    });

  return {
    id,
    day,
    baseCode,
    doctorName,
    shiftLabel: input.shiftLabel ?? null,
    okCount,
    missingCount,
    obsCount,
    totalItems: def.totalItems,
    summaryText,
    createdAt: now.toISOString(),
    items,
    missingItems,
  };
}

export interface DaySubmission {
  id: string;
  baseCode: string;
  doctorName: string;
  shiftLabel: string | null;
  okCount: number;
  missingCount: number;
  obsCount: number;
  totalItems: number;
  createdAt: string;
  items: AnsweredItem[];
}

/** Última submissão de cada base no dia (a que vale para o status). */
export async function latestByBase(day: string): Promise<Map<string, DaySubmission>> {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (base_code)
       id, base_code, doctor_name, shift_label, ok_count, missing_count,
       obs_count, total_items, items, created_at
     FROM submissions
     WHERE day = $1
     ORDER BY base_code, created_at DESC`,
    [day],
  );
  const map = new Map<string, DaySubmission>();
  for (const r of rows) {
    map.set(String(r.base_code), {
      id: r.id,
      baseCode: r.base_code,
      doctorName: r.doctor_name,
      shiftLabel: r.shift_label,
      okCount: r.ok_count,
      missingCount: r.missing_count,
      obsCount: r.obs_count,
      totalItems: r.total_items,
      createdAt: new Date(r.created_at).toISOString(),
      items: Array.isArray(r.items) ? (r.items as AnsweredItem[]) : [],
    });
  }
  return map;
}
