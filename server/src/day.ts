/** Utilidades de data no fuso America/Bahia (UTC-3, sem horário de verão). */

const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;

/** Data-calendário (YYYY-MM-DD) de um instante, no fuso da Bahia. */
export function bahiaDay(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + TZ_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

/** "HH:MM" locais da Bahia para um instante. */
export function bahiaTime(at: Date): string {
  const shifted = new Date(at.getTime() + TZ_OFFSET_MS);
  return shifted.toISOString().slice(11, 16);
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Rótulo humano: "quarta, 16 de julho". */
export function bahiaDayLabel(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() + TZ_OFFSET_MS);
  const wd = WEEKDAYS[shifted.getUTCDay()] ?? "";
  const month = MONTHS[shifted.getUTCMonth()] ?? "";
  return `${wd}, ${shifted.getUTCDate()} de ${month}`;
}

/** "16/07 08:12" para carimbos curtos. */
export function bahiaShort(at: Date): string {
  const shifted = new Date(at.getTime() + TZ_OFFSET_MS);
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm} ${bahiaTime(at)}`;
}
