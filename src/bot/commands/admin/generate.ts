import { Composer } from "grammy";
import { adminOnly } from "../../middlewares/auth";
import { durationMenu, expiryMenu, quantityMenu } from "../../keyboards/admin";
import {
  generateRedeemCodes,
  DURATION_PRICES,
  formatPrice,
} from "../../../services/redeem";

// Session state per user untuk proses generate
const generateSessions = new Map<
  number,
  {
    durationDays?: number;
    expiresInDays?: number;
  }
>();

const composer = new Composer();

// Command /generate
composer.command("generate", adminOnly, async (ctx) => {
  const userId = ctx.from!.id;
  generateSessions.set(userId, {});

  await ctx.reply(
    "🎫 *Generate Kode Redeem*\n\n" +
      "Kode berlaku untuk Pengumuman.\n" +
      "Pilih durasi layanan:",
    {
      parse_mode: "Markdown",
      reply_markup: durationMenu(),
    }
  );
});

// Callback: pilih durasi
composer.callbackQuery(/^gen:dur:(\d+)$/, adminOnly, async (ctx) => {
  const userId = ctx.from.id;
  const durationDays = parseInt(ctx.match![1]);

  if (DURATION_PRICES[durationDays] === undefined) {
    await ctx.answerCallbackQuery("Durasi tidak valid.");
    return;
  }

  const session = generateSessions.get(userId);
  if (!session) {
    await ctx.answerCallbackQuery("Sesi expired. Gunakan /generate lagi.");
    return;
  }

  session.durationDays = durationDays;
  generateSessions.set(userId, session);

  const price = DURATION_PRICES[durationDays];

  await ctx.editMessageText(
    `🎫 *Generate Kode Redeem*\n\n` +
      `Durasi: ${durationDays} Hari\n` +
      `Harga: ${formatPrice(price)}\n\n` +
      `Pilih masa berlaku kode (batas waktu kode bisa di-redeem):`,
    {
      parse_mode: "Markdown",
      reply_markup: expiryMenu(),
    }
  );
  await ctx.answerCallbackQuery();
});

// Callback: pilih masa berlaku kode
composer.callbackQuery(/^gen:exp:(\d+)$/, adminOnly, async (ctx) => {
  const userId = ctx.from.id;
  const expiresInDays = parseInt(ctx.match![1]);

  const session = generateSessions.get(userId);
  if (!session || !session.durationDays) {
    await ctx.answerCallbackQuery("Sesi expired. Gunakan /generate lagi.");
    return;
  }

  session.expiresInDays = expiresInDays;
  generateSessions.set(userId, session);

  const price = DURATION_PRICES[session.durationDays];

  await ctx.editMessageText(
    `🎫 *Generate Kode Redeem*\n\n` +
      `Durasi: ${session.durationDays} Hari\n` +
      `Harga: ${formatPrice(price)}\n` +
      `Masa berlaku kode: ${expiresInDays} hari\n\n` +
      `Berapa kode yang ingin digenerate?`,
    {
      parse_mode: "Markdown",
      reply_markup: quantityMenu(),
    }
  );
  await ctx.answerCallbackQuery();
});

// Callback: pilih jumlah & generate
composer.callbackQuery(/^gen:qty:(\d+)$/, adminOnly, async (ctx) => {
  const userId = ctx.from.id;
  const quantity = parseInt(ctx.match![1]);

  const session = generateSessions.get(userId);
  if (!session || !session.durationDays || !session.expiresInDays) {
    await ctx.answerCallbackQuery("Sesi expired. Gunakan /generate lagi.");
    return;
  }

  // Generate kode
  const result = await generateRedeemCodes({
    durationDays: session.durationDays,
    expiresInDays: session.expiresInDays,
    createdBy: userId,
    quantity,
  });

  // Format output
  const codesFormatted = result.codes.map((c) => `\`${c}\``).join("\n");
  const expiryDate = result.expiresAt.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  await ctx.editMessageText(
    `✅ *Kode Berhasil Digenerate!*\n\n` +
      `Durasi layanan: ${result.durationDays} hari\n` +
      `Harga jual: ${formatPrice(result.price)}\n` +
      `Berlaku untuk: Pengumuman\n` +
      `Kode expire: ${expiryDate}\n` +
      `Jumlah: ${quantity} kode\n\n` +
      `*Kode Redeem:*\n${codesFormatted}`,
    { parse_mode: "Markdown" }
  );

  // Bersihkan session
  generateSessions.delete(userId);
  await ctx.answerCallbackQuery("Kode berhasil digenerate!");
});

// Callback: batal
composer.callbackQuery("admin:cancel", async (ctx) => {
  const userId = ctx.from.id;
  generateSessions.delete(userId);
  await ctx.editMessageText("❌ Proses dibatalkan.");
  await ctx.answerCallbackQuery();
});

export default composer;
