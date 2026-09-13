import { Composer, Context } from "grammy";
import {
  getActiveSubscriptions,
  formatRemaining,
} from "../../../services/subscription";
import { getAccounts } from "../../../services/gramjs";
import { getBroadcastStateByAccount } from "../../../services/broadcast";

const composer = new Composer();

// ─── Helper: bangun teks status ───────────────────────────────────────────────
export async function buildStatusText(userId: number): Promise<string> {
  const { getUserSettings, formatDelaySettings } = await import("../../../services/userSettings");
  const { getActiveAccount } = await import("../../../services/gramjs");
  const { getUserGroupLists } = await import("../../../services/groupList");
  const { db, schema } = await import("../../../db");
  const { eq, and } = await import("drizzle-orm");
  const { getActiveSubscriptions, formatRemaining } = await import("../../../services/subscription");

  // 1. Dapatkan langganan aktif untuk Expired
  const subs = await getActiveSubscriptions(userId);
  let expiredText = "Tidak Berlangganan";
  if (subs.length > 0) {
    const s = subs[0];
    const expiresAt = s.expiresAt.toLocaleString("en-GB", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).replace(" at", ",");
    expiredText = `${expiresAt}`; // e.g. 20:49, 07 June 2026
  }

  // 2. Dapatkan Settings untuk Jeda & Notifikasi
  const settings = await getUserSettings(userId);
  const jedaText = settings ? formatDelaySettings(settings) : "Normal";
  const { getNotifySettings } = await import("../../../services/userSettings");
  const notifySettings = await getNotifySettings(userId);
  const notifikasiText = notifySettings.enabled ? "Aktif" : "Nonaktif";

  // 3. Dapatkan Grup & List
  const lists = await getUserGroupLists(userId);
  const totalList = lists.length;
  const totalGrup = lists.reduce((acc, curr) => acc + curr.itemCount, 0);

  // 4. Cek apakah Remote (untuk Admin) dan Ambil Active Account untuk Status/Tindakan
  let adminId: string | number = "Tidak ada";
  
  const activeAccount = await getActiveAccount(userId);
  if (activeAccount && activeAccount.label.includes("[REMOTE]")) {
    const remoteQuery = await db.select({
      ownerId: schema.remoteAccessGrants.ownerId
    })
    .from(schema.activeRemoteAccounts)
    .innerJoin(schema.remoteAccessGrants, eq(schema.activeRemoteAccounts.accountId, schema.remoteAccessGrants.accountId))
    .where(eq(schema.activeRemoteAccounts.userId, userId))
    .limit(1);

    if (remoteQuery.length > 0) {
      adminId = remoteQuery[0].ownerId;
    }
  } else if (activeAccount) {
    adminId = "Dikelola Sendiri";
  }

  // 5. Status & Tindakan Terkini
  let statusMode = "Stopped";
  let tindakanText = "Tidak ada tindakan aktif";

  if (activeAccount) {
    const { getBroadcastStateByAccount } = await import("../../../services/broadcast");
    const bcState = getBroadcastStateByAccount(activeAccount.id);
    
    if (bcState) {
      if (bcState.isRunning) {
        statusMode = "Running";
        tindakanText = `Sedang mengirim putaran ${bcState.round} (${bcState.sent}/${bcState.total})`;
      } else if (!bcState.isDone && bcState.round > 0) {
        statusMode = "Waiting/Delay";
        tindakanText = `Sedang melakukan jeda antar putaran`;
      }
    }
  }

  return (
    `🏷 UserID: ${userId}\n` +
    `🌐 Grup: ${totalGrup}\n` +
    `📚 List: ${totalList}\n\n` +
    `👑 Jeda: ${jedaText}\n` +
    `🚀 Status: ${statusMode}\n` +
    `🔥 Expired: ${expiredText}\n` +
    `🔔 Notifikasi: ${notifikasiText}\n` +
    `✉️ Email: Null\n` +
    `👤 Admin: ${adminId}\n` +
    `📦 Tindakan Terkini: ${tindakanText}`
  );
}

// ─── Command /status ──────────────────────────────────────────────────────────
composer.command("status", async (ctx) => {
  const userId = ctx.from!.id;
  const text = await buildStatusText(userId);
  await ctx.reply(text, { parse_mode: "Markdown" });
});

// ─── Callback: tombol "📊 Status Saya" ────────────────────────────────────────
composer.callbackQuery("user:status", async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCallbackQuery();
  const text = await buildStatusText(userId);
  await ctx.editMessageText(text, { parse_mode: "Markdown" });
});

export default composer;
