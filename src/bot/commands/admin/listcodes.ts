import { Composer } from "grammy";
import { adminOnly } from "../../middlewares/auth";
import { listFilterMenu } from "../../keyboards/admin";
import {
  getRedeemCodes,
  getCodeStats,
  checkAndExpireCodes,
  formatPrice,
} from "../../../services/redeem";

const composer = new Composer();

// Command /listcodes
composer.command("listcodes", adminOnly, async (ctx) => {
  await checkAndExpireCodes();
  const stats = await getCodeStats();

  await ctx.reply(
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
});

// Callback: filter list
composer.callbackQuery(
  /^list:filter:(all|unused|used|expired)$/,
  adminOnly,
  async (ctx) => {
    const filter = ctx.match![1] as "all" | "unused" | "used" | "expired";

    await checkAndExpireCodes();
    const codes = await getRedeemCodes(filter);

    if (codes.length === 0) {
      await ctx.editMessageText(
        `📋 *List Kode Redeem*\n\nTidak ada kode dengan filter: *${filter}*`,
        {
          parse_mode: "Markdown",
          reply_markup: listFilterMenu(),
        }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    const displayCodes = codes.slice(0, 20);
    const remaining = codes.length - displayCodes.length;

    const lines = displayCodes.map((c) => {
      const statusIcon =
        c.status === "unused" ? "🟢" : c.status === "used" ? "🔴" : "⚫";
      const expiry = c.expiresAt.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      let line = `${statusIcon} \`${c.code}\` ${c.durationDays}hr · ${formatPrice(c.price)}`;

      if (c.status === "used" && c.usedBy) {
        line += ` | User: ${c.usedBy}`;
      } else {
        line += ` | Exp: ${expiry}`;
      }

      return line;
    });

    let message =
      `📋 *List Kode Redeem* (${filter})\n` +
      `Menampilkan ${displayCodes.length} dari ${codes.length} kode\n\n` +
      lines.join("\n");

    if (remaining > 0) {
      message += `\n\n_...dan ${remaining} kode lainnya_`;
    }

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: listFilterMenu(),
    });
    await ctx.answerCallbackQuery();
  }
);

export default composer;
