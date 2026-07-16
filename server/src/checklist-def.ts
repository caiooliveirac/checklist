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
  title: string;
  items: string[];
}

function parseMarkdown(md: string): RawGroup[] {
  const groups: RawGroup[] = [];
  let current: RawGroup | null = null;
  for (const line of md.split(/\r?\n/)) {
    const heading = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (heading?.[1]) {
      current = { title: heading[1].trim(), items: [] };
      groups.push(current);
      continue;
    }
    const item = line.match(/^-\s*\[\s*[xX ]?\s*\]\s+(.+?)\s*$/);
    if (item?.[1] && current) current.items.push(item[1].trim());
  }
  return groups.filter((g) => g.items.length > 0);
}

function detectKind(label: string): { kind: ItemKind; hint?: string } {
  const upper = label.toUpperCase();
  if (upper.includes("PREENCHER DATA")) return { kind: "date" };
  if (upper.startsWith("LACRE")) return { kind: "text", hint: "Número do lacre" };
  if (upper.startsWith("CHECADA EM")) return { kind: "date" };
  if (upper.includes("PRÓXIMA TROCA") || upper.includes("PROXIMA TROCA")) return { kind: "date" };
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
  const groups: ChecklistGroup[] = full.map((g, gi) => ({
    key: `g${gi + 1}`,
    title: stripNumber(g.title),
    items: g.items.map((label, ii) => {
      const short = compactFlat?.[idx] ?? autoShorten(label);
      idx += 1;
      const { kind, hint } = detectKind(label);
      return { key: `g${gi + 1}i${ii + 1}`, label, shortLabel: short, kind, hint };
    }),
  }));

  return { groups, totalItems: fullCount, version: "usa-v1" };
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
