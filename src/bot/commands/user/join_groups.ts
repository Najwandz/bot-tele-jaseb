import { Composer, Context, InlineKeyboard, InputFile } from "grammy";
import { loadClient, hasSession, getActiveAccount } from "../../../services/gramjs";
import { Api } from "telegram";

const composer = new Composer();

// ─── In-memory: state per user ────────────────────────────────────────────────
type JoinMode = "username" | "link";
interface JoinState {
  mode: JoinMode;
}
const joinStates = new Map<number, JoinState>();

// ─── Entry point ─────────────────────────────────────────────────────────────
export async function handleBergabungGrup(ctx: Context) {
  const userId = ctx.from!.id;

  if (!(await hasSession(userId))) {
    await ctx.reply(
      "❌ Akun belum terhubung.\n\nGunakan /login untuk menghubungkan akun Telegram Anda."
    );
    return;
  }

  const active = await getActiveAccount(userId);
  const accountLabel = active ? active.label : "tidak diketahui";

  const keyboard = new InlineKeyboard()
    .text("👤 Via Username (@)", "join:mode:username")
    .row()
    .text("🔗 Via Link Invite", "join:mode:link");

  await ctx.reply(
    "🚪 *Bergabung Grup*\n\n" +
      `Akun yang dipakai: *${accountLabel}*\n` +
      `_Ganti akun di menu 🎛 Control_\n\n` +
      "Pilih metode bergabung:",
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

// ─── Callback: pilih mode ─────────────────────────────────────────────────────
composer.callbackQuery("join:mode:username", async (ctx) => {
  const userId = ctx.from.id;
  joinStates.set(userId, { mode: "username" });

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "👤 *Bergabung via Username*\n\n" +
      "Kirim username grup, satu per baris.\n\n" +
      "Contoh:\n" +
      "`@gruppertama`\n" +
      "`@grupkedua`\n" +
      "`@grupketiga`\n\n" +
      "Tanda `@` wajib disertakan.",
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("❌ Batal", "join:cancel"),
    }
  );
});

composer.callbackQuery("join:mode:link", async (ctx) => {
  const userId = ctx.from.id;
  joinStates.set(userId, { mode: "link" });

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "🔗 *Bergabung via Link Invite*\n\n" +
      "Kirim link invite grup, satu per baris.\n\n" +
      "Contoh:\n" +
      "`https://t.me/+AbCdEfGhIjKl`\n" +
      "`https://t.me/namagrup`\n" +
      "`t.me/+XyZaBcDeFgHi`",
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("❌ Batal", "join:cancel"),
    }
  );
});

// ─── Message handler: terima input ───────────────────────────────────────────
composer.on("message:text", async (ctx, next) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  if (text.startsWith("/")) return next();

  const state = joinStates.get(userId);
  if (!state) return next();

  joinStates.delete(userId);

  // Parse input berdasarkan mode
  const lines = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let targets: string[] = [];
  let invalidLines: string[] = [];

  if (state.mode === "username") {
    for (const line of lines) {
      // Terima @username atau username saja
      const clean = line.startsWith("@") ? line : `@${line}`;
      if (/^@[a-zA-Z][a-zA-Z0-9_]{3,}$/.test(clean)) {
        targets.push(clean);
      } else {
        invalidLines.push(line);
      }
    }
  } else {
    // Mode link
    for (const line of lines) {
      // Terima t.me/xxx, https://t.me/xxx, t.me/+xxx
      const clean = line.replace(/^https?:\/\//, "");
      if (/^t\.me\//.test(clean)) {
        targets.push(line.startsWith("http") ? line : `https://${clean}`);
      } else {
        invalidLines.push(line);
      }
    }
  }

  if (targets.length === 0) {
    await ctx.reply(
      `⚠️ Tidak ada ${state.mode === "username" ? "username" : "link"} valid.\n\nCoba lagi:`,
      {
        reply_markup: new InlineKeyboard().text("❌ Batal", "join:cancel"),
      }
    );
    joinStates.set(userId, state);
    return;
  }

  // Tampilkan konfirmasi
  const preview = targets.slice(0, 10).map((t, i) => `${i + 1}. ${t}`).join("\n");
  const more = targets.length > 10 ? `\n_...dan ${targets.length - 10} lainnya_` : "";
  const invalidNote =
    invalidLines.length > 0
      ? `\n\n⚠️ ${invalidLines.length} baris tidak valid diabaikan.`
      : "";

  // Encode targets untuk callback (pakai base64 agar aman)
  const encoded = Buffer.from(JSON.stringify(targets)).toString("base64");

  // Kalau terlalu panjang untuk callback data (max 64 bytes), simpan di memory
  pendingJoin.set(userId, targets);

  const confirmMenu = new InlineKeyboard()
    .text("✅ Mulai Bergabung", "join:confirm")
    .row()
    .text("❌ Batal", "join:cancel");

  await ctx.reply(
    `🚪 *Konfirmasi Bergabung Grup*\n\n` +
      `Mode: ${state.mode === "username" ? "👤 Username" : "🔗 Link Invite"}\n` +
      `Jumlah: *${targets.length} grup*\n\n` +
      preview + more + invalidNote + `\n\nMulai proses bergabung?`,
    { parse_mode: "Markdown", reply_markup: confirmMenu }
  );
});

