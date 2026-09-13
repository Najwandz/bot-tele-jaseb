import { Context, NextFunction } from "grammy";
import { config } from "../../config";

/**
 * Middleware untuk cek apakah user adalah admin
 */
export function adminOnly(ctx: Context, next: NextFunction) {
  const userId = ctx.from?.id;

  if (!userId || !config.adminIds.includes(userId)) {
    return ctx.reply("⛔ Akses ditolak. Anda bukan admin.");
  }

  return next();
}

/**
 * Helper: cek apakah user ID termasuk admin
 */
export function isAdmin(userId: number): boolean {
  return config.adminIds.includes(userId);
}
