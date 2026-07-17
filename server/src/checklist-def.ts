import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Definição do checklist a partir do Markdown (fonte de verdade herdada do
 * samu-normas): grupos são headings "## N. NOME" / "### N.N NOME" e itens são
 * task-list "- [ ] ...". Itens de LACRE/DATA viram campos de preenchimento.
 */

export type ItemKind = "check" | "text" | "date";

export interface ChecklistItem {
  key: string;
  label: string;
  shortLabel: string;
  kind: ItemKind;
  /** Placeholder para campos (ex.: "número do lacre"). */
  hint?: string;
  /** Default automático de campos de data quando não há valor herdado. */
  autoDefault?: "today" | "tomorrow";
}

export interface ChecklistGroup {
  key: string;
  title: string;
  items: ChecklistItem[];
}

export interface ChecklistDef {
  groups: ChecklistGroup[];
  totalItems: number;
  version: string;
}

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));

interface RawGroup {
  /** Número do heading ("5", "5.1"…) — base das chaves; estável entre versões. */
  num: string;
  title: string;
  items: string[];
}

function parseMarkdown(md: string): RawGroup[] {
  const groups: RawGroup[] = [];
  let current: RawGroup | null = null;
  let seq = 0;
  for (const line of md.split(/\r?\n/)) {
    const heading = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (heading?.[1]) {
      const full = heading[1].trim();
      seq += 1;
      const numbered = full.match(/^(\d+(?:\.\d+)?)\.?\s*(.*)$/);
      current = {
        num: numbered?.[1] ?? `x${seq}`,
        title: numbered?.[2]?.trim() || full,
        items: [],
      };
      groups.push(current);
      continue;
    }
    const item = line.match(/^-\s*\[\s*[xX ]?\s*\]\s+(.+?)\s*$/);
    if (item?.[1] && current) current.items.push(item[1].trim());
  }
  return groups.filter((g) => g.items.length > 0);
}

function detectKind(label: string): { kind: ItemKind; hint?: string; autoDefault?: "today" | "tomorrow" } {
  const upper = label.toUpperCase();
  if (upper.startsWith("LACRE")) return { kind: "text", hint: "Número do lacre" };
  if (upper.startsWith("CHECADA EM")) return { kind: "date", autoDefault: "today" };
  if (upper.includes("PRÓXIMA TROCA") || upper.includes("PROXIMA TROCA")) return { kind: "date", autoDefault: "tomorrow" };
  if (upper.includes("PREENCHER DATA")) return { kind: "date" };
  return { kind: "check" };
}

/** Encurtamento heurístico usado quando o compact.md está fora de sincronia. */
export function autoShorten(label: string): string {
  const noParens = label.replace(/\s*\([^)]*\)/g, "").trim();
  const cut = noParens.length > 34 ? `${noParens.slice(0, 32).trimEnd()}…` : noParens;
  return cut.charAt(0) + cut.slice(1).toLowerCase();
}

function stripNumber(title: string): string {
  return title.replace(/^\d+(?:\.\d+)?\.?\s*/, "").trim();
}

export function buildDef(fullMd: string, compactMd?: string): ChecklistDef {
  const full = parseMarkdown(fullMd);
  const compact = compactMd ? parseMarkdown(compactMd) : [];

  const fullCount = full.reduce((n, g) => n + g.items.length, 0);
  const compactCount = compact.reduce((n, g) => n + g.items.length, 0);
  const compactFlat = fullCount === compactCount ? compact.flatMap((g) => g.items) : null;

  let idx = 0;
  const groups: ChecklistGroup[] = full.map((g) => ({
    key: `g${g.num}`,
    title: stripNumber(g.title),
    items: g.items.map((label, ii) => {
      const short = compactFlat?.[idx] ?? autoShorten(label);
      idx += 1;
      const { kind, hint, autoDefault } = detectKind(label);
      const item: ChecklistItem = { key: `g${g.num}i${ii + 1}`, label, shortLabel: short, kind };
      if (hint) item.hint = hint;
      if (autoDefault) item.autoDefault = autoDefault;
      return item;
    }),
  }));

  return { groups, totalItems: fullCount, version: "usa-v2" };
}

let cached: ChecklistDef | null = null;

/** Definição carregada de server/data (cacheada — os arquivos são imutáveis no deploy). */
export function getChecklistDef(): ChecklistDef {
  if (!cached) {
    const full = readFileSync(path.join(DATA_DIR, "checklist.md"), "utf8");
    let compact: string | undefined;
    try {
      compact = readFileSync(path.join(DATA_DIR, "checklist_compact.md"), "utf8");
    } catch {
      compact = undefined;
    }
    cached = buildDef(full, compact);
  }
  return cached;
}

export function itemByKey(def: ChecklistDef, key: string): ChecklistItem | undefined {
  for (const g of def.groups) {
    const item = g.items.find((i) => i.key === key);
    if (item) return item;
  }
  return undefined;
}
