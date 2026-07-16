import { Bot, InlineKeyboard, Keyboard, type Context } from "grammy";
import { config } from "./config.js";
import { db } from "./db.js";
import { bahiaDay, bahiaDayLabel, bahiaTime } from "./day.js";
import { collectDigestData, renderDigestMessage, alreadySent, logDigest } from "./digest.js";
import { getChecklistDef, itemByKey } from "./checklist-def.js";
import { getBoard, type OnDuty } from "./plantoes.js";
import { latestByBase, type DaySubmission } from "./submissions.js";
import type { StoredSubmission } from "./submissions.js";

/**
 * Bot @samu_checklists_bot — canal do coordenador:
 *  - aviso imediato quando uma USA conclui o checklist;
 *  - digest agendado (11h/13h) com quem fez / não fez + contato do plantonista;
 *  - comandos guiados: status geral, pendentes, inconformidades, observações
 *    e compilação por unidade. Qualquer mensagem de um admin recebe o guia.
 */

const BTN_STATUS = "📋 Status de hoje";
const BTN_PENDING = "⚠️ Pendentes";
const BTN_MISSING = "🚫 Faltas";
const BTN_OBS = "📝 Observações";
const BTN_UNITS = "🚑 Por unidade";

const keyboard = new Keyboard()
  .text(BTN_STATUS)
  .row()
  .text(BTN_PENDING)
  .text(BTN_MISSING)
  .row()
  .text(BTN_OBS)
  .text(BTN_UNITS)
  .resized()
  .persistent();

const HELP_TEXT = [
  "🤖 <b>Bot do Checklist USA</b> — comandos:",
  "",
  "• /status — situação completa de hoje (quem fez / não fez)",
  "• /pendentes — só quem ainda não fez, com o plantonista para cobrar",
  "• /faltas — inconformidades (itens faltando) compiladas por unidade",
  "• /obs — todas as observações registradas hoje, por unidade",
  "• /unidades — detalhe de uma USA específica (botões)",
  "• /usa SM01 — detalhe direto de uma unidade",
  "",
  "Os resumos automáticos chegam às <b>11h</b> e <b>13h</b>, e cada checklist concluído gera aviso na hora.",
].join("\n");

let bot: Bot | null = null;

async function dbAdminIds(): Promise<string[]> {
  try {
    const { rows } = await db.query(`SELECT chat_id FROM bot_chats WHERE role = 'admin'`);
    return rows.map((r) => String(r.chat_id));
  } catch {
    return [];
  }
}

export async function adminChatIds(): Promise<string[]> {
  const ids = new Set<string>([...config.telegram.adminIds, ...(await dbAdminIds())]);
  return [...ids];
}

