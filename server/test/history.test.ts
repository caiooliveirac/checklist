import { describe, expect, it } from "vitest";
import { materialButtons, missingSummaryText, HISTORY_DAYS } from "../src/history.js";
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
