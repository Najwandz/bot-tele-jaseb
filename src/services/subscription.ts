import { db, schema } from "../db";
import { eq, and, desc, lte } from "drizzle-orm";

export type ServiceType = "sewa_bot" | "sewa_jasa";

export const SERVICE_LABELS: Record<ServiceType, string> = {
  sewa_bot: "🤖 Sewa Bot",
  sewa_jasa: "🔑 Sewa Jasa",
};

export interface RedeemResult {
  success: boolean;
  message: string;
  mode?: "new" | "extend";
  subscription?: {
    id: number;
    code: string;
    durationDays: number;
    activatedAt: Date;
    expiresAt: Date;
    serviceType?: string | null;
  };
  existingSubscription?: {
    id: number;
    expiresAt: Date;
    serviceType?: string | null;
    durationDays: number;
  };
  pendingCode?: string;
}

// ─── Cek sebelum redeem ───────────────────────────────────────────────────────
export async function checkBeforeRedeem(
  userId: number,
  rawCode: string
): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();

  if (code.length !== 9) {
    return { success: false, message: "Format kode tidak valid (harus 9 karakter)." };
  }

  const codeRows = await db
    .select()
    .from(schema.redeemCodes)
    .where(eq(schema.redeemCodes.code, code))
    .limit(1);
  const codeRow = codeRows[0];

  if (!codeRow) {
    return { success: false, message: "Kode tidak ditemukan." };
  }

  if (codeRow.status === "used") {
    return { success: false, message: "Kode ini sudah pernah dipakai." };
  }

  const now = new Date();
  if (codeRow.status === "expired" || codeRow.expiresAt <= now) {
    if (codeRow.status !== "expired") {
      await db
        .update(schema.redeemCodes)
        .set({ status: "expired" })
        .where(eq(schema.redeemCodes.id, codeRow.id));
    }
    return { success: false, message: "Kode sudah kedaluwarsa." };
  }

  // Cek subscription aktif
  await expireOldSubscriptions(userId);
  const activeSubs = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, "active")
      )
    )
    .orderBy(desc(schema.subscriptions.expiresAt));

  const stillActive = activeSubs.filter((s) => s.expiresAt > now);

  if (stillActive.length > 0) {
    const latest = stillActive[0];
    const newExpiresAt = new Date(
      latest.expiresAt.getTime() + codeRow.durationDays * 24 * 60 * 60 * 1000
    );
    return {
      success: true,
      message: "",
      mode: "extend",
      existingSubscription: {
        id: latest.id,
        expiresAt: latest.expiresAt,
        serviceType: latest.serviceType,
        durationDays: latest.durationDays,
      },
      pendingCode: code,
      subscription: {
        id: 0,
        code,
        durationDays: codeRow.durationDays,
        activatedAt: now,
        expiresAt: newExpiresAt,
      },
    };
  }

  return redeemCode(userId, undefined, rawCode);
}

// ─── Redeem kode baru ─────────────────────────────────────────────────────────
export async function redeemCode(
  userId: number,
  username: string | undefined,
  rawCode: string
): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();

  if (code.length !== 9) {
    return { success: false, message: "Format kode tidak valid (harus 9 karakter)." };
  }

  const codeRows = await db
    .select()
    .from(schema.redeemCodes)
    .where(eq(schema.redeemCodes.code, code))
    .limit(1);
  const codeRow = codeRows[0];

  if (!codeRow) {
    return { success: false, message: "Kode tidak ditemukan." };
  }
  if (codeRow.status === "used") {
    return { success: false, message: "Kode ini sudah pernah dipakai." };
  }

  const now = new Date();
  if (codeRow.status === "expired" || codeRow.expiresAt <= now) {
    if (codeRow.status !== "expired") {
      await db
        .update(schema.redeemCodes)
        .set({ status: "expired" })
        .where(eq(schema.redeemCodes.id, codeRow.id));
    }
    return { success: false, message: "Kode sudah kedaluwarsa." };
  }

  const activatedAt = now;
  const expiresAt = new Date(
    activatedAt.getTime() + codeRow.durationDays * 24 * 60 * 60 * 1000
  );

  await db
    .update(schema.redeemCodes)
    .set({ status: "used", usedBy: userId, usedAt: activatedAt })
    .where(eq(schema.redeemCodes.id, codeRow.id));

  const inserted = await db
    .insert(schema.subscriptions)
    .values({
      userId,
      username,
      codeId: codeRow.id,
      code: codeRow.code,
      durationDays: codeRow.durationDays,
      activatedAt,
      expiresAt,
      status: "active",
      serviceType: "sewa_jasa", // selalu sewa_jasa
    })
    .returning();

  const sub = inserted[0];
  return {
    success: true,
    message: "Kode berhasil di-redeem.",
    mode: "new",
    subscription: {
      id: sub.id,
      code: sub.code,
      durationDays: sub.durationDays,
      activatedAt: sub.activatedAt,
      expiresAt: sub.expiresAt,
      serviceType: sub.serviceType,
    },
  };
}

