import type { FastifyInstance } from "fastify";
import { db } from "./db.js";
import { getChecklistDef } from "./checklist-def.js";
import { getBoard, plantoesHealthy } from "./plantoes.js";
import { bahiaDay, bahiaDayLabel } from "./day.js";
import { createSubmission, latestByBase, lastFieldValues, ValidationError, type AnsweredItem } from "./submissions.js";
import { recentHistory, HISTORY_DAYS } from "./history.js";
import { itemByKey } from "./checklist-def.js";
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
    const [{ board, degraded }, subs, fields] = await Promise.all([getBoard(), latestByBase(day), lastFieldValues()]);
    return {
      day,
      dayLabel: bahiaDayLabel(),
      degraded,
      bases: board.map((b) => {
        const sub = subs.get(b.baseCode) ?? null;
        return {
          lastFields: fields.get(b.baseCode) ?? {},
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

  // Histórico da unidade para a UI: checklists recentes + alertas do plantão
  // anterior (o que está faltando e desde quando, e observações registradas).
  app.get("/api/history/:code", async (req) => {
    const { code } = req.params as { code: string };
    const def = getChecklistDef();
    const history = await recentHistory(code);

    const days = history.map((h) => {
      const missing = h.items
        .filter((i) => i.state === "missing")
        .map((i) => ({ key: i.key, label: itemByKey(def, i.key)?.shortLabel ?? i.key, obs: i.obs ?? null }));
      const obs = h.items
        .filter((i) => i.state === "ok" && i.obs)
        .map((i) => ({ key: i.key, label: itemByKey(def, i.key)?.shortLabel ?? i.key, obs: i.obs ?? null }));
      const values = h.items
        .filter((i) => i.value)
        .map((i) => ({ key: i.key, label: itemByKey(def, i.key)?.shortLabel ?? i.key, value: i.value ?? "" }));
      return {
        day: h.day,
        doctorName: h.doctorName,
        createdAt: h.createdAt.toISOString(),
        okCount: h.items.filter((i) => i.state === "ok").length,
        missingCount: missing.length,
        missing,
        obs,
        values,
      };
    });

    // Alertas: itens faltando no checklist MAIS RECENTE, com "desde quando"
    // (dia mais antigo da sequência de faltas dentro da janela).
    const latest = history[0];
    const alerts: { key: string; label: string; sinceDay: string; obs: string | null }[] = [];
    if (latest) {
      for (const item of latest.items.filter((i) => i.state === "missing")) {
        let sinceDay = latest.day;
        let obs: string | null = item.obs ?? null;
        for (const h of history.slice(1)) {
          const past = h.items.find((i) => i.key === item.key);
          if (past?.state !== "missing") break;
          sinceDay = h.day;
          if (!obs && past.obs) obs = past.obs;
        }
        alerts.push({ key: item.key, label: itemByKey(def, item.key)?.shortLabel ?? item.key, sinceDay, obs });
      }
    }

    return {
      code: code.toUpperCase(),
      windowDays: HISTORY_DAYS,
      days,
      alerts,
      latestObs: latest
        ? latest.items
            .filter((i) => i.obs && i.state === "ok")
            .map((i) => ({ label: itemByKey(def, i.key)?.shortLabel ?? i.key, obs: i.obs ?? "" }))
        : [],
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
