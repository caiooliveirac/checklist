import type { FastifyInstance } from "fastify";
import { db } from "./db.js";
import { getChecklistDef } from "./checklist-def.js";
import { getBoard, plantoesHealthy } from "./plantoes.js";
import { bahiaDay, bahiaDayLabel } from "./day.js";
import { createSubmission, latestByBase, ValidationError, type AnsweredItem } from "./submissions.js";
import { notifySubmission } from "./bot.js";
import { hashIp } from "./text.js";
import { config } from "./config.js";

interface SubmitBody {
  baseCode?: string;
  doctorName?: string;
  doctorId?: string | null;
  occupancyId?: string | null;
  shiftLabel?: string | null;
  items?: AnsweredItem[];
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => {
    let dbOk = false;
    try {
      await db.query("SELECT 1");
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const plantoesOk = await plantoesHealthy();
    return {
      ok: dbOk,
      db: dbOk,
      plantoes: plantoesOk,
      bot: config.telegram.mode !== "disabled" && Boolean(config.telegram.token),
      day: bahiaDay(),
      env: config.env,
    };
  });

  app.get("/api/checklist", async () => getChecklistDef());

  app.get("/api/board", async () => {
    const day = bahiaDay();
    const [{ board, degraded }, subs] = await Promise.all([getBoard(), latestByBase(day)]);
    return {
      day,
      dayLabel: bahiaDayLabel(),
      degraded,
      bases: board.map((b) => {
        const sub = subs.get(b.baseCode) ?? null;
        return {
          code: b.baseCode,
          doctorId: b.doctorId,
          doctorName: b.displayName ?? b.doctorName,
          fullName: b.doctorName,
          shiftLabel: b.shiftLabel,
          startedAt: b.startedAt,
          scheduledEndAt: b.scheduledEndAt,
          occupancyId: b.occupancyId,
          submission: sub
            ? {
                id: sub.id,
                doctorName: sub.doctorName,
                okCount: sub.okCount,
                missingCount: sub.missingCount,
                totalItems: sub.totalItems,
                createdAt: sub.createdAt,
              }
            : null,
        };
      }),
    };
  });

  app.post("/api/submissions", async (req, reply) => {
    const body = (req.body ?? {}) as SubmitBody;
    try {
      const stored = await createSubmission({
        baseCode: body.baseCode ?? "",
        doctorName: body.doctorName ?? "",
        doctorId: body.doctorId ?? null,
        occupancyId: body.occupancyId ?? null,
        shiftLabel: body.shiftLabel ?? null,
        items: Array.isArray(body.items) ? body.items : [],
        ipHash: hashIp(req.ip ?? ""),
        userAgent: req.headers["user-agent"] ?? "",
      });
      // Aviso ao admin em segundo plano — não atrasa a resposta ao médico.
      notifySubmission(stored).catch((err) => app.log.error({ err }, "notifySubmission falhou"));
      return {
        ok: true,
        id: stored.id,
        createdAt: stored.createdAt,
        okCount: stored.okCount,
        missingCount: stored.missingCount,
        totalItems: stored.totalItems,
      };
    } catch (err) {
      if (err instanceof ValidationError) {
        reply.code(400);
        return { ok: false, error: err.message };
      }
      throw err;
    }
  });
}
