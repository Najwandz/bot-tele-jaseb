import { Composer, InlineKeyboard } from "grammy";
import {
  checkBeforeRedeem,
  extendSubscription,
  formatRemaining,
} from "../../../services/subscription";
import { afterRedeemMenu } from "../../keyboards/user";

const composer = new Composer();

// In-memory: simpan kode pending konfirmasi perpanjang
const pendingExtend = new Map<number, string>();

// In-memory: user yang sedang menunggu input kode redeem (dari tombol)
export const waitingRedeemInput = new Set<number>();

// ─── Helper: proses kode redeem ───────────────────────────────────────────────
async function processRedeem(
  ctx: any,
  userId: number,
  username: string | undefined,
  arg: string
) {
  const result = await checkBeforeRedeem(userId, arg);

  if (!result.success) {
    await ctx.reply(`❌ ${result.message}`);
    return;
  }

  // ── Mode perpanjang: ada subscription aktif ──
  if (result.mode === "extend" && result.existingSubscription && result.subscription) {
    const existing = result.existingSubscription;
    const newCode = result.subscription;

    const existingExpiry = existing.expiresAt.toLocaleString("id-ID", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const newExpiry = newCode.expiresAt.toLocaleString("id-ID", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    pendingExtend.set(userId, arg.trim().toUpperCase());

    const confirmMenu = new InlineKeyboard()
      .text("✅ Ya, Perpanjang", "redeem:confirm_extend")
      .row()
      .text("❌ Batal", "redeem:cancel_extend");

    await ctx.reply(
      `⚠️ *Anda masih memiliki Userbot aktif!*\n\n` +
        `Sisa waktu: ${formatRemaining(existing.expiresAt)}\n` +
        `Aktif sampai: ${existingExpiry}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Kode baru: \`${newCode.code}\`\n` +
        `Tambahan: +${newCode.durationDays} hari\n` +
        `Aktif sampai (baru): *${newExpiry}*\n\n` +
        `Apakah Anda ingin memperpanjang?`,
      { parse_mode: "Markdown", reply_markup: confirmMenu }
    );
    return;
  }

  // ── Mode baru: langsung aktif ──
  if (!result.subscription) {
    await ctx.reply("❌ Terjadi kesalahan. Coba lagi.");
    return;
  }

  await sendRedeemSuccess(ctx, result.subscription);
}

// ─── Command /redeem <kode> ───────────────────────────────────────────────────
composer.command("redeem", async (ctx) => {
  const userId = ctx.from!.id;
  const username = ctx.from!.username;
  const arg = ctx.match?.trim() || "";

  if (!arg) {
    waitingRedeemInput.add(userId);
    await ctx.reply(
      "🎟 *Redeem Kode*\n\nKirim kode redeem Anda:",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Batal", "redeem:cancel_input"),
      }
    );
    return;
  }

  await processRedeem(ctx, userId, username, arg);
});

// ─── Message handler: tangkap kode dari input tombol ─────────────────────────
composer.on("message:text", async (ctx, next) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  if (text.startsWith("/")) return next();
  if (!waitingRedeemInput.has(userId)) return next();

  waitingRedeemInput.delete(userId);
  await processRedeem(ctx, userId, ctx.from.username, text);
});

// ─── Callback: batal input kode ──────────────────────────────────────────────
composer.callbackQuery("redeem:cancel_input", async (ctx) => {
  waitingRedeemInput.delete(ctx.from.id);
  await ctx.editMessageText("❌ Redeem dibatalkan.");
  await ctx.answerCallbackQuery("Dibatalkan.");
});

// ─── Callback: konfirmasi perpanjang ─────────────────────────────────────────
composer.callbackQuery("redeem:confirm_extend", async (ctx) => {
  const userId = ctx.from.id;
  const code = pendingExtend.get(userId);

  if (!code) {
    await ctx.editMessageText("⚠️ Sesi konfirmasi sudah habis. Coba redeem ulang.");
    await ctx.answerCallbackQuery();
    return;
  }

  pendingExtend.delete(userId);
  const result = await extendSubscription(userId, ctx.from.username, code);

  if (!result.success || !result.subscription) {
    await ctx.editMessageText(`❌ ${result.message}`);
    await ctx.answerCallbackQuery();
    return;
  }

  const sub = result.subscription;
  await ctx.answerCallbackQuery("Userbot berhasil diperpanjang!");
  await ctx.editMessageText(
    `✅ *Userbot Berhasil Diperpanjang!*\n\n` +
      `Kode: \`${sub.code}\`\n` +
      `Tambahan: +${sub.durationDays} hari\n` +
      `Aktif sampai: ${sub.expiresAt.toLocaleString("id-ID", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })}\n` +
      `Sisa waktu: ${formatRemaining(sub.expiresAt)}`,
    { parse_mode: "Markdown" }
  );
});

// ─── Callback: batal perpanjang ───────────────────────────────────────────────
composer.callbackQuery("redeem:cancel_extend", async (ctx) => {
  pendingExtend.delete(ctx.from.id);
  await ctx.editMessageText(
    "❌ Perpanjangan dibatalkan.\n\nKode tidak digunakan dan masih bisa dipakai nanti."
  );
  await ctx.answerCallbackQuery("Dibatalkan.");
});

// ─── Helper: pesan sukses redeem baru ────────────────────────────────────────
async function sendRedeemSuccess(
  ctx: any,
  sub: { id: number; code: string; durationDays: number; activatedAt: Date; expiresAt: Date }
) {
  const expiry = sub.expiresAt.toLocaleString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  await ctx.reply(
    `✅ *Userbot Berhasil Dibuat!*\n\n` +
      `Kode: \`${sub.code}\`\n` +
      `Durasi: ${sub.durationDays} hari\n` +
      `Aktif sampai: ${expiry}\n` +
      `Sisa waktu: ${formatRemaining(sub.expiresAt)}\n\n` +
      `Silakan login untuk mulai menggunakan Userbot Anda.`,
    {
      parse_mode: "Markdown",
      reply_markup: afterRedeemMenu(),
    }
  );
}

export default composer;