// ─── Pending join (menunggu konfirmasi) ───────────────────────────────────────
const pendingJoin = new Map<number, string[]>();

// ─── Callback: mulai bergabung ────────────────────────────────────────────────
composer.callbackQuery("join:confirm", async (ctx) => {
  const userId = ctx.from.id;
  const targets = pendingJoin.get(userId);

  if (!targets || targets.length === 0) {
    await ctx.editMessageText("⚠️ Sesi sudah habis. Coba lagi.");
    await ctx.answerCallbackQuery();
    return;
  }

  pendingJoin.delete(userId);

  await ctx.answerCallbackQuery("Memulai proses bergabung...");
  await ctx.editMessageText(
    `⏳ *Sedang bergabung ke ${targets.length} grup...*\n\nMohon tunggu.`,
    { parse_mode: "Markdown" }
  );

  const client = await loadClient(userId);
  if (!client) {
    await ctx.editMessageText("❌ Gagal memuat sesi akun. Coba /login ulang.");
    return;
  }

  const results: { target: string; success: boolean; reason?: string }[] = [];

  for (const target of targets) {
    try {
      if (target.startsWith("@")) {
        // Join via username
        const username = target.slice(1); // hapus @
        await client.invoke(
          new Api.channels.JoinChannel({
            channel: username as any,
          })
        );
      } else {
        // Join via link invite
        // Ekstrak hash dari link: t.me/+HASH atau t.me/joinchat/HASH
        const url = new URL(target);
        const path = url.pathname; // mis. /+AbCdEf atau /namagrup

        if (path.startsWith("/+") || path.startsWith("/joinchat/")) {
          // Private invite link
          const hash = path.startsWith("/+")
            ? path.slice(2)
            : path.replace("/joinchat/", "");

          await client.invoke(
            new Api.messages.ImportChatInvite({ hash })
          );
        } else {
          // Public link (t.me/namagrup) — sama seperti username
          const username = path.slice(1); // hapus leading /
          await client.invoke(
            new Api.channels.JoinChannel({
              channel: username as any,
            })
          );
        }
      }

      results.push({ target, success: true });
    } catch (err: any) {
      const msg: string = err?.message || String(err);
      results.push({ target, success: false, reason: parseJoinError(msg) });
    }

    // Delay antar join untuk hindari flood
    await delay(2000);
  }

  await client.disconnect().catch(() => {});

  // Buat rekap
  const berhasil = results.filter((r) => r.success);
  const gagal = results.filter((r) => !r.success);

  let rekapText =
    `🚪 *Rekap Bergabung Grup*\n\n` +
    `✅ Berhasil: ${berhasil.length}\n` +
    `❌ Gagal: ${gagal.length}\n` +
    `📊 Total: ${results.length}`;

  if (berhasil.length > 0) {
    const lines = berhasil.map((r, i) => `${i + 1}. ${r.target}`).join("\n");
    rekapText += `\n\n━━━━━━━━━━━━━━━━━━━━\n✅ *Berhasil bergabung:*\n${lines}`;
  }

  if (gagal.length > 0) {
    const lines = gagal
      .map((r, i) => `${i + 1}. ${r.target}\n   → ${r.reason}`)
      .join("\n\n");
    rekapText += `\n\n━━━━━━━━━━━━━━━━━━━━\n❌ *Gagal bergabung:*\n${lines}`;
  }

  // Kalau terlalu panjang → kirim sebagai file
  if (rekapText.length > 4000 || results.length > 20) {
    const fileContent = [
      "=== REKAP BERGABUNG GRUP ===",
      `Total: ${results.length} | Berhasil: ${berhasil.length} | Gagal: ${gagal.length}`,
      "",
      "BERHASIL:",
      ...berhasil.map((r, i) => `${i + 1}. ${r.target}`),
      "",
      "GAGAL:",
      ...gagal.map((r, i) => `${i + 1}. ${r.target}\n   Alasan: ${r.reason}`),
    ].join("\n");

    await ctx.editMessageText(
      `🚪 *Rekap Bergabung Grup*\n\n` +
        `✅ Berhasil: ${berhasil.length}\n` +
        `❌ Gagal: ${gagal.length}\n` +
        `📊 Total: ${results.length}\n\n` +
        `Detail lengkap dikirim sebagai file.`,
      { parse_mode: "Markdown" }
    );
    await ctx.replyWithDocument(
      new InputFile(Buffer.from(fileContent, "utf-8"), "rekap_bergabung.txt"),
      { caption: `📋 Rekap bergabung — ${results.length} grup diproses` }
    );
  } else {
    await ctx.editMessageText(rekapText, { parse_mode: "Markdown" });
  }
});

