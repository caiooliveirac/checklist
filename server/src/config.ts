/** Configuração via variáveis de ambiente (com defaults de desenvolvimento). */

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}

function parseIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Slots de digest no formato "HH:MM,HH:MM" (horário local America/Bahia). */
function parseSlots(raw: string | undefined): { hour: number; minute: number; slot: string }[] {
  const out: { hour: number; minute: number; slot: string }[] = [];
  for (const part of (raw ?? "11:00,13:00").split(",")) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) continue;
    out.push({ hour, minute, slot: `${String(hour).padStart(2, "0")}:${m[2]}` });
  }
  return out;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3030),
  host: process.env.HOST ?? (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0"),
  timezone: process.env.APP_TZ ?? "America/Bahia",

  databaseUrl: req("DATABASE_URL", "postgres://checklist:checklist@127.0.0.1:5432/checklist"),
  /** Conexão read-only ao banco do plantoes (mesma instância Postgres). */
  plantoesDatabaseUrl: process.env.PLANTOES_DATABASE_URL ?? "",

  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN ?? "",
    /** "polling" em produção; "disabled" para canary/testes (evita conflito de getUpdates). */
    mode: process.env.BOT_MODE ?? "polling",
    adminIds: parseIds(process.env.TELEGRAM_ADMIN_IDS),
    adminSetupCode: process.env.ADMIN_SETUP_CODE ?? "",
  },

  digestSlots: parseSlots(process.env.DIGEST_SLOTS),

  /** Exige a chave do dia (entregue pelo bot) para registrar checklist. */
  keyRequired: (process.env.CHECKLIST_KEY_REQUIRED ?? "true") !== "false",

  publicUrl: process.env.PUBLIC_URL ?? "https://checklist.mnrs.com.br",
};

export type Config = typeof config;
