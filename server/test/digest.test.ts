import { describe, expect, it } from "vitest";
import { renderDigestMessage, type DigestData } from "../src/digest.js";
import { validateItems, renderSummaryText, ValidationError, type AnsweredItem } from "../src/submissions.js";
import { buildDef } from "../src/checklist-def.js";
import type { OnDuty } from "../src/plantoes.js";

const MD = `## 1. GRUPO A

- [ ] ITEM UM (DETALHE)
- [ ] LACRE (XXXX)

## 2. GRUPO B

- [ ] ITEM DOIS
`;

const def = buildDef(MD);

function base(code: string, doctor: string | null, tg: string | null = null): OnDuty {
  return {
    baseId: 1,
    baseCode: code,
    baseLabel: code,
    doctorId: doctor ? "d-1" : null,
    doctorName: doctor,
    displayName: doctor,
    shiftLabel: doctor ? "SD" : null,
    startedAt: null,
    scheduledEndAt: null,
    occupancyId: null,
    telegramUserId: tg,
  };
}

describe("validateItems", () => {
  it("exige resposta para todos os itens", () => {
    expect(() => validateItems(def, [{ key: "g1i1", state: "ok" }])).toThrow(ValidationError);
  });

  it("exige valor nos campos (lacre) e aceita checklist completo", () => {
    const answers: AnsweredItem[] = [
      { key: "g1i1", state: "ok" },
      { key: "g1i2", state: "ok", value: "12345" },
      { key: "g2i1", state: "missing", obs: "em falta no almox" },
    ];
    const ordered = validateItems(def, answers);
    expect(ordered).toHaveLength(3);
    expect(() =>
      validateItems(def, [
        { key: "g1i1", state: "ok" },
        { key: "g1i2", state: "ok" }, // lacre sem valor
        { key: "g2i1", state: "ok" },
      ]),
    ).toThrow(/Preencha o campo/);
  });
});

describe("renderSummaryText", () => {
  it("gera texto no formato ✅/🚫 com Obs", () => {
    const text = renderSummaryText(
      def,
      [
        { key: "g1i1", state: "ok" },
        { key: "g1i2", state: "ok", value: "889" },
        { key: "g2i1", state: "missing", obs: "sem estoque" },
      ],
      "CABEÇALHO",
    );
    expect(text).toContain("CABEÇALHO");
    expect(text).toContain("✅ Item um");
    expect(text).toContain(": 889");
    expect(text).toContain("🚫 Item dois — Obs: sem estoque");
  });
});

describe("renderDigestMessage", () => {
  it("lista pendentes com contato e feitos com horário", () => {
    const data: DigestData = {
      day: "2026-07-16",
      dayLabel: "quarta, 16 de julho",
      degraded: false,
      done: [
        {
          base: base("SM01", "Felipe Carneiro"),
          sub: {
            id: "s1",
            baseCode: "SM01",
            doctorName: "Felipe Carneiro",
            shiftLabel: "SD",
            okCount: 39,
            missingCount: 1,
            obsCount: 1,
            totalItems: 40,
            createdAt: "2026-07-16T11:12:00.000Z",
            items: [{ key: "g1i1", state: "missing", obs: "sem bateria" }],
          },
        },
      ],
      pending: [base("CB02", "Uemerson Reis", "42"), base("PR03", null)],
    };
    const msg = renderDigestMessage(data, "11:00");
    expect(msg).toContain("Checklist USA");
    expect(msg).toContain("Pendentes (2/3)");
    expect(msg).toContain('tg://user?id=42');
    expect(msg).toContain("sem médico registrado");
    expect(msg).toContain("Feitos (1/3)");
    expect(msg).toContain("SM01");
    expect(msg).toContain("08:12"); // 11:12Z = 08:12 na Bahia
    expect(msg).toContain("Itens faltando reportados");
  });

  it("celebra quando não há pendências", () => {
    const data: DigestData = {
      day: "2026-07-16",
      dayLabel: "quarta, 16 de julho",
      degraded: false,
      done: [],
      pending: [],
    };
    expect(renderDigestMessage(data, "13:00")).toContain("nenhum até agora");
  });
});
