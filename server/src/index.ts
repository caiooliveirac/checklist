import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { Cron } from "croner";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { db, closeDb } from "./db.js";
import { migrate } from "./migrate.js";
import { registerRoutes } from "./routes.js";
import { createBot, stopBot, sendDigest } from "./bot.js";
import { purgeOldNonconformities, RETENTION_DAYS } from "./nonconformities.js";

const WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

async function main(): Promise<void> {
  await migrate(db);

  const app = Fastify({ logger: true, trustProxy: true });

  await registerRoutes(app);

  // Frontend buildado (SPA) — em dev o Vite roda separado com proxy.
  if (existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST, index: ["index.html"] });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api/")) {
        reply.code(404).send({ ok: false, error: "not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  createBot();

  const jobs = config.digestSlots.map(
    ({ hour, minute, slot }) =>
      new Cron(`${minute} ${hour} * * *`, { timezone: config.timezone }, () => {
        void sendDigest(slot);
      }),
  );
  console.log(
    `[digest] slots agendados (${config.timezone}): ${config.digestSlots.map((s) => s.slot).join(", ") || "nenhum"}`,
  );

  // Expurgo diário das fotos de inconformidade além da janela de retenção.
  const purgeJob = new Cron("30 3 * * *", { timezone: config.timezone }, () => {
    purgeOldNonconformities()
      .then((n) => n > 0 && console.log(`[inconformidades] ${n} foto(s) expurgada(s) (>${RETENTION_DAYS}d)`))
      .catch((err) => console.error("[inconformidades] falha no expurgo:", err));
  });
  jobs.push(purgeJob);
  // Uma varredura no arranque cobre janelas em que o servidor ficou parado às 3h30.
  void purgeOldNonconformities().catch(() => {});

  await app.listen({ port: config.port, host: config.host });

  const shutdown = async (): Promise<void> => {
    console.log("encerrando…");
    for (const j of jobs) j.stop();
    await stopBot();
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("falha fatal na inicialização:", err);
  process.exit(1);
});
