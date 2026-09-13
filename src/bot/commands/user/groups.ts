import { Composer, Context, InlineKeyboard, InputFile } from "grammy";
import { scanGroups, hasSession, getActiveAccount, GroupInfo } from "../../../services/gramjs";
import {
  getUserGroupLists,
  getGroupListItems,
  createGroupList,
  deleteGroupList,
} from "../../../services/groupList";

const composer = new Composer();

// ─── State in-memory untuk flow "Buat List Grup" ─────────────────────────────
interface CreateListState {
  step: "waiting_name" | "waiting_numbers";
  scannedGroups?: GroupInfo[];
  listName?: string;
}
const createListStates = new Map<number, CreateListState>();

// ─── State in-memory untuk cache hasil scan ───────────────────────────────────
// Supaya user tidak perlu scan ulang saat memilih nomor
const scanCache = new Map<number, GroupInfo[]>();

// ─── Helper: format daftar grup bernomor ─────────────────────────────────────
// Escape karakter Markdown yang bisa merusak parsing
function escapeMd(text: string): string {
  return text.replace(/[_*`[\]()~>#+=|{}.!\\-]/g, "\\$&");
}

function formatGroupList(groups: GroupInfo[], start = 0): string {
  const typeIcon = (t: GroupInfo["type"]) =>
    t === "group" ? "👥" : t === "supergroup" ? "🏘️" : "📢";

  return groups
    .map(
      (g, i) =>
        `${start + i + 1}. ${typeIcon(g.type)} ${escapeMd(g.title)}` +
        (g.memberCount ? ` _(${g.memberCount.toLocaleString("id-ID")} anggota)_` : "") +
        `\n   ID: \`${g.id}\``
    )
    .join("\n");
}

// ─── SCAN GRUP ────────────────────────────────────────────────────────────────
async function handleScanGrup(ctx: Context) {
  const userId = ctx.from!.id;

  if (!(await hasSession(userId))) {
    await ctx.reply(
      "❌ Akun belum terhubung.\n\nGunakan /login untuk menghubungkan akun Telegram Anda."
    );
    return;
  }

  const loadingMsg = await ctx.reply("⏳ *Sedang memindai grup...*\n\nMohon tunggu.", {
    parse_mode: "Markdown",
  });

  const active = await getActiveAccount(userId);
  const accountLabel = active ? active.label : "tidak diketahui";

  const groups = await scanGroups(userId);
  await ctx.api.deleteMessage(ctx.chat?.id ?? 0, loadingMsg.message_id).catch(() => {});

  if (!groups) {
    await ctx.reply(
      "❌ Gagal memindai grup. Session mungkin tidak valid.\n\nCoba /login ulang."
    );
    return;
  }

  if (groups.length === 0) {
    await ctx.reply("📭 Tidak ada grup ditemukan di akun Anda.");
    return;
  }

  // Simpan ke cache
  scanCache.set(userId, groups);

  const display = groups.slice(0, 50);
  const body = formatGroupList(display);
  const footer = groups.length > 50
    ? `\n\n_...dan ${groups.length - 50} grup lainnya (kirim sebagai file)_`
    : "";

  const fullText =
    `📡 *Hasil Scan Grup*\n` +
    `Akun: ${escapeMd(accountLabel)}\n` +
    `Ditemukan *${groups.length}* grup/channel\n\n` +
    body + footer;

  const keyboard = new InlineKeyboard()
    .text("📋 Buat List dari Hasil Ini", "grp:make_list_from_scan")
    .row()
    .text("💾 Unduh Semua (File)", "grp:download_scan");

  if (fullText.length > 4000) {
    // Kirim sebagai file + ringkasan
    await sendGroupsAsFile(ctx, groups);
    await ctx.reply(
      `📡 *Hasil Scan Grup*\nDitemukan *${groups.length}* grup/channel\n\n` +
        `Daftar lengkap dikirim sebagai file di atas.`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  } else {
    await ctx.reply(fullText, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
}

// ─── BUAT LIST GRUP ───────────────────────────────────────────────────────────
async function handleBuatListGrup(ctx: Context) {
  const userId = ctx.from!.id;

  if (!(await hasSession(userId))) {
    await ctx.reply(
      "❌ Akun belum terhubung.\n\nGunakan /login untuk menghubungkan akun Telegram Anda."
    );
    return;
  }

  // Cek apakah ada cache scan
  const cached = scanCache.get(userId);
  if (!cached) {
    await ctx.reply(
      "⚠️ Belum ada hasil scan.\n\nTap *Scan Grup* terlebih dahulu untuk memindai grup Anda.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  createListStates.set(userId, {
    step: "waiting_name",
    scannedGroups: cached,
  });

  await ctx.reply(
    "📝 *Buat List Grup Baru*\n\n" +
      "Langkah 1/2: Beri nama untuk list ini.\n\n" +
      "Contoh: `Promo Harian`, `Grup Jualan`, `Target Sebar`\n\n" +
      "Ketik nama list:",
    { parse_mode: "Markdown" }
  );
}

// ─── LIST GRUP (tampilkan semua list milik user) ──────────────────────────────
async function handleListGrup(ctx: Context) {
  const userId = ctx.from!.id;
  const lists = await getUserGroupLists(userId);

  const active = await getActiveAccount(userId);
  const accountLabel = active ? active.label : "tidak diketahui";

  if (lists.length === 0) {
    await ctx.reply(
      `📭 *Belum ada List Grup*\n\n` +
        `Akun: *${accountLabel}*\n\n` +
        `Tap *Buat List Grup* untuk membuat list baru.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  lists.forEach((l) => {
    keyboard.text(`📋 ${l.name} (${l.itemCount} grup)`, `grp:view:${l.id}`).row();
  });

  await ctx.reply(
    `📋 *Daftar List Grup*\n` +
      `Akun: *${accountLabel}*\n` +
      `Total: ${lists.length} list\n\n` +
      lists
        .map((l, i) => `${i + 1}. *${l.name}* — ${l.itemCount} grup`)
        .join("\n"),
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

// ─── Handler pesan teks untuk flow buat list ─────────────────────────────────
composer.on("message:text", async (ctx, next) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  if (text.startsWith("/")) return next();

  const state = createListStates.get(userId);
  if (!state) return next();

  // ── Step 1: terima nama list ──
  if (state.step === "waiting_name") {
    if (text.length < 2 || text.length > 50) {
      await ctx.reply("⚠️ Nama list harus 2-50 karakter. Coba lagi:");
      return;
    }

    state.listName = text;
    state.step = "waiting_numbers";
    createListStates.set(userId, state);

    const groups = state.scannedGroups!;
    const display = groups.slice(0, 80);
    const body = formatGroupList(display);
    const footer = groups.length > 80
      ? `\n\n_...dan ${groups.length - 80} lainnya_`
      : "";

    await ctx.reply(
      `✅ Nama list: *${text}*\n\n` +
        `Langkah 2/2: Pilih grup yang ingin dimasukkan ke list ini.\n\n` +
        `Ketik nomor grup yang diinginkan, pisahkan dengan spasi.\n` +
        `Contoh: \`1 3 5 7 12\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        body + footer,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("✅ Tambahkan Semua", "grp:add_all")
          .row()
          .text("❌ Batal", "grp:cancel_create"),
      }
    );
    return;
  }

  // ── Step 2: terima nomor-nomor grup ──
  if (state.step === "waiting_numbers") {
    const numbers = text
      .split(/[\s,]+/)
      .map((n) => parseInt(n.trim()))
      .filter((n) => !isNaN(n) && n > 0);

    if (numbers.length === 0) {
      await ctx.reply(
        "⚠️ Format tidak valid. Ketik nomor grup dipisah spasi.\nContoh: `1 3 5 7`",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const groups = state.scannedGroups!;
    const selected: GroupInfo[] = [];
    const invalid: number[] = [];

    for (const n of numbers) {
      if (n <= groups.length) {
        selected.push(groups[n - 1]);
      } else {
        invalid.push(n);
      }
    }

    if (selected.length === 0) {
      await ctx.reply(
        `⚠️ Nomor tidak valid. Pilih antara 1-${groups.length}.`
      );
      return;
    }

    // Hapus duplikat
    const unique = selected.filter(
      (g, i, arr) => arr.findIndex((x) => x.id === g.id) === i
    );

    // Konfirmasi sebelum simpan
    const preview = unique
      .slice(0, 10)
      .map((g, i) => `${i + 1}. ${g.title}`)
      .join("\n");
    const more = unique.length > 10 ? `\n_...dan ${unique.length - 10} lainnya_` : "";
    const invalidNote =
      invalid.length > 0
        ? `\n\n⚠️ Nomor tidak valid diabaikan: ${invalid.join(", ")}`
        : "";

    const confirmMenu = new InlineKeyboard()
      .text("✅ Simpan List", `grp:confirm_create:${unique.length}`)
      .row()
      .text("❌ Batal", "grp:cancel_create");

    // Simpan sementara di state
    state.scannedGroups = unique; // reuse field untuk selected groups
    createListStates.set(userId, state);

    await ctx.reply(
      `📋 *Konfirmasi List Grup*\n\n` +
        `Nama: *${state.listName}*\n` +
        `Jumlah grup: *${unique.length}*\n\n` +
        preview + more + invalidNote + `\n\nSimpan list ini?`,
      { parse_mode: "Markdown", reply_markup: confirmMenu }
    );
    return;
  }

  return next();
});

// ─── Callback: tambahkan semua grup ──────────────────────────────────────────
composer.callbackQuery("grp:add_all", async (ctx) => {
  const userId = ctx.from.id;
  const state = createListStates.get(userId);

  if (!state || !state.listName || !state.scannedGroups) {
    await ctx.editMessageText("⚠️ Sesi pembuatan list sudah habis. Coba lagi.");
    await ctx.answerCallbackQuery();
    return;
  }

  const all = state.scannedGroups;

  // Simpan semua grup ke state (reuse field scannedGroups)
  state.scannedGroups = all;
  createListStates.set(userId, state);

  const confirmMenu = new InlineKeyboard()
    .text("✅ Simpan List", `grp:confirm_create:${all.length}`)
    .row()
    .text("❌ Batal", "grp:cancel_create");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `📋 *Konfirmasi List Grup*\n\n` +
      `Nama: *${state.listName}*\n` +
      `Jumlah grup: *${all.length}* (semua grup)\n\n` +
      `Semua grup akan dimasukkan ke list ini.\n` +
      `Simpan?`,
    { parse_mode: "Markdown", reply_markup: confirmMenu }
  );
});

// ─── Callback: konfirmasi simpan list ────────────────────────────────────────
composer.callbackQuery(/^grp:confirm_create:(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const state = createListStates.get(userId);

  if (!state || !state.listName || !state.scannedGroups) {
    await ctx.editMessageText("⚠️ Sesi pembuatan list sudah habis. Coba lagi.");
    await ctx.answerCallbackQuery();
    return;
  }

  const listId = await createGroupList(userId, state.listName, state.scannedGroups);
  createListStates.delete(userId);
  scanCache.delete(userId);

  await ctx.answerCallbackQuery("List berhasil disimpan!");
  await ctx.editMessageText(
    `✅ *List Grup Berhasil Dibuat!*\n\n` +
      `Nama: *${state.listName}*\n` +
      `Jumlah grup: ${state.scannedGroups.length}\n` +
      `ID List: #${listId}\n\n` +
      `Gunakan tombol *List Grup* untuk melihat semua list Anda.`,
    { parse_mode: "Markdown" }
  );
});

// ─── Callback: batal buat list ────────────────────────────────────────────────
composer.callbackQuery("grp:cancel_create", async (ctx) => {
  const userId = ctx.from.id;
  createListStates.delete(userId);
  await ctx.editMessageText("❌ Pembuatan list dibatalkan.");
  await ctx.answerCallbackQuery("Dibatalkan.");
});

// ─── Callback: buat list dari hasil scan ─────────────────────────────────────
composer.callbackQuery("grp:make_list_from_scan", async (ctx) => {
  await ctx.answerCallbackQuery();
  await handleBuatListGrup(ctx);
});

// ─── Callback: download scan sebagai file ────────────────────────────────────
composer.callbackQuery("grp:download_scan", async (ctx) => {
  const userId = ctx.from.id;
  const groups = scanCache.get(userId);

  if (!groups) {
    await ctx.answerCallbackQuery("Cache scan sudah habis. Scan ulang.");
    return;
  }

  await ctx.answerCallbackQuery();
  await sendGroupsAsFile(ctx, groups);
});

// ─── Callback: lihat detail list ─────────────────────────────────────────────
composer.callbackQuery(/^grp:view:(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const listId = parseInt(ctx.match![1]);

  const result = await getGroupListItems(listId, userId);
  if (!result) {
    await ctx.answerCallbackQuery("List tidak ditemukan.");
    return;
  }

  const { list, items } = result;
  const typeIcon = (t: string) =>
    t === "group" ? "👥" : t === "supergroup" ? "🏘️" : "📢";

  const lines = items
    .slice(0, 50)
    .map((item, i) => `${i + 1}. ${typeIcon(item.type)} ${item.title}`);

  const footer = items.length > 50 ? `\n_...dan ${items.length - 50} lainnya_` : "";

  const keyboard = new InlineKeyboard()
    .text("🗑 Hapus List Ini", `grp:delete:${listId}`)
    .row()
    .text("🔙 Kembali", "grp:back_to_lists");

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `📋 *${list.name}*\n` +
      `Total: ${items.length} grup\n\n` +
      lines.join("\n") + footer,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

// ─── Callback: hapus list ─────────────────────────────────────────────────────
composer.callbackQuery(/^grp:delete:(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const listId = parseInt(ctx.match![1]);

  const confirmMenu = new InlineKeyboard()
    .text("✅ Ya, Hapus", `grp:confirm_delete:${listId}`)
    .row()
    .text("❌ Batal", `grp:view:${listId}`);

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "⚠️ *Hapus List Grup?*\n\nList yang dihapus tidak dapat dipulihkan.",
    { parse_mode: "Markdown", reply_markup: confirmMenu }
  );
});

composer.callbackQuery(/^grp:confirm_delete:(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const listId = parseInt(ctx.match![1]);

  const ok = await deleteGroupList(listId, userId);
  await ctx.answerCallbackQuery(ok ? "List dihapus." : "Gagal menghapus.");
  await ctx.editMessageText(
    ok
      ? "✅ List grup berhasil dihapus."
      : "❌ Gagal menghapus list."
  );
});

// ─── Callback: kembali ke daftar list ────────────────────────────────────────
composer.callbackQuery("grp:back_to_lists", async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCallbackQuery();
  await handleListGrup(ctx);
});

// ─── Helper: kirim grup sebagai file teks ────────────────────────────────────
async function sendGroupsAsFile(ctx: Context, groups: GroupInfo[]) {
  const content = groups
    .map(
      (g, i) =>
        `${i + 1}. [${g.type.toUpperCase()}] ${g.title}` +
        (g.memberCount ? ` - ${g.memberCount} anggota` : "") +
        ` (ID: ${g.id})`
    )
    .join("\n");

  await ctx.replyWithDocument(
    new InputFile(Buffer.from(content, "utf-8"), "daftar_grup.txt"),
    {
      caption: `📡 Daftar Grup — Total: ${groups.length}`,
    }
  );
}

// ─── Export handler untuk dipanggil dari /start reply keyboard ───────────────
export { handleScanGrup, handleBuatListGrup, handleListGrup };
export default composer;
