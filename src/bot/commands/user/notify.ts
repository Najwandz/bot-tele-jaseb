import { Composer, Context, InlineKeyboard } from "grammy";
import { config } from "../../../config";
import {
  getNotifySettings,
  setNotifyEnabled,
  toggleNotifyTarget,
} from "../../../services/userSettings";

const composer = new Composer();

// ─── Helper: bangun teks menu notifikasi ─────────────────────────────────────
async function buildNotifyMenuText(userId: number): Promise<string> {
  const notify = await getNotifySettings(userId);

  const statusLabel = notify.enabled ? "✅ Aktif" : "🔕 Nonaktif";
  
  const hasAdmin = notify.targets.includes("admin") ? "✅ Aktif (Kirim via Akun Kita ke Admin)" : "❌ Nonaktif";
  const hasSelf = notify.targets.includes("self") ? "✅ Aktif (Kirim via Bot Notifikasi ke Saya)" : "❌ Nonaktif";

  const botUsername = config.notifyBotUsername || "JavaNotifBot";

  return (
    `🔔 *Pengaturan Notifikasi Broadcast*\n\n` +
    `Status Keseluruhan: ${statusLabel}\n\n` +
    `Tujuan Notifikasi:\n` +
    `👤 *Admin*: ${hasAdmin}\n` +
    `📱 *Saya (Akun Sendiri)*: ${hasSelf}\n\n` +
    `⚠️ *PENTING:* Jika Anda mengaktifkan notifikasi ke *Saya*, Anda WAJIB memulai/start bot notifikasi di bawah ini terlebih dahulu agar notifikasi bisa terkirim:\n` +
    `👉 [Bot Notifikasi](https://t.me/${botUsername})`
  );
}

function buildNotifyKeyboard(enabled: boolean, targets: ("admin" | "self")[]) {
  const kb = new InlineKeyboard();

  const adminLabel = targets.includes("admin") ? "👤 Target Admin: ✅ ON" : "👤 Target Admin: ❌ OFF";
  const selfLabel = targets.includes("self") ? "📱 Target Saya: ✅ ON" : "📱 Target Saya: ❌ OFF";
  const statusLabel = enabled ? "🔕 Nonaktifkan" : "🔔 Aktifkan Keseluruhan";

  kb.text(adminLabel, "ntf:toggle:admin").row();
  kb.text(selfLabel, "ntf:toggle:self").row();
  kb.text(statusLabel, "ntf:toggle:status").row();

  return kb;
}

async function refreshNotifyMenu(ctx: Context, userId: number) {
  const notify = await getNotifySettings(userId);
  const text = await buildNotifyMenuText(userId);
  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: buildNotifyKeyboard(notify.enabled, notify.targets),
    link_preview_options: { is_disabled: true },
  });
}

// ─── Entry point: tap tombol "🔔 Notifikasi" ─────────────────────────────────
export async function handleNotifikasi(ctx: Context) {
  const userId = ctx.from!.id;
  const notify = await getNotifySettings(userId);
  const text = await buildNotifyMenuText(userId);

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: buildNotifyKeyboard(notify.enabled, notify.targets),
    link_preview_options: { is_disabled: true },
  });
}

// ─── Callback: Toggle Targets ───────────────────────────────────────────────
composer.callbackQuery("ntf:toggle:admin", async (ctx) => {
  const userId = ctx.from.id;
  const notify = await getNotifySettings(userId);
  const isTurningOn = !notify.targets.includes("admin");

  if (isTurningOn) {
    const { getGivenGrants } = await import("../../../services/gramjs");
    const grants = await getGivenGrants(userId);
    if (grants.length === 0) {
      await ctx.answerCallbackQuery({
        text: "⚠️ Anda belum memberikan Akses Remote kepada siapapun (belum ada list ID Control). Tidak bisa mengaktifkan notifikasi ke Admin.",
        show_alert: true
      });
      return;
    }
  }

  await toggleNotifyTarget(userId, "admin");
  const updatedNotify = await getNotifySettings(userId);
  if (updatedNotify.targets.length > 0 && !updatedNotify.enabled) {
    await setNotifyEnabled(userId, true);
  } else if (updatedNotify.targets.length === 0 && updatedNotify.enabled) {
    await setNotifyEnabled(userId, false);
  }
  await ctx.answerCallbackQuery("Target Admin diperbarui.");
  await refreshNotifyMenu(ctx, userId);
});

composer.callbackQuery("ntf:toggle:self", async (ctx) => {
  const userId = ctx.from.id;
  await toggleNotifyTarget(userId, "self");
  const updatedNotify = await getNotifySettings(userId);
  if (updatedNotify.targets.length > 0 && !updatedNotify.enabled) {
    await setNotifyEnabled(userId, true);
  } else if (updatedNotify.targets.length === 0 && updatedNotify.enabled) {
    await setNotifyEnabled(userId, false);
  }
  await ctx.answerCallbackQuery("Target Saya diperbarui.");
  await refreshNotifyMenu(ctx, userId);
});

// ─── Callback: Toggle Status ────────────────────────────────────────────────
composer.callbackQuery("ntf:toggle:status", async (ctx) => {
  const userId = ctx.from.id;
  const notify = await getNotifySettings(userId);
  await setNotifyEnabled(userId, !notify.enabled);
  await ctx.answerCallbackQuery(notify.enabled ? "Notifikasi dinonaktifkan." : "Notifikasi diaktifkan.");
  await refreshNotifyMenu(ctx, userId);
});

export default composer;