// ─── Perpanjang subscription aktif ───────────────────────────────────────────
export async function extendSubscription(
  userId: number,
  username: string | undefined,
  rawCode: string
): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();

  const codeRows = await db
    .select()
    .from(schema.redeemCodes)
    .where(eq(schema.redeemCodes.code, code))
    .limit(1);
  const codeRow = codeRows[0];

  if (!codeRow || codeRow.status !== "unused") {
    return { success: false, message: "Kode tidak valid atau sudah dipakai." };
  }

  const now = new Date();
  if (codeRow.expiresAt <= now) {
    return { success: false, message: "Kode sudah kedaluwarsa." };
  }

  await expireOldSubscriptions(userId);
  const activeSubs = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, "active")
      )
    )
    .orderBy(desc(schema.subscriptions.expiresAt));
  const activeSub = activeSubs.filter((s) => s.expiresAt > now)[0];

  const baseTime = activeSub ? activeSub.expiresAt : now;
  const newExpiresAt = new Date(
    baseTime.getTime() + codeRow.durationDays * 24 * 60 * 60 * 1000
  );

  await db
    .update(schema.redeemCodes)
    .set({ status: "used", usedBy: userId, usedAt: now })
    .where(eq(schema.redeemCodes.id, codeRow.id));

  if (activeSub) {
    await db
      .update(schema.subscriptions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(schema.subscriptions.id, activeSub.id));

    return {
      success: true,
      message: "Sesi berhasil diperpanjang.",
      mode: "extend",
      subscription: {
        id: activeSub.id,
        code,
        durationDays: codeRow.durationDays,
        activatedAt: activeSub.activatedAt,
        expiresAt: newExpiresAt,
        serviceType: activeSub.serviceType,
      },
    };
  }

  // Tidak ada aktif → buat baru
  const inserted = await db
    .insert(schema.subscriptions)
    .values({
      userId,
      username,
      codeId: codeRow.id,
      code,
      durationDays: codeRow.durationDays,
      activatedAt: now,
      expiresAt: newExpiresAt,
      status: "active",
      serviceType: "sewa_jasa", // selalu sewa_jasa
    })
    .returning();

  const sub = inserted[0];
  return {
    success: true,
    message: "Kode berhasil di-redeem.",
    mode: "new",
    subscription: {
      id: sub.id,
      code: sub.code,
      durationDays: sub.durationDays,
      activatedAt: sub.activatedAt,
      expiresAt: sub.expiresAt,
      serviceType: sub.serviceType,
    },
  };
}

// ─── Set jenis layanan ────────────────────────────────────────────────────────
export async function setServiceType(
  subscriptionId: number,
  userId: number,
  serviceType: ServiceType
): Promise<boolean> {
  const result = await db
    .update(schema.subscriptions)
    .set({ serviceType })
    .where(
      and(
        eq(schema.subscriptions.id, subscriptionId),
        eq(schema.subscriptions.userId, userId)
      )
    )
    .returning();
  return result.length > 0;
}

// ─── Ambil subscription aktif ─────────────────────────────────────────────────
export async function getActiveSubscriptions(userId: number) {
  const now = new Date();
  await expireOldSubscriptions(userId);
  const subs = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, "active")
      )
    )
    .orderBy(desc(schema.subscriptions.activatedAt));
  return subs.filter((s) => s.expiresAt > now);
}

// ─── Auto-expire subscription ─────────────────────────────────────────────────
export async function expireOldSubscriptions(userId?: number): Promise<number> {
  const now = new Date();
  // Bulk update: set semua active yang sudah expiresAt <= now jadi 'expired'
  const baseCondition = userId
    ? and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, "active"),
        lte(schema.subscriptions.expiresAt, now)
      )
    : and(
        eq(schema.subscriptions.status, "active"),
        lte(schema.subscriptions.expiresAt, now)
      );

  const result = await db
    .update(schema.subscriptions)
    .set({ status: "expired" })
    .where(baseCondition)
    .returning();

  return result.length;
}

// ─── Format sisa waktu ────────────────────────────────────────────────────────
export function formatRemaining(expiresAt: Date): string {
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return "expired";

  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) return `${days} hari ${hours} jam`;
  return `${hours} jam`;
}
