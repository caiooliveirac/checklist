import { describe, expect, it } from "vitest";
import { agregarFaltas, materialButtons, missingSummaryText, HISTORY_DAYS } from "../src/history.js";
import { getChecklistDef } from "../src/checklist-def.js";

describe("materialButtons", () => {
  it("cobre todos os itens e desambigua rótulos repetidos", () => {
    const def = getChecklistDef();
    const buttons = materialButtons(def);
    expect(buttons).toHaveLength(def.totalItems);
    const labels = buttons.map((b) => b.label);
    expect(new Set(labels).size).toBe(labels.length); // sem duplicados
    expect(labels).toContain("Máscaras (adulto)");
    expect(labels).toContain("Máscaras (ped)");
  });
});

describe("agregarFaltas", () => {
  const def = getChecklistDef();
  const item = def.groups[0]?.items[0];
  const agora = new Date("2026-09-12T15:00:00.000Z");

  it("fica com o checklist mais recente da base e ignora falta já corrigida", () => {
    const relatorio = agregarFaltas([
      {
        baseCode: "BR05",
        day: "2026-09-11",
        doctorName: "Ana",
        createdAt: new Date("2026-09-11T12:00:00.000Z"),
        items: [{ key: item!.key, state: "missing", obs: "sem estoque" }],
      },
      {
        baseCode: "BR05",
        day: "2026-09-12",
        doctorName: "Bia",
        createdAt: new Date("2026-09-12T12:00:00.000Z"),
        items: [{ key: item!.key, state: "ok" }],
      },
    ], def, { agora, horas: 48 });
    expect(relatorio.faltas).toEqual([]);
  });

  it("lista o que o último checklist da janela ainda marca faltando", () => {
    const relatorio = agregarFaltas([
      {
        baseCode: "IT30",
        day: "2026-09-12",
        doctorName: "Caio",
        createdAt: new Date("2026-09-12T11:00:00.000Z"),
        items: [{ key: item!.key, state: "missing", obs: "inoperante" }],
      },
    ], def, { agora, horas: 48 });
    expect(relatorio.faltas).toEqual([
      { base: "IT30", dia: "2026-09-12", medico: "Caio", label: item!.shortLabel, obs: "inoperante" },
    ]);
  });
});

describe("missingSummaryText", () => {
  it("resume faltas com dias e primeiro nome de quem reportou", () => {
    const text = missingSummaryText("SM01", {
      history: [{ day: "2026-07-16", doctorName: "Felipe Carneiro", createdAt: new Date(), items: [] }],
      missing: [
        {
          key: "g2i1",
          label: "Laringoscópio",
          days: [
            { day: "2026-07-16", doctorName: "Felipe Carneiro" },
            { day: "2026-07-14", doctorName: "Ana Souza", obs: "extraviado" },
          ],
        },
      ],
    });
    expect(text).toContain("SM01");
    expect(text).toContain("Laringoscópio");
    expect(text).toContain("16/07 (Felipe)");
    expect(text).toContain("14/07 (Ana)");
    expect(text).toContain(String(HISTORY_DAYS));
  });

  it("informa janela sem checklists e janela limpa", () => {
    expect(missingSummaryText("CB02", { history: [], missing: [] })).toContain("nenhum checklist");
    expect(
      missingSummaryText("CB02", {
        history: [{ day: "2026-07-16", doctorName: "X", createdAt: new Date(), items: [] }],
        missing: [],
      }),
    ).toContain("nenhuma falta");
  });
});

describe("generateKeyword", () => {
  it("gera 4 dígitos", async () => {
    const { generateKeyword } = await import("../src/keys.js");
    for (let i = 0; i < 20; i++) expect(generateKeyword()).toMatch(/^\d{4}$/);
  });
});
