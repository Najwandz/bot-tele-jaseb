import { Composer, Context, InlineKeyboard } from "grammy";
import { getAccounts } from "../../../services/gramjs";
import {
  getBroadcastStateByAccount,
  isBroadcastingByAccount,
  stopBroadcastByAccount,
} from "../../../services/broadcast";

const composer = new Composer();

// ─── Helper: bangun teks + keyboard status BC ─────────────────────────────────
async function buildBCStatus(userId: number) {
  const accounts = await getAccounts(userId);

  if (accounts.length === 0) {
    return {
      text: "📊 *Status Broadcast*\n\nBelum ada akun terhubung.\n\nGunakan menu 🎛 Control untuk menambah akun.",
      keyboard: new InlineKeyboard().text("🔄 Refresh", "bcst:refresh"),
    };
  }

  const lines: string[] = [];
  const runningAccounts: { id: number; label: string }[] = [];

  for (const acc of accounts) {
    const state = getBroadcastStateByAccount(acc.id);
    const running = isBroadcastingByAccount(acc.id);

    if (running && state) {
      const pct = state.total > 0 ? Math.round(((state.sent + state.failed) / state.total) * 100) : 0;
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      lines.push(
        `🟢 *${acc.label}*\n` +
          `   Putaran: ke-${state.round}\n` +
          `   \`${bar}\` ${pct}%\n` +
          `   ✅ Terkirim: ${state.sent} | ❌ Gagal: ${state.failed} | 📊 Total: ${state.total}`
      );
      runningAccounts.push({ id: acc.id, label: acc.label });
    } else {
      lines.push(`⚫ *${acc.label}*\n   Tidak berjalan`);
    }
  }

  const text =
    `📊 *Status Broadcast*\n\n` +
    lines.join("\n\n");

  // Bangun keyboard
  const kb = new InlineKeyboard();

  // Tombol stop per akun (hanya yang sedang running)
  for (const acc of runningAccounts) {
    kb.text(`🛑 Stop ${acc.label}`, `bcst:stop:${acc.id}`).row();
  }

  // Tombol stop semua (hanya kalau ada 2+ yang running)
  if (runningAccounts.length >= 2) {
    kb.text("🛑 Stop Semua", "bcst:stop_all").row();
  }

  kb.text("🔄 Refresh", "bcst:refresh");

  return { text, keyboard: kb };
}

// ─── Entry point: tombol "📊 Status BC" ──────────────────────────────────────
export async function handleStatusBC(ctx: Context) {
  const userId = ctx.from!.id;
  const { text, keyboard } = await buildBCStatus(userId);
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: keyboard });
}

// ─── Callback: refresh ───────────────────────────────────────────────────────
composer.callbackQuery("bcst:refresh", async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCallbackQuery("Diperbarui.");
  const { text, keyboard } = await buildBCStatus(userId);
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
});

// ─── Callback: stop 1 akun ───────────────────────────────────────────────────
composer.callbackQuery(/^bcst:stop:(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const accountId = parseInt(ctx.match![1]);

  stopBroadcastByAccount(accountId);
  await ctx.answerCallbackQuery("Broadcast dihentikan.");

  const { text, keyboard } = await buildBCStatus(userId);
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
});

// ─── Callback: stop semua ────────────────────────────────────────────────────
composer.callbackQuery("bcst:stop_all", async (ctx) => {
  const userId = ctx.from.id;
  const accounts = await getAccounts(userId);

  let stopped = 0;
  for (const acc of accounts) {
    if (isBroadcastingByAccount(acc.id)) {
      stopBroadcastByAccount(acc.id);
      stopped++;
    }
  }

  await ctx.answerCallbackQuery(`${stopped} broadcast dihentikan.`);
  const { text, keyboard } = await buildBCStatus(userId);
  await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
});

export default composer;
