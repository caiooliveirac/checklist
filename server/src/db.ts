import pg from "pg";
import { config } from "./config.js";

/** Banco próprio do checklist (leitura/escrita). */
export const db = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

/**
 * Banco do plantoes (somente leitura — o usuário Postgres só tem GRANT SELECT).
 * Pode ser nulo em dev sem o banco disponível; quem consome trata a ausência.
 */
export const plantoesDb = config.plantoesDatabaseUrl
  ? new pg.Pool({
      connectionString: config.plantoesDatabaseUrl,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      options: "-c default_transaction_read_only=on",
    })
  : null;

export async function closeDb(): Promise<void> {
  await Promise.allSettled([db.end(), plantoesDb?.end()]);
}
