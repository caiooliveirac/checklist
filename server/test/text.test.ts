import { describe, expect, it } from "vitest";
import { normalize, nameMatchScore } from "../src/text.js";
import { resolveTelegramId } from "../src/plantoes.js";

describe("normalize", () => {
  it("remove acentos e pontuação", () => {
    expect(normalize("Lúcio Álvarez-Parada")).toBe("lucio alvarez parada");
    expect(normalize("JOÃO  MATHEUS")).toBe("joao matheus");
  });
});

describe("nameMatchScore", () => {
  it("pontua tokens em comum ignorando conectivos", () => {
    expect(nameMatchScore("Lucio Alvarez Parada de Carvalho", "Lucio Parada")).toBe(2);
    expect(nameMatchScore("BEATRIZ PAMPONET BARRETO", "Beatriz Pamponet")).toBe(2);
  });

  it("não casa com remetentes genéricos/funcionais", () => {
    expect(nameMatchScore("João Matheus Dantas", "2032 MEDICO")).toBe(0);
    expect(nameMatchScore("Willy Rivera", "MR COI 1368")).toBe(0);
  });
});

describe("resolveTelegramId", () => {
  const senders = [
    { telegramId: "111", name: "Caroline Rabelo" },
    { telegramId: "222", name: "Lucio Parada" },
    { telegramId: "333", name: "2032 MEDICO" },
  ];

  it("resolve o id quando há match confiável (>=2 tokens)", () => {
    expect(resolveTelegramId("Lucio Alvarez Parada de Carvalho", senders)).toBe("222");
  });

  it("retorna null sem match confiável", () => {
    expect(resolveTelegramId("Felipe Rodrigues Santos Carneiro", senders)).toBeNull();
  });
});
