import { Composer, Context, InlineKeyboard } from "grammy";
import {
  getAccounts,
  grantRemoteAccess,
  revokeRemoteAccess,
  getGivenGrants,
} from "../../../services/gramjs";

const composer = new Composer();

export const grantingAccessUsers = new Set<number>();

// ─── Helper: bangun teks Control Panel ───────────────────────────────────────
async function buildControlText(userId: number): Promise<string> {
  return (
    `🎛 *Control Panel — Remote Akses*\n\n` +
    `Di sini Anda bisa memberikan akses ke akun Anda kepada orang lain agar mereka dapat menggunakan fitur bot (Scan Grup, Broadcast, dll).`
  );
}

function buildControlKeyboard() {
  const kb = new InlineKeyboard();
  kb.text("🤝 Berikan Akses", "ctrl:grant").row();
  kb.text("📋 Kelola Akses", "ctrl:manage_grants").row();
  return kb;
}

// ─── Entry point: tombol "🎛 Control" ─────────────────────────────────────────
export async function handleControl(ctx: Context) {
  const userId = ctx.from!.id;
  const text = await buildControlText(userId);
  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: buildControlKeyboard(),
  });
}

// ─── Callback: refresh control panel ─────────────────────────────────────────
composer.callbackQuery("ctrl:menu", async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(await buildControlText(userId), {
    parse_mode: "Markdown",
    reply_markup: buildControlKeyboard(),
  });
});

// ─── Message handler: terima nomor HP untuk tambah akun ──────────────────────
composer.on("message:text", async (ctx, next) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  if (text.startsWith("/")) {
    grantingAccessUsers.delete(userId);
    return next();
  }

  // Cek jika sedang memberikan akses
  if (grantingAccessUsers.has(userId)) {
    const targetId = parseInt(text);
    if (isNaN(targetId) || targetId <= 0) {
      await ctx.reply("⚠️ ID Telegram tidak valid. Kirimkan angka ID yang benar.");
      return;
    }
    grantingAccessUsers.delete(userId);
    
    const accounts = await getAccounts(userId);
    const kb = new InlineKeyboard();
    accounts.forEach((a) => {
      kb.text(`Bagikan ${a.label}`, `ctrl:grant_acc:${targetId}:${a.id}`).row();
    });
    kb.text("❌ Batal", "ctrl:menu");
    
    await ctx.reply(`Pilih akun mana yang ingin Anda berikan aksesnya ke ID \`${targetId}\`:`, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
    return;
  }

  return next();
});

// ─── Callback: berikan akses ──────────────────────────────────────────────────
composer.callbackQuery("ctrl:grant", async (ctx) => {
  const userId = ctx.from.id;
  grantingAccessUsers.add(userId);
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `🤝 *Berikan Akses Remote*\n\n` +
      `Kirimkan *ID Telegram* pengguna yang ingin Anda berikan akses.\n` +
      `(Contoh: \`123456789\`)\n\n` +
      `_Catatan: Pengguna tersebut nantinya bisa mengontrol (Scan/Broadcast) akun Anda._`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("❌ Batal", "ctrl:cancel_grant"),
    }
  );
});

composer.callbackQuery("ctrl:cancel_grant", async (ctx) => {
  const userId = ctx.from.id;
  grantingAccessUsers.delete(userId);
  await ctx.editMessageText("❌ Batal memberikan akses.");
});

composer.callbackQuery(/^ctrl:grant_acc:(\d+):(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const targetId = parseInt(ctx.match![1]);
  const accountId = parseInt(ctx.match![2]);
  
  await grantRemoteAccess(userId, targetId, accountId);
  await ctx.answerCallbackQuery("Akses berhasil diberikan!");
  await ctx.editMessageText(`✅ Akses ke akun berhasil diberikan kepada ID \`${targetId}\`.`, {
    parse_mode: "Markdown",
  });
});

// ─── Callback: kelola akses ───────────────────────────────────────────────────
composer.callbackQuery("ctrl:manage_grants", async (ctx) => {
  const userId = ctx.from.id;
  const grants = await getGivenGrants(userId);
  if (grants.length === 0) {
    await ctx.answerCallbackQuery("Belum ada akses yang diberikan.");
    return;
  }
  
  const kb = new InlineKeyboard();
  grants.forEach((g) => {
    kb.text(`❌ Hapus akses ID ${g.granteeId} (${g.label})`, `ctrl:revoke_grant:${g.grantId}`).row();
  });
  kb.text("🔙 Kembali", "ctrl:menu");
  
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`📋 *Kelola Akses Remote*\n\nKetuk untuk mencabut akses:`, {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
});

composer.callbackQuery(/^ctrl:revoke_grant:(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const grantId = parseInt(ctx.match![1]);
  
  await revokeRemoteAccess(userId, grantId);
  await ctx.answerCallbackQuery("Akses dicabut!");
  
  const grants = await getGivenGrants(userId);
  if (grants.length === 0) {
    await ctx.editMessageText("Semua akses telah dicabut.", { reply_markup: new InlineKeyboard().text("🔙 Kembali", "ctrl:menu") });
  } else {
    const kb = new InlineKeyboard();
    grants.forEach((g) => {
      kb.text(`❌ Hapus akses ID ${g.granteeId} (${g.label})`, `ctrl:revoke_grant:${g.grantId}`).row();
    });
    kb.text("🔙 Kembali", "ctrl:menu");
    await ctx.editMessageText(`📋 *Kelola Akses Remote*\n\nKetuk untuk mencabut akses:`, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  }
});

export default composer;
