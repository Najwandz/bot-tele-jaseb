import { Composer, InlineKeyboard } from "grammy";
import {
  getActiveSubscriptions,
  formatRemaining,
  SERVICE_LABELS,
  ServiceType,
  expireOldSubscriptions,
} from "../../../services/subscription";
import { db, schema } from "../../../db";
import { eq, and } from "drizzle-orm";
import { deleteSession, hasSession, clearLoginState } from "../../../services/gramjs";

const composer = new Composer();

// Command /endsub
composer.command("endsub", async (ctx) => {
  const userId = ctx.from!.id;
  const subs = await getActiveSubscriptions(userId);

  if (subs.length === 0) {
    await ctx.reply(
      "ℹ️ Anda tidak memiliki langganan aktif yang bisa dihentikan.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Kalau hanya 1 subscription, langsung tampilkan konfirmasi
  if (subs.length === 1) {
    const sub = subs[0];
    const serviceLabel = sub.serviceType
      ? SERVICE_LABELS[sub.serviceType as ServiceType]
      : "_Belum dipilih_";
    const expiry = sub.expiresAt.toLocaleString("id-ID", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const confirmMenu = new InlineKeyboard()
      .text("✅ Ya, Hentikan", `endsub:confirm:${sub.id}`)
      .row()
      .text("❌ Batal", "endsub:cancel");

    await ctx.reply(
      `⚠️ *Konfirmasi Hentikan Langganan*\n\n` +
        `Subscription #${sub.id}\n` +
        `Kode: \`${sub.code}\`\n` +
        `Layanan: ${serviceLabel}\n` +
        `Sisa waktu: *${formatRemaining(sub.expiresAt)}*\n` +
        `Berakhir: ${expiry}\n\n` +
        `Langganan yang dihentikan *tidak dapat dipulihkan*.\n` +
        `Yakin ingin menghentikan?`,
      { parse_mode: "Markdown", reply_markup: confirmMenu }
    );
    return;
  }

  // Lebih dari 1 subscription — tampilkan daftar pilihan
  const lines = subs.map((s, i) => {
    const serviceLabel = s.serviceType
      ? SERVICE_LABELS[s.serviceType as ServiceType]
      : "Belum dipilih";
    return `${i + 1}. #${s.id} · ${serviceLabel} · sisa ${formatRemaining(s.expiresAt)}`;
  });

  const keyboard = new InlineKeyboard();
  subs.forEach((s, i) => {
    const serviceLabel = s.serviceType
      ? SERVICE_LABELS[s.serviceType as ServiceType]
      : "Belum dipilih";
    keyboard.text(`#${s.id} · ${serviceLabel}`, `endsub:select:${s.id}`).row();
  });
  keyboard.text("❌ Batal", "endsub:cancel");

  await ctx.reply(
    `📋 *Pilih Langganan yang Ingin Dihentikan*\n\n` +
      lines.join("\n"),
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

// ─── Callback: pilih subscription (kalau lebih dari 1) ───────────────────────
composer.callbackQuery(/^endsub:select:(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const subId = parseInt(ctx.match![1]);

  const subs = await getActiveSubscriptions(userId);
  const sub = subs.find((s) => s.id === subId);

  if (!sub) {
    await ctx.editMessageText("⚠️ Langganan tidak ditemukan atau sudah tidak aktif.");
    await ctx.answerCallbackQuery();
    return;
  }

  const serviceLabel = sub.serviceType
    ? SERVICE_LABELS[sub.serviceType as ServiceType]
    : "_Belum dipilih_";
  const expiry = sub.expiresAt.toLocaleString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const confirmMenu = new InlineKeyboard()
    .text("✅ Ya, Hentikan", `endsub:confirm:${sub.id}`)
    .row()
    .text("❌ Batal", "endsub:cancel");

  await ctx.editMessageText(
    `⚠️ *Konfirmasi Hentikan Langganan*\n\n` +
      `Subscription #${sub.id}\n` +
      `Kode: \`${sub.code}\`\n` +
      `Layanan: ${serviceLabel}\n` +
      `Sisa waktu: *${formatRemaining(sub.expiresAt)}*\n` +
      `Berakhir: ${expiry}\n\n` +
      `Langganan yang dihentikan *tidak dapat dipulihkan*.\n` +
      `Yakin ingin menghentikan?`,
    { parse_mode: "Markdown", reply_markup: confirmMenu }
  );
  await ctx.answerCallbackQuery();
});

// ─── Callback: konfirmasi hentikan ───────────────────────────────────────────
composer.callbackQuery(/^endsub:confirm:(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const subId = parseInt(ctx.match![1]);

  // Pastikan subscription milik user ini dan masih aktif
  const subs = await getActiveSubscriptions(userId);
  const sub = subs.find((s) => s.id === subId);

  if (!sub) {
    await ctx.editMessageText("⚠️ Langganan tidak ditemukan atau sudah tidak aktif.");
    await ctx.answerCallbackQuery();
    return;
  }

  // Tandai expired
  await db
    .update(schema.subscriptions)
    .set({ status: "expired" })
    .where(
      and(
        eq(schema.subscriptions.id, subId),
        eq(schema.subscriptions.userId, userId)
      )
    );

  // Kalau layanannya sewa_jasa, hapus session juga
  let sessionNote = "";
  if (sub.serviceType === "sewa_jasa" && (await hasSession(userId))) {
    await deleteSession(userId);
    clearLoginState(userId);
    sessionNote = "\n\n🔌 Akun Telegram Anda juga telah diputus.";
  }

  await ctx.answerCallbackQuery("Langganan dihentikan.");
  await ctx.editMessageText(
    `✅ *Langganan Dihentikan*\n\n` +
      `Subscription #${sub.id} telah dihentikan.\n` +
      `Kode: \`${sub.code}\`${sessionNote}\n\n` +
      `Gunakan /redeem untuk mengaktifkan layanan baru.`,
    { parse_mode: "Markdown" }
  );
});

// ─── Callback: batal ─────────────────────────────────────────────────────────
composer.callbackQuery("endsub:cancel", async (ctx) => {
  await ctx.editMessageText("❌ Dibatalkan. Langganan Anda tetap aktif.");
  await ctx.answerCallbackQuery("Dibatalkan.");
});

export default composer;
