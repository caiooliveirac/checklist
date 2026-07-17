import { randomInt } from "node:crypto";
import { db } from "./db.js";
import { bahiaDay } from "./day.js";

/**
 * Chave do dia por ambulância: o bot entrega ao médico de plantão (privado ou
 * grupo) e a web exige no envio do checklist quando CHECKLIST_KEY_REQUIRED=true.
 */

export function generateKeyword(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

/** Chave de hoje para a base — cria na primeira consulta do dia. */
export async function getOrCreateKey(baseCode: string, day = bahiaDay()): Promise<string> {
  const code = baseCode.toUpperCase();
  const { rows } = await db.query(
    `INSERT INTO base_keys (day, base_code, keyword)
     VALUES ($1, $2, $3)
     ON CONFLICT (day, base_code) DO UPDATE SET keyword = base_keys.keyword
     RETURNING keyword`,
    [day, code, generateKeyword()],
  );
  return String(rows[0]?.keyword ?? "");
}

export async function verifyKey(baseCode: string, keyword: string, day = bahiaDay()): Promise<boolean> {
  const provided = (keyword ?? "").replace(/\D/g, "");
  if (!provided) return false;
  const { rows } = await db.query(`SELECT keyword FROM base_keys WHERE day = $1 AND base_code = $2`, [
    day,
    baseCode.toUpperCase(),
  ]);
  return rows.length > 0 && String(rows[0]?.keyword) === provided;
}
