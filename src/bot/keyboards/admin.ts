import { InlineKeyboard } from "grammy";

/**
 * Menu utama admin
 */
export function adminMainMenu() {
  return new InlineKeyboard()
    .text("📋 List Kode Redeem", "admin:listcodes")
    .row()
    .text("📊 Statistik", "admin:stats");
}

/**
 * Pilihan durasi layanan beserta harga jualnya
 */
export function durationMenu() {
  return new InlineKeyboard()
    .text("1 Hari · Rp3.000", "gen:dur:1")
    .row()
    .text("4 Hari · Rp10.000", "gen:dur:4")
    .row()
    .text("7 Hari · Rp16.000", "gen:dur:7")
    .row()
    .text("15 Hari · Rp30.000", "gen:dur:15")
    .row()
    .text("30 Hari · Rp50.000", "gen:dur:30")
    .row()
    .text("❌ Batal", "admin:cancel");
}

/**
 * Pilihan masa berlaku kode (sebelum dipakai)
 */
export function expiryMenu() {
  return new InlineKeyboard()
    .text("7 Hari", "gen:exp:7")
    .text("14 Hari", "gen:exp:14")
    .text("30 Hari", "gen:exp:30")
    .row()
    .text("60 Hari", "gen:exp:60")
    .text("90 Hari", "gen:exp:90")
    .row()
    .text("❌ Batal", "admin:cancel");
}

/**
 * Pilihan jumlah kode
 */
export function quantityMenu() {
  return new InlineKeyboard()
    .text("1", "gen:qty:1")
    .text("5", "gen:qty:5")
    .text("10", "gen:qty:10")
    .row()
    .text("25", "gen:qty:25")
    .text("50", "gen:qty:50")
    .row()
    .text("❌ Batal", "admin:cancel");
}

/**
 * Filter list kode
 */
export function listFilterMenu() {
  return new InlineKeyboard()
    .text("📋 Semua", "list:filter:all")
    .row()
    .text("🟢 Belum Dipakai", "list:filter:unused")
    .text("🔴 Sudah Dipakai", "list:filter:used")
    .row()
    .text("⚫ Expired", "list:filter:expired")
    .row()
    .text("🔙 Kembali", "admin:menu");
}
