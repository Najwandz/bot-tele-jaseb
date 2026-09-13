import { Composer } from "grammy";
import { adminOnly } from "../../middlewares/auth";
import { adminMainMenu, listFilterMenu } from "../../keyboards/admin";
import { getCodeStats, checkAndExpireCodes } from "../../../services/redeem";
import generateCommand from "./generate";
import listcodesCommand from "./listcodes";

const composer = new Composer();

// Command /admin - menu utama admin
composer.command("admin", adminOnly, async (ctx) => {
  await ctx.reply(
    "🔐 *Panel Admin*\n\nSelamat datang di panel admin. Pilih menu:",
    {
      parse_mode: "Markdown",
      reply_markup: adminMainMenu(),
    }
  );
});

// Callback: kembali ke menu admin
composer.callbackQuery("admin:menu", adminOnly, async (ctx) => {
  await ctx.editMessageText(
    "🔐 *Panel Admin*\n\nSelamat datang di panel admin. Pilih menu:",
    {
      parse_mode: "Markdown",
      reply_markup: adminMainMenu(),
    }
  );
  await ctx.answerCallbackQuery();
});

// Callback: shortcut listcodes dari menu
composer.callbackQuery("admin:listcodes", adminOnly, async (ctx) => {
  await checkAndExpireCodes();
  const stats = await getCodeStats();

  await ctx.editMessageText(
    `📋 *List Kode Redeem*\n\n` +
      `Total: ${stats.total}\n` +
      `🟢 Belum dipakai: ${stats.unused}\n` +
      `🔴 Sudah dipakai: ${stats.used}\n` +
      `⚫ Expired: ${stats.expired}\n\n` +
      `Pilih filter:`,
    {
      parse_mode: "Markdown",
      reply_markup: listFilterMenu(),
    }
  );
  await ctx.answerCallbackQuery();
});

// Callback: statistik
composer.callbackQuery("admin:stats", adminOnly, async (ctx) => {
  await checkAndExpireCodes();
  const stats = await getCodeStats();

  await ctx.editMessageText(
    `📊 *Statistik Kode Redeem*\n\n` +
      `Total kode: ${stats.total}\n` +
      `🟢 Belum dipakai: ${stats.unused}\n` +
      `🔴 Sudah dipakai: ${stats.used}\n` +
      `⚫ Expired: ${stats.expired}\n\n` +
      `Tingkat penggunaan: ${stats.total > 0 ? Math.round((stats.used / stats.total) * 100) : 0}%`,
    {
      parse_mode: "Markdown",
      reply_markup: adminMainMenu(),
    }
  );
  await ctx.answerCallbackQuery();
});

// Register sub-commands
composer.use(generateCommand);
composer.use(listcodesCommand);

export default composer;
