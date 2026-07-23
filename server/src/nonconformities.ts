import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { bahiaDay } from "./day.js";

/**
 * Inconformidades com foto: o plantonista fotografa algo fora do padrão na
 * unidade e descreve. A imagem mora no banco (bytea) e some após 7 dias.
 */

/** Janela de retenção (dias). Fotos mais antigas são expurgadas. */
export const RETENTION_DAYS = 7;

/** Tamanho máximo aceito para a imagem já decodificada (defesa; o cliente comprime). */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const MAX_DESC = 500;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class ValidationError extends Error {}

export interface NonconformityInput {
  baseCode: string;
  doctorName?: string | null;
  description: string;
  /** Data URL (data:image/jpeg;base64,...) vinda do cliente. */
  photoDataUrl: string;
  ipHash?: string;
}

export interface NonconformityRecord {
  id: string;
  day: string;
  baseCode: string;
  doctorName: string | null;
  description: string;
  contentType: string;
  createdAt: string;
}

export interface StoredNonconformity extends NonconformityRecord {
  photo: Buffer;
}

function cleanText(s: unknown, max: number): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Decodifica um data URL de imagem em {buffer, contentType}, validando tipo/tamanho. */
function decodePhoto(dataUrl: string): { buffer: Buffer; contentType: string } {
  const m = /^data:([a-z0-9/+.-]+);base64,(.+)$/i.exec(String(dataUrl ?? "").trim());
  if (!m || !m[1] || !m[2]) throw new ValidationError("Foto inválida — reenvie a imagem.");
  const contentType = m[1].toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) throw new ValidationError("Formato de imagem não suportado (use JPEG/PNG).");
  let buffer: Buffer;
  try {
    buffer = Buffer.from(m[2], "base64");
  } catch {
    throw new ValidationError("Foto inválida — reenvie a imagem.");
  }
  if (buffer.length === 0) throw new ValidationError("Foto vazia — reenvie a imagem.");
  if (buffer.length > MAX_PHOTO_BYTES) throw new ValidationError("Foto muito grande — tente novamente.");
  return { buffer, contentType };
}

export async function createNonconformity(input: NonconformityInput): Promise<StoredNonconformity> {
  const baseCode = cleanText(input.baseCode, 16).toUpperCase();
  if (!baseCode) throw new ValidationError("Informe a unidade (base).");
  const description = cleanText(input.description, MAX_DESC);
  if (description.length < 3) throw new ValidationError("Descreva o que a foto mostra.");
  const doctorName = cleanText(input.doctorName, 120) || null;
  const { buffer, contentType } = decodePhoto(input.photoDataUrl);

  const id = randomUUID();
  const day = bahiaDay();
  await db.query(
    `INSERT INTO nonconformities
       (id, day, base_code, doctor_name, description, photo, content_type, byte_size, ip_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, day, baseCode, doctorName, description, buffer, contentType, buffer.length, input.ipHash ?? null],
  );

  return {
    id,
    day,
    baseCode,
    doctorName,
    description,
    contentType,
    createdAt: new Date().toISOString(),
    photo: buffer,
  };
}

/** Metadados das inconformidades de uma base dentro da janela de retenção (recente primeiro). */
export async function listNonconformities(baseCode: string): Promise<NonconformityRecord[]> {
  const { rows } = await db.query(
    `SELECT id, day::text AS day, base_code, doctor_name, description, content_type, created_at
     FROM nonconformities
     WHERE base_code = $1 AND created_at > now() - ($2 || ' days')::interval
     ORDER BY created_at DESC`,
    [baseCode.toUpperCase(), String(RETENTION_DAYS)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    day: String(r.day),
    baseCode: String(r.base_code),
    doctorName: r.doctor_name ? String(r.doctor_name) : null,
    description: String(r.description),
    contentType: String(r.content_type),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** Bytes da foto por id (para servir a imagem). Nulo se não existir ou já expurgada. */
export async function getNonconformityPhoto(id: string): Promise<{ photo: Buffer; contentType: string } | null> {
  const { rows } = await db.query(
    `SELECT photo, content_type FROM nonconformities WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  return { photo: rows[0].photo as Buffer, contentType: String(rows[0].content_type) };
}

/** Expurga fotos além da janela de retenção. Retorna quantas linhas removeu. */
export async function purgeOldNonconformities(): Promise<number> {
  const { rowCount } = await db.query(
    `DELETE FROM nonconformities WHERE created_at <= now() - ($1 || ' days')::interval`,
    [String(RETENTION_DAYS)],
  );
  return rowCount ?? 0;
}
