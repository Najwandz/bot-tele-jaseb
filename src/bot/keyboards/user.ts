import { InlineKeyboard } from "grammy";

/**
 * Tombol setelah redeem berhasil — langsung arahkan ke login.
 */
export function afterRedeemMenu() {
  return new InlineKeyboard()
    .text("🔑 Login Sekarang", "sj:trigger_login")
    .row()
    .text("📊 Status Saya", "user:status");
}

/**
 * Dashboard Userbot setelah login berhasil.
 */
export function sewaJasaDashboard() {
  return new InlineKeyboard()
    .text("📡 Scan Grup", "sj:scan_groups")
    .row()
    .text("🔌 Logout Akun", "sj:logout")
    .row()
    .text("📊 Status Layanan", "sj:status");
}

/**
 * Tombol batal saat proses login.
 */
export function cancelLoginMenu() {
  return new InlineKeyboard().text("❌ Batal Login", "sj:cancel_login");
}

/**
 * Reply keyboard untuk minta user bagikan nomor HP.
 */
export function requestContactKeyboard() {
  return {
    keyboard: [[{ text: "📱 Bagikan Nomor HP Saya", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

/**
 * Hapus reply keyboard setelah kontak diterima.
 */
export function removeKeyboard() {
  return { remove_keyboard: true as const };
}

/**
 * Tombol setelah scan grup selesai.
 */
export function afterScanMenu() {
  return new InlineKeyboard()
    .text("🔄 Scan Ulang", "sj:scan_groups")
    .row()
    .text("🏠 Dashboard", "sj:dashboard");
}
