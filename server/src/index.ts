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
