import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDef, autoShorten, itemByKey } from "../src/checklist-def.js";

const DATA = fileURLToPath(new URL("../data", import.meta.url));
const full = readFileSync(path.join(DATA, "checklist.md"), "utf8");
const compact = readFileSync(path.join(DATA, "checklist_compact.md"), "utf8");

describe("buildDef", () => {
  it("parseia todos os grupos e itens do checklist USA", () => {
    const def = buildDef(full, compact);
    expect(def.groups.length).toBe(8); // 7 seções + subgrupo 5.1 (a 4 foi removida)
    expect(def.totalItems).toBe(37);
    const titles = def.groups.map((g) => g.title);
    expect(titles[0]).toBe("COMUNICAÇÃO");
    expect(titles).toContain("MOCHILA PEDIÁTRICA");
    expect(titles.join(" ")).not.toMatch(/HEMOGAS/i);
  });

  it("deriva chaves do número do heading (estáveis a remoções)", () => {
    const def = buildDef(full, compact);
    expect(def.groups.map((g) => g.key)).toEqual(["g1", "g2", "g3", "g5", "g5.1", "g6", "g7", "g8"]);
    expect(def.groups.find((g) => g.key === "g5.1")!.items[0]!.key).toBe("g5.1i1");
  });

  it("usa rótulos curtos do compact quando em sincronia", () => {
    const def = buildDef(full, compact);
    const first = def.groups[0]!.items[0]!;
    expect(first.shortLabel).toBe("Radio");
    expect(first.kind).toBe("check");
  });

  it("detecta campos de lacre e datas com defaults automáticos", () => {
    const def = buildDef(full, compact);
    const ped = def.groups.find((g) => g.title === "MOCHILA PEDIÁTRICA")!;
    expect(ped.items.map((i) => i.kind)).toEqual(["text", "date", "date"]);
    expect(ped.items.map((i) => i.autoDefault)).toEqual([undefined, "today", "tomorrow"]);
  });

  it("cai para heurística quando compact está fora de sincronia", () => {
    const def = buildDef(full, "## 1. X\n\n- [ ] Só um item\n");
    expect(def.totalItems).toBe(37);
    const first = def.groups[0]!.items[0]!;
    expect(first.shortLabel.length).toBeLessThanOrEqual(35);
  });

  it("itemByKey resolve chaves estáveis", () => {
    const def = buildDef(full, compact);
    expect(itemByKey(def, "g1i1")?.label).toContain("RÁDIO");
    expect(itemByKey(def, "nao-existe")).toBeUndefined();
  });
});

describe("autoShorten", () => {
  it("remove parênteses e limita tamanho", () => {
    const s = autoShorten("LARINGOSCÓPIO ADULTO (CABO DE FIBRA ÓPTICA + LÂMINAS MILLER 3–4)");
    expect(s).toBe("Laringoscópio adulto");
  });
});
