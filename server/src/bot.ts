import { Bot, Keyboard, type Context } from "grammy";
import { config } from "./config.js";
import { db } from "./db.js";
import { bahiaDay, bahiaTime } from "./day.js";
import { collectDigestData, renderDigestMessage, alreadySent, logDigest } from "./digest.js";
import { getChecklistDef, itemByKey } from "./checklist-def.js";
import type { StoredSubmission } from "./submissions.js";

/**
 * Bot @samu_checklists_bot — canal do admin:
 *  - aviso imediato quando uma USA conclui o checklist;
 *  - digest agendado (11h/13h) com quem fez / não fez + contato do plantonista;
 *  - comandos guiados no chat (/status, /pendentes, /faltas) com teclado fixo.
 */

const BTN_STATUS = "📋 Status de hoje";
const BTN_PENDING = "⚠️ Pendentes";
const BTN_MISSING = "🚫 Itens faltando";

const keyboard = new Keyboard().text(BTN_STATUS).row().text(BTN_PENDING).text(BTN_MISSING).resized().persistent();

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

async function replyStatus(ctx: Context): Promise<void> {
  const data = await collectDigestData();
  await ctx.reply(renderDigestMessage(data, `consulta ${bahiaTime(new Date())}`), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
  });
}

export function createBot(): Bot | null {
  if (!config.telegram.token || config.telegram.mode === "disabled") {
    console.log("[bot] desativado (sem token ou BOT_MODE=disabled)");
    return null;
  }

  bot = new Bot(config.telegram.token);

  bot.command("start", async (ctx) => {
    const admin = await isAdmin(ctx.chat.id);
    if (admin) {
      await ctx.reply(
        [
          "👋 <b>Bot do Checklist USA</b>",
          "",
          "Você recebe aqui os avisos de checklist concluído e o resumo automático de 11h e 13h.",
          "",
          "Comandos:",
          "• /status — situação completa de hoje",
          "• /pendentes — só quem ainda não fez",
          "• /faltas — itens faltando reportados",
        ].join("\n"),
        { parse_mode: "HTML", reply_markup: keyboard },
      );
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
    await ctx.reply("✅ Registrado! Você passa a receber os avisos e resumos do checklist.", {
      reply_markup: keyboard,
    });
  });

  const guard = async (ctx: Context): Promise<boolean> => {
    if (ctx.chat && (await isAdmin(ctx.chat.id))) return true;
    await ctx.reply("Sem acesso — bot administrativo. Use /admin <código> se você é da coordenação.");
    return false;
  };

  bot.command("status", async (ctx) => {
    if (await guard(ctx)) await replyStatus(ctx);
  });
  bot.hears(BTN_STATUS, async (ctx) => {
    if (await guard(ctx)) await replyStatus(ctx);
  });

  const pendentes = async (ctx: Context): Promise<void> => {
    const data = await collectDigestData();
    const total = data.done.length + data.pending.length;
    if (data.pending.length === 0) {
      await ctx.reply(`🎉 Todas as ${total} USAs enviaram o checklist hoje.`, { reply_markup: keyboard });
      return;
    }
    const lines = [`⚠️ <b>Pendentes (${data.pending.length}/${total})</b> — ${esc(data.dayLabel)}:`];
    for (const base of data.pending) {
      const name = base.displayName ?? base.doctorName;
      const who = name
        ? base.telegramUserId
          ? `<a href="tg://user?id=${base.telegramUserId}">${esc(name)}</a>`
          : `<b>${esc(name)}</b>`
        : "<i>sem médico registrado</i>";
      const shift = base.shiftLabel ? ` (${esc(base.shiftLabel)})` : "";
      lines.push(`• <b>${esc(base.baseCode)}</b> — ${who}${shift}`);
    }
    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
  };
  bot.command("pendentes", async (ctx) => {
    if (await guard(ctx)) await pendentes(ctx);
  });
  bot.hears(BTN_PENDING, async (ctx) => {
    if (await guard(ctx)) await pendentes(ctx);
  });

  const faltas = async (ctx: Context): Promise<void> => {
    const data = await collectDigestData();
    const withMissing = data.done.filter((d) => d.sub.missingCount > 0);
    if (withMissing.length === 0) {
      await ctx.reply("✨ Nenhum item faltando reportado nos checklists de hoje.", { reply_markup: keyboard });
      return;
    }
    const def = getChecklistDef();
    const lines = ["🚫 <b>Itens faltando reportados hoje:</b>"];
    for (const { base, sub } of withMissing) {
      lines.push(`\n<b>${esc(base.baseCode)}</b> — ${esc(sub.doctorName)}:`);
      for (const item of sub.items.filter((i) => i.state === "missing")) {
        const label = itemByKey(def, item.key)?.shortLabel ?? item.key;
        lines.push(`• ${esc(label)}${item.obs ? ` — <i>${esc(item.obs)}</i>` : ""}`);
      }
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: keyboard });
  };
  bot.command("faltas", async (ctx) => {
    if (await guard(ctx)) await faltas(ctx);
  });
  bot.hears(BTN_MISSING, async (ctx) => {
    if (await guard(ctx)) await faltas(ctx);
  });

  bot.command("ajuda", async (ctx) => {
    await ctx.reply("Comandos: /status · /pendentes · /faltas — resumos automáticos às 11h e 13h.", {
      reply_markup: keyboard,
    });
  });

  bot.catch((err) => {
    console.error("[bot] erro não tratado:", err);
  });

  bot.start({
    drop_pending_updates: true,
    onStart: (me) => console.log(`[bot] @${me.username} em long polling`),
  });

  return bot;
}

export async function stopBot(): Promise<void> {
  await bot?.stop().catch(() => {});
}