// ─── Callback: batal ─────────────────────────────────────────────────────────
composer.callbackQuery("join:cancel", async (ctx) => {
  const userId = ctx.from.id;
  joinStates.delete(userId);
  pendingJoin.delete(userId);
  await ctx.editMessageText("❌ Dibatalkan.");
  await ctx.answerCallbackQuery("Dibatalkan.");
});

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseJoinError(msg: string): string {
  if (msg.includes("INVITE_HASH_EXPIRED"))        return "Link undangan sudah kedaluwarsa";
  if (msg.includes("INVITE_HASH_INVALID"))        return "Link undangan tidak valid";
  if (msg.includes("INVITE_REQUEST_SENT"))        return "Permintaan bergabung terkirim (grup butuh approval)";
  if (msg.includes("CHANNEL_PRIVATE"))            return "Grup bersifat private";
  if (msg.includes("USERNAME_INVALID"))           return "Username tidak valid";
  if (msg.includes("USERNAME_NOT_OCCUPIED"))      return "Username tidak ditemukan";
  if (msg.includes("USER_ALREADY_PARTICIPANT"))   return "Akun sudah bergabung";
  if (msg.includes("CHANNELS_TOO_MUCH"))          return "Akun sudah bergabung terlalu banyak grup";
  if (msg.includes("USER_BANNED_IN_CHANNEL"))     return "Akun di-ban dari grup ini";
  if (msg.includes("PEER_ID_INVALID"))            return "Target tidak valid";
  if (msg.includes("FLOOD_WAIT")) {
    const sec = msg.match(/FLOOD_WAIT_(\d+)/)?.[1] || "?";
    return `Rate limit Telegram, tunggu ${sec} detik`;
  }
  // Ambil kode error utama saja
  const match = msg.match(/([A-Z_]{5,})/);
  return match ? match[1] : "Gagal bergabung";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { joinStates };
export default composer;