async function isAdmin(chatId: string | number): Promise<boolean> {
  return (await adminChatIds()).includes(String(chatId));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const REPLY_OPTS = {
  parse_mode: "HTML" as const,
  link_preview_options: { is_disabled: true },
  reply_markup: keyboard,
};

async function sendToAdmins(text: string): Promise<string[]> {
  if (!bot) return [];
  const delivered: string[] = [];
  for (const chatId of await adminChatIds()) {
    try {
      await bot.api.sendMessage(chatId, text, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
      delivered.push(chatId);
    } catch (err) {
      console.error(`[bot] falha ao enviar para ${chatId}:`, err);
    }
  }
  return delivered;
}

/** Aviso imediato de conclusão de checklist. */
export async function notifySubmission(sub: StoredSubmission): Promise<void> {
  const time = bahiaTime(new Date(sub.createdAt));
  const lines: string[] = [];
  lines.push(`✅ <b>${esc(sub.baseCode)}</b> — checklist concluído às <b>${time}</b>`);
  const shift = sub.shiftLabel ? ` · plantão ${esc(sub.shiftLabel)}` : "";
  lines.push(`👨‍⚕️ ${esc(sub.doctorName)}${shift}`);
  if (sub.missingCount === 0) {
    lines.push(`Todos os ${sub.totalItems} itens conformes ✨`);
  } else {
    lines.push(`🚫 <b>${sub.missingCount} ${sub.missingCount === 1 ? "item faltando" : "itens faltando"}:</b>`);
    for (const m of sub.missingItems.slice(0, 12)) {
      lines.push(`• ${esc(m.label)}${m.obs ? ` — <i>${esc(m.obs)}</i>` : ""}`);
    }
    if (sub.missingItems.length > 12) lines.push(`• … e mais ${sub.missingItems.length - 12}`);
  }
  await sendToAdmins(lines.join("\n"));
}

/** Envia o digest de um slot; com dedupe por dia+slot (a menos que force=true). */
export async function sendDigest(slot: string, opts: { force?: boolean } = {}): Promise<"sent" | "skipped" | "error"> {
  const day = bahiaDay();
  try {
    if (!opts.force && (await alreadySent(day, slot))) {
      await logDigest({ day, slot, status: "skipped" });
      return "skipped";
    }
    const data = await collectDigestData();
    const message = renderDigestMessage(data, slot);
    const recipients = await sendToAdmins(message);
    if (recipients.length === 0) throw new Error("nenhum admin recebeu (sem chats registrados?)");
    await logDigest({ day, slot, status: "success", recipients: recipients.join(","), message });
    return "sent";
  } catch (err) {
    console.error(`[digest] erro no slot ${slot}:`, err);
    await logDigest({ day, slot, status: "error", error: String(err) }).catch(() => {});
    return "error";
  }
}

function doctorRef(base: OnDuty): string {
  const name = base.displayName ?? base.doctorName;
  if (!name) return "<i>sem médico registrado</i>";
  const label = base.telegramUserId
    ? `<a href="tg://user?id=${base.telegramUserId}">${esc(name)}</a>`
    : `<b>${esc(name)}</b>`;
  return base.shiftLabel ? `${label} (${esc(base.shiftLabel)})` : label;
}

/* ------------------------------------------------------------------ */
/* Compilações                                                         */
/* ------------------------------------------------------------------ */

interface DayData {
  board: OnDuty[];
  subs: Map<string, DaySubmission>;
}

async function dayData(): Promise<DayData> {
  const [{ board }, subs] = await Promise.all([getBoard(), latestByBase(bahiaDay())]);
  return { board, subs };
}

async function textPendentes(): Promise<string> {
  const data = await collectDigestData();
  const total = data.done.length + data.pending.length;
  if (data.pending.length === 0) {
    return `🎉 Todas as ${total} USAs enviaram o checklist hoje (${esc(data.dayLabel)}).`;
  }
  const lines = [`⚠️ <b>Pendentes (${data.pending.length}/${total})</b> — ${esc(data.dayLabel)}:`];
  for (const base of data.pending) {
    lines.push(`• <b>${esc(base.baseCode)}</b> — ${doctorRef(base)}`);
  }
  lines.push("", "Toque no nome para abrir o contato e cobrar. 😉");
  return lines.join("\n");
}

/** Inconformidades (itens faltando) compiladas por unidade. */
async function textFaltas(): Promise<string> {
  const { subs } = await dayData();
  const def = getChecklistDef();
  const withMissing = [...subs.values()].filter((s) => s.missingCount > 0);
  if (withMissing.length === 0) {
    return `✨ Nenhuma inconformidade reportada hoje (${bahiaDayLabel()}).`;
  }
  const lines = [`🚫 <b>Inconformidades de hoje</b> — ${esc(bahiaDayLabel())}:`];
  for (const sub of withMissing) {
    lines.push(`\n<b>${esc(sub.baseCode)}</b> — ${esc(sub.doctorName)} (${bahiaTime(new Date(sub.createdAt))}):`);
    for (const item of sub.items.filter((i) => i.state === "missing")) {
      const label = itemByKey(def, item.key)?.shortLabel ?? item.key;
      lines.push(`• ${esc(label)}${item.obs ? ` — <i>${esc(item.obs)}</i>` : ""}`);
    }
  }
  return lines.join("\n");
}

/** Todas as observações do dia (inclusive de itens conformes), por unidade. */
async function textObservacoes(): Promise<string> {
  const { subs } = await dayData();
  const def = getChecklistDef();
  const withObs = [...subs.values()]
    .map((sub) => ({ sub, obsItems: sub.items.filter((i) => i.obs) }))
    .filter((x) => x.obsItems.length > 0);
  if (withObs.length === 0) {
    return `📝 Nenhuma observação registrada hoje (${bahiaDayLabel()}).`;
  }
  const lines = [`📝 <b>Observações de hoje</b> — ${esc(bahiaDayLabel())}:`];
  for (const { sub, obsItems } of withObs) {
    lines.push(`\n<b>${esc(sub.baseCode)}</b> — ${esc(sub.doctorName)}:`);
    for (const item of obsItems) {
      const label = itemByKey(def, item.key)?.shortLabel ?? item.key;
      const mark = item.state === "missing" ? "🚫" : "✅";
      lines.push(`${mark} ${esc(label)} — <i>${esc(item.obs ?? "")}</i>`);
    }
  }
  return lines.join("\n");
}

/** Compilação completa de uma unidade. */
async function textUnidade(code: string): Promise<string> {
  const { board, subs } = await dayData();
  const def = getChecklistDef();
  const base = board.find((b) => b.baseCode === code.toUpperCase());
  if (!base) {
    const valid = board.map((b) => b.baseCode).join(", ");
    return `Unidade "${esc(code)}" não encontrada. Válidas: ${valid}`;
  }
  const sub = subs.get(base.baseCode);
  const lines = [`🚑 <b>${esc(base.baseCode)}</b> — ${esc(bahiaDayLabel())}`];
  lines.push(`👨‍⚕️ Plantão: ${doctorRef(base)}${base.startedAt ? ` · desde ${bahiaTime(new Date(base.startedAt))}` : ""}`);
  lines.push("");
  if (!sub) {
    lines.push("⚠️ <b>Checklist de hoje ainda não enviado.</b>");
    lines.push("Toque no nome acima para abrir o contato e cobrar.");
    return lines.join("\n");
  }
  lines.push(`✅ Checklist enviado às <b>${bahiaTime(new Date(sub.createdAt))}</b> por ${esc(sub.doctorName)}`);
  lines.push(`Conformes: ${sub.okCount}/${sub.totalItems}`);
  const missing = sub.items.filter((i) => i.state === "missing");
  if (missing.length > 0) {
    lines.push(`\n🚫 <b>Faltando (${missing.length}):</b>`);
    for (const item of missing) {
      const label = itemByKey(def, item.key)?.shortLabel ?? item.key;
      lines.push(`• ${esc(label)}${item.obs ? ` — <i>${esc(item.obs)}</i>` : ""}`);
    }
  } else {
    lines.push("\nTudo conforme ✨");
  }
  const okObs = sub.items.filter((i) => i.state === "ok" && i.obs);
  if (okObs.length > 0) {
    lines.push(`\n📝 <b>Observações:</b>`);
    for (const item of okObs) {
      const label = itemByKey(def, item.key)?.shortLabel ?? item.key;
      lines.push(`• ${esc(label)} — <i>${esc(item.obs ?? "")}</i>`);
    }
  }
  return lines.join("\n");
}

async function unidadesKeyboard(): Promise<InlineKeyboard> {
  const { board, subs } = await dayData();
  const kb = new InlineKeyboard();
  board.forEach((b, i) => {
    const done = subs.has(b.baseCode);
    kb.text(`${done ? "✅" : "⚠️"} ${b.baseCode}`, `base:${b.baseCode}`);
    if (i % 3 === 2) kb.row();
  });
  return kb;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

export function createBot(): Bot | null {
  if (!config.telegram.token || config.telegram.mode === "disabled") {
    console.log("[bot] desativado (sem token ou BOT_MODE=disabled)");
    return null;
  }

  bot = new Bot(config.telegram.token);

  const guard = async (ctx: Context): Promise<boolean> => {
    if (ctx.chat && (await isAdmin(ctx.chat.id))) return true;
    await ctx.reply(
      "Este é o bot administrativo do Checklist USA (checklist.mnrs.com.br).\nSe você é da coordenação, use /admin <código> para se registrar.",
    );
    return false;
  };

  bot.command("start", async (ctx) => {
    if (await isAdmin(ctx.chat.id)) {
      await ctx.reply(`👋 Bem-vindo!\n\n${HELP_TEXT}`, REPLY_OPTS);
    } else {
      await ctx.reply(
        [
          "👋 Este é o bot administrativo do <b>Checklist USA</b> (checklist.mnrs.com.br).",
          "O checklist é feito pela plataforma web; avisos chegam para a coordenação.",
          "Se você é da coordenação, use /admin &lt;código&gt; para se registrar.",
        ].join("\n"),
        { parse_mode: "HTML" },
      );
    }
  });

  bot.command("admin", async (ctx) => {
    const code = (ctx.match ?? "").trim();
    if (!config.telegram.adminSetupCode || code !== config.telegram.adminSetupCode) {
      await ctx.reply("Código inválido.");
      return;
    }
    const label = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ");
    await db.query(
      `INSERT INTO bot_chats (chat_id, role, label) VALUES ($1, 'admin', $2)
       ON CONFLICT (chat_id) DO UPDATE SET role = 'admin', label = EXCLUDED.label`,
      [String(ctx.chat.id), label],
    );
    await ctx.reply(`✅ Registrado! Você passa a receber os avisos e resumos.\n\n${HELP_TEXT}`, REPLY_OPTS);
  });

  const cmdStatus = async (ctx: Context): Promise<void> => {
    const data = await collectDigestData();
    await ctx.reply(renderDigestMessage(data, `consulta ${bahiaTime(new Date())}`), REPLY_OPTS);
  };
  const cmdPendentes = async (ctx: Context): Promise<void> => {
    await ctx.reply(await textPendentes(), REPLY_OPTS);
  };
  const cmdFaltas = async (ctx: Context): Promise<void> => {
    await ctx.reply(await textFaltas(), REPLY_OPTS);
  };
  const cmdObs = async (ctx: Context): Promise<void> => {
    await ctx.reply(await textObservacoes(), REPLY_OPTS);
  };
  const cmdUnidades = async (ctx: Context): Promise<void> => {
    await ctx.reply("Escolha a unidade (✅ fez · ⚠️ pendente):", { reply_markup: await unidadesKeyboard() });
  };

  const protect =
    (fn: (ctx: Context) => Promise<void>) =>
    async (ctx: Context): Promise<void> => {
      if (await guard(ctx)) await fn(ctx);
    };

  bot.command("status", protect(cmdStatus));
  bot.hears(BTN_STATUS, protect(cmdStatus));
  bot.command("pendentes", protect(cmdPendentes));
  bot.hears(BTN_PENDING, protect(cmdPendentes));
  bot.command("faltas", protect(cmdFaltas));
  bot.hears(BTN_MISSING, protect(cmdFaltas));
  bot.command("obs", protect(cmdObs));
  bot.hears(BTN_OBS, protect(cmdObs));
  bot.command("unidades", protect(cmdUnidades));
  bot.hears(BTN_UNITS, protect(cmdUnidades));

  bot.command("usa", protect(async (ctx) => {
    const code = (typeof ctx.match === "string" ? ctx.match : "").trim();
    if (!code) {
      await cmdUnidades(ctx);
      return;
    }
    await ctx.reply(await textUnidade(code), REPLY_OPTS);
  }));

  bot.callbackQuery(/^base:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.chat || !(await isAdmin(ctx.chat.id))) return;
    const code = ctx.match?.[1] ?? "";
    await ctx.reply(await textUnidade(code), REPLY_OPTS);
  });

  bot.command("ajuda", protect(async (ctx) => {
    await ctx.reply(HELP_TEXT, REPLY_OPTS);
  }));

  // Fallback: QUALQUER outra mensagem de um admin recebe o guia de comandos.
  bot.on("message:text", async (ctx) => {
    if (await isAdmin(ctx.chat.id)) {
      await ctx.reply(`Não entendi. 🙂\n\n${HELP_TEXT}`, REPLY_OPTS);
    } else {
      await ctx.reply(
        "Este é o bot administrativo do Checklist USA (checklist.mnrs.com.br).\nSe você é da coordenação, use /admin <código> para se registrar.",
      );
    }
  });

  bot.catch((err) => {
    console.error("[bot] erro não tratado:", err);
  });

  bot.start({
    drop_pending_updates: true,
    onStart: (me) => console.log(`[bot] @${me.username} em long polling`),
  });

  // Menu de comandos no cliente do Telegram (aparece ao digitar "/").
  void bot.api
    .setMyCommands([
      { command: "status", description: "Situação completa de hoje" },
      { command: "pendentes", description: "Quem ainda não fez (com contato)" },
      { command: "faltas", description: "Inconformidades por unidade" },
      { command: "obs", description: "Observações do dia por unidade" },
      { command: "unidades", description: "Detalhe de uma USA específica" },
      { command: "ajuda", description: "Guia de comandos" },
    ])
    .catch((err) => console.error("[bot] setMyCommands falhou:", err));

  return bot;
}

export async function stopBot(): Promise<void> {
  await bot?.stop().catch(() => {});
}
