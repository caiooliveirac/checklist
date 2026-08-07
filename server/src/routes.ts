import type { FastifyInstance } from "fastify";
import { db } from "./db.js";
import { getChecklistDef } from "./checklist-def.js";
import { getBoard, plantoesHealthy } from "./plantoes.js";
import { bahiaDay, bahiaDayLabel } from "./day.js";
import { createSubmission, latestByBase, lastFieldValues, ValidationError, type AnsweredItem } from "./submissions.js";
import { recentHistory, HISTORY_DAYS } from "./history.js";
import { verifyKey, getOrCreateKey } from "./keys.js";
import { itemByKey } from "./checklist-def.js";
import { notifySubmission, notifyNonconformity } from "./bot.js";
import { collectDigestData } from "./digest.js";
import { hashIp } from "./text.js";
import { config } from "./config.js";
import {
  createNonconformity,
  listNonconformities,
  getNonconformityPhoto,
  ValidationError as NcValidationError,
} from "./nonconformities.js";

interface SubmitBody {
  baseCode?: string;
  accessKey?: string;
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
      keyRequired: config.keyRequired,
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
    const alerts: { key: string; label: string; sinceDay: string; obs: string | null; reportedBy: string }[] = [];
    if (latest) {
      for (const item of latest.items.filter((i) => i.state === "missing")) {
        let sinceDay = latest.day;
        let reportedBy = latest.doctorName;
        let obs: string | null = item.obs ?? null;
        for (const h of history.slice(1)) {
          const past = h.items.find((i) => i.key === item.key);
          if (past?.state !== "missing") break;
          sinceDay = h.day;
          reportedBy = h.doctorName;
          if (!obs && past.obs) obs = past.obs;
        }
        alerts.push({
          key: item.key,
          label: itemByKey(def, item.key)?.shortLabel ?? item.key,
          sinceDay,
          obs,
          reportedBy,
        });
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

  // Integração interna (bot do plantões): chave do dia de uma base válida.
  // Protegido por token compartilhado; só responde para bases do quadro.
  app.get("/api/internal/keys/:code", async (req, reply) => {
    if (!config.internalToken || req.headers["x-internal-token"] !== config.internalToken) {
      reply.code(401);
      return { ok: false, error: "não autorizado" };
    }
    const { code } = req.params as { code: string };
    const { board } = await getBoard();
    const base = board.find((b) => b.baseCode === code.toUpperCase());
    if (!base) {
      reply.code(404);
      return { ok: false, error: "base desconhecida" };
    }
    return { ok: true, baseCode: base.baseCode, day: bahiaDay(), key: await getOrCreateKey(base.baseCode) };
  });

  // Integração interna (secretário `tom`, que entrega no WhatsApp): quem ainda
  // não fez o checklist agora. Mesmo dado do digest do Telegram — o texto é
  // problema de quem entrega, aqui sai só a lista.
  app.get("/api/internal/briefing", async (req, reply) => {
    if (!config.internalToken || req.headers["x-internal-token"] !== config.internalToken) {
      reply.code(401);
      return { ok: false, error: "não autorizado" };
    }
    const data = await collectDigestData();
    return {
      ok: true,
      day: data.day,
      dayLabel: data.dayLabel,
      // `degraded` = o board veio da lista fixa de bases (plantões fora do ar):
      // a pendência não é confiável e quem entrega avisa em vez de cobrar.
      degraded: data.degraded,
      feitos: data.done.length,
      pendentes: data.pending.map((base) => ({
        baseCode: base.baseCode,
        doctorName: base.displayName ?? base.doctorName,
        shiftLabel: base.shiftLabel,
      })),
    };
  });

  // Verificação antecipada da chave do dia (para a UI validar antes de começar).
  app.post("/api/keys/verify", async (req) => {
    const { baseCode, key } = (req.body ?? {}) as { baseCode?: string; key?: string };
    if (!config.keyRequired) return { ok: true, required: false };
    const ok = await verifyKey(baseCode ?? "", key ?? "");
    return { ok, required: true };
  });

  app.post("/api/submissions", async (req, reply) => {
    const body = (req.body ?? {}) as SubmitBody;
    try {
      if (config.keyRequired) {
        const keyOk = await verifyKey(body.baseCode ?? "", body.accessKey ?? "");
        if (!keyOk) {
          reply.code(403);
          return {
            ok: false,
            error:
              "Chave do dia inválida. Peça ao bot @samu_checklists_bot no privado (ou /chave no grupo do plantões).",
          };
        }
      }
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

  // Inconformidades (fotos): lista os metadados da unidade dentro da janela de
  // retenção. Público por código — quem abre a unidade vê o que foi reportado.
  app.get("/api/nonconformities/:code", async (req) => {
    const { code } = req.params as { code: string };
    const items = await listNonconformities(code);
    return {
      code: code.toUpperCase(),
      items: items.map((n) => ({
        id: n.id,
        day: n.day,
        doctorName: n.doctorName,
        description: n.description,
        createdAt: n.createdAt,
        photoUrl: `/api/nonconformities/photo/${n.id}`,
      })),
    };
  });

  // Bytes da foto por id (opaco). Público, como o restante da unidade.
  app.get("/api/nonconformities/photo/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      reply.code(404);
      return { ok: false, error: "not found" };
    }
    const found = await getNonconformityPhoto(id);
    if (!found) {
      reply.code(404);
      return { ok: false, error: "not found" };
    }
    reply.header("Content-Type", found.contentType);
    reply.header("Cache-Control", "private, max-age=86400");
    return reply.send(found.photo);
  });

  // Lançamento de uma inconformidade com foto (JSON com a imagem em base64).
  // bodyLimit ampliado para acomodar a foto já comprimida no cliente.
  app.post(
    "/api/nonconformities",
    { bodyLimit: 12 * 1024 * 1024 },
    async (req, reply) => {
      const body = (req.body ?? {}) as {
        baseCode?: string;
        accessKey?: string;
        doctorName?: string | null;
        description?: string;
        photo?: string;
      };
      try {
        if (config.keyRequired) {
          const keyOk = await verifyKey(body.baseCode ?? "", body.accessKey ?? "");
          if (!keyOk) {
            reply.code(403);
            return {
              ok: false,
              error:
                "Chave do dia inválida. Peça ao bot @samu_checklists_bot no privado (ou /chave no grupo do plantões).",
            };
          }
        }
        const stored = await createNonconformity({
          baseCode: body.baseCode ?? "",
          doctorName: body.doctorName ?? null,
          description: body.description ?? "",
          photoDataUrl: body.photo ?? "",
          ipHash: hashIp(req.ip ?? ""),
        });
        // Avisa os admins com a foto em segundo plano — não atrasa a resposta.
        notifyNonconformity(stored).catch((err) => app.log.error({ err }, "notifyNonconformity falhou"));
        return {
          ok: true,
          id: stored.id,
          createdAt: stored.createdAt,
          photoUrl: `/api/nonconformities/photo/${stored.id}`,
        };
      } catch (err) {
        if (err instanceof NcValidationError) {
          reply.code(400);
          return { ok: false, error: err.message };
        }
        throw err;
      }
    },
  );
}
