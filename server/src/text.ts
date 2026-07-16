import { createHash } from "node:crypto";

/** Normalização e matching de nomes (médico do plantoes × remetente do Telegram). */

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "dr", "dra", "med", "medico"]);

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/**
 * Pontua a semelhança entre o nome do médico e o nome do remetente no grupo.
 * Considera match confiável com >= 2 tokens em comum (evita falsos positivos
 * com remetentes tipo "2032 MEDICO" ou nomes de função).
 */
export function nameMatchScore(doctorName: string, senderName: string): number {
  const d = new Set(nameTokens(doctorName));
  let score = 0;
  for (const t of nameTokens(senderName)) if (d.has(t)) score += 1;
  return score;
}

/** Hash simples (não reversível) para IP — mesmo espírito do samu-normas. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`checklist:${ip}`).digest("hex").slice(0, 32);
}
