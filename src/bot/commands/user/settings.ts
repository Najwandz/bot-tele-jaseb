import { Composer, Context, InlineKeyboard } from "grammy";
import {
  getUserSettings,
  setPerGroupDelay,
  setPerRoundDelay,
  formatDelaySettings,
} from "../../../services/userSettings";

const composer = new Composer();

// ─── Helper: bangun teks menu utama ──────────────────────────────────────────
async function buildMainMenuText(userId: number): Promise<string> {
  const settings = await getUserSettings(userId);
  const current = settings ? formatDelaySettings(settings) : "_Belum diatur_";

  return (
    `⚙️ *Pengaturan Jeda Broadcast*\n\n` +
    `Mode aktif: ${current}\n\n` +
    `Pilih mode jeda:\n\n` +
    `⏱ *Jeda Per Grup* — jeda antar pengiriman ke setiap grup.\n` +
    `_Contoh: 10 detik = tunggu 10 detik sebelum kirim ke grup berikutnya_\n\n` +
    `⏰ *Jeda Per Semua Grup* — jeda setelah 1 putaran semua grup selesai.\n` +
    `_Contoh: 10 menit = tunggu 10 menit sebelum mulai putaran berikutnya_`
  );
}

function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text("⏱ Jeda Per Grup", "set:mode_per_group")
    .row()
    .text("⏰ Jeda Per Semua Grup", "set:mode_per_round");
}

// ─── Entry point ─────────────────────────────────────────────────────────────
export async function handleAturJeda(ctx: Context) {
  const userId = ctx.from!.id;
  const text = await buildMainMenuText(userId);
  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard(),
  });
}

// ─── Mode: Jeda Per Grup ──────────────────────────────────────────────────────
// Pilihan: 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30,
//          32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60 detik
composer.callbackQuery("set:mode_per_group", async (ctx) => {
  // Buat keyboard 3 kolom untuk pilihan 4-60 detik (beda 2 detik)
  const keyboard = new InlineKeyboard();
  const options = Array.from({ length: 29 }, (_, i) => 4 + i * 2); // [4,6,8,...,60]

  options.forEach((sec, idx) => {
    keyboard.text(`${sec}s`, `set:pg:${sec}`);
    if ((idx + 1) % 5 === 0) keyboard.row(); // 5 per baris
  });
  keyboard.row().text("🔙 Kembali", "set:back");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `⏱ *Jeda Per Grup*\n\n` +
      `Pilih jeda antar pengiriman ke setiap grup:\n` +
      `_(4 detik = paling cepat, 60 detik = paling lambat)_`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

// ─── Mode: Jeda Per Semua Grup ────────────────────────────────────────────────
// Pilihan: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30 menit
composer.callbackQuery("set:mode_per_round", async (ctx) => {
  const keyboard = new InlineKeyboard();
  const options = Array.from({ length: 15 }, (_, i) => 2 + i * 2); // [2,4,6,...,30]

  options.forEach((min, idx) => {
    keyboard.text(`${min} mnt`, `set:pr:${min}`);
    if ((idx + 1) % 5 === 0) keyboard.row();
  });
  keyboard.row().text("🔙 Kembali", "set:back");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `⏰ *Jeda Per Semua Grup*\n\n` +
      `Pilih jeda setelah 1 putaran semua grup selesai:\n` +
      `_(2 menit = paling cepat, 30 menit = paling lambat)_`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

// ─── Callback: simpan jeda per grup ──────────────────────────────────────────
composer.callbackQuery(/^set:pg:(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const seconds = parseInt(ctx.match![1]);

  await setPerGroupDelay(userId, seconds);

  await ctx.answerCallbackQuery("Tersimpan!");
  await ctx.editMessageText(
    `✅ *Pengaturan Tersimpan*\n\n` +
      `Mode: ⏱ *Jeda Per Grup (${seconds} detik)*\n\n` +
      `Setiap pengiriman akan menunggu *${seconds} detik* sebelum lanjut ke grup berikutnya.`,
    { parse_mode: "Markdown" }
  );
});

// ─── Callback: simpan jeda per semua grup ────────────────────────────────────
composer.callbackQuery(/^set:pr:(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const minutes = parseInt(ctx.match![1]);

  await setPerRoundDelay(userId, minutes);

  await ctx.answerCallbackQuery("Tersimpan!");
  await ctx.editMessageText(
    `✅ *Pengaturan Tersimpan*\n\n` +
      `Mode: ⏰ *Jeda Per Semua Grup (${minutes} menit)*\n\n` +
      `Setelah semua grup dalam list selesai dikirim, sistem akan menunggu *${minutes} menit* sebelum memulai putaran berikutnya.`,
    { parse_mode: "Markdown" }
  );
});

// ─── Kembali ke menu utama ───────────────────────────────────────────────────
composer.callbackQuery("set:back", async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCallbackQuery();
  const text = await buildMainMenuText(userId);
  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard(),
  });
});

export default composer;
