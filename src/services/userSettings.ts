import { db, schema } from "../db";
import { eq } from "drizzle-orm";

export type DelayMode = "per_group" | "per_round";

export interface DelaySettings {
  mode: DelayMode;
  // Untuk mode per_group: jeda antar grup (detik)
  seconds?: number;
  // Untuk mode per_round: jeda antar putaran (menit) — disimpan di broadcastRoundDelayMinutes
  // delayMin/delayMax tidak dipakai lagi, tapi tetap ada di DB untuk kompatibilitas
  min?: number;
  max?: number;
}

export interface NotifySettings {
  enabled: boolean;
  targets: ("admin" | "self")[];
}

// ─── Delay settings ───────────────────────────────────────────────────────────

export async function getUserSettings(userId: number): Promise<DelaySettings | null> {
  const rows = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.delayMode) return null;

  if (row.delayMode === "per_group" || row.delayMode === "global") {
    return { mode: "per_group", seconds: row.delaySeconds ?? 10 };
  }
  // per_round (atau legacy "safe")
  return { mode: "per_round", seconds: row.delaySeconds ?? 10 };
}

export async function hasDelaySettings(userId: number): Promise<boolean> {
  return (await getUserSettings(userId)) !== null;
}

// Jeda per grup (detik) — antar pengiriman ke setiap grup
export async function setPerGroupDelay(userId: number, seconds: number): Promise<void> {
  await upsertSettings(userId, {
    delayMode: "per_group",
    delaySeconds: seconds,
    delayMin: null,
    delayMax: null,
  });
}

// Jeda per semua grup (menit) — jeda setelah 1 putaran selesai
// Disimpan di delaySeconds (dalam detik) untuk kompatibilitas
export async function setPerRoundDelay(userId: number, minutes: number): Promise<void> {
  await upsertSettings(userId, {
    delayMode: "per_round",
    delaySeconds: minutes * 60, // simpan dalam detik
    delayMin: null,
    delayMax: null,
  });
}

// Legacy aliases (masih dipakai di beberapa tempat)
export async function setGlobalDelay(userId: number, seconds: number): Promise<void> {
  return setPerGroupDelay(userId, seconds);
}

export async function setSafeDelay(userId: number, min: number, max: number): Promise<void> {
  // Konversi: ambil nilai tengah sebagai jeda per round dalam menit
  return setPerRoundDelay(userId, Math.round((min + max) / 2));
}

async function upsertSettings(
  userId: number,
  values: {
    delayMode: DelayMode;
    delaySeconds: number | null;
    delayMin: number | null;
    delayMax: number | null;
  }
) {
  const now = new Date();
  const existing = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.userSettings)
      .set({ ...values, updatedAt: now })
      .where(eq(schema.userSettings.userId, userId));
  } else {
    await db.insert(schema.userSettings).values({ userId, ...values, updatedAt: now });
  }
}

export function calculateDelay(settings: DelaySettings): number {
  // Selalu pakai seconds (sudah dalam detik untuk kedua mode)
  return (settings.seconds ?? 10) * 1000;
}

export function formatDelaySettings(settings: DelaySettings): string {
  if (settings.mode === "per_group") {
    return `⏱ Jeda Per Grup (${settings.seconds} detik)`;
  }
  const minutes = Math.round((settings.seconds ?? 600) / 60);
  return `⏰ Jeda Per Semua Grup (${minutes} menit)`;
}

// Ambil jeda per grup dalam detik (untuk broadcast loop)
export async function getPerGroupDelaySeconds(userId: number): Promise<number> {
  const s = await getUserSettings(userId);
  if (!s || s.mode !== "per_group") return 10;
  return s.seconds ?? 10;
}

// Ambil jeda per putaran dalam menit (untuk broadcast loop)
export async function getPerRoundDelayMinutes(userId: number): Promise<number> {
  const rows = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row || row.delayMode !== "per_round") return 10;
  return Math.round((row.delaySeconds ?? 600) / 60);
}

// ─── Notify settings ──────────────────────────────────────────────────────────

export async function getNotifySettings(userId: number): Promise<NotifySettings> {
  const rows = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return { enabled: false, targets: [] };

  let rawTargets: any[] = [];
  try {
    rawTargets = JSON.parse(row.notifyTargets ?? "[]");
  } catch {
    rawTargets = [];
  }

  // Convert legacy number arrays or validate targets
  const targets: ("admin" | "self")[] = [];
  for (const t of rawTargets) {
    if (t === "admin" || t === "self") {
      if (!targets.includes(t)) targets.push(t);
    } else if (typeof t === "number") {
      // Legacy data support
      if (t === userId) {
        if (!targets.includes("self")) targets.push("self");
      } else {
        if (!targets.includes("admin")) targets.push("admin");
      }
    }
  }

  return { enabled: (row.notifyEnabled ?? 0) === 1, targets };
}

export async function setNotifyEnabled(userId: number, enabled: boolean): Promise<void> {
  await upsertNotify(userId, { notifyEnabled: enabled ? 1 : 0 });
}

export async function toggleNotifyTarget(userId: number, target: "admin" | "self"): Promise<void> {
  const current = await getNotifySettings(userId);
  let newTargets = [...current.targets];
  if (newTargets.includes(target)) {
    newTargets = newTargets.filter((t) => t !== target);
  } else {
    newTargets.push(target);
  }
  await upsertNotify(userId, { notifyTargets: JSON.stringify(newTargets) });
}

async function upsertNotify(
  userId: number,
  values: Partial<{ notifyEnabled: number; notifyTargets: string }>
) {
  const now = new Date();
  const existing = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.userSettings)
      .set({ ...values, updatedAt: now })
      .where(eq(schema.userSettings.userId, userId));
  } else {
    await db.insert(schema.userSettings).values({
      userId,
      notifyEnabled: values.notifyEnabled ?? 0,
      notifyTargets: values.notifyTargets ?? "[]",
      updatedAt: now,
    });
  }
}

// ─── Broadcast state ──────────────────────────────────────────────────────────

export interface BroadcastState {
  running: boolean;
  listId: number | null;
  message: string | null;
  startedAt: Date | null;
  round: number;
  roundDelayMinutes: number | null;
}

export async function getBroadcastState(userId: number): Promise<BroadcastState> {
  const rows = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return { running: false, listId: null, message: null, startedAt: null, round: 0, roundDelayMinutes: null };
  }

  return {
    running: (row.broadcastRunning ?? 0) === 1,
    listId: row.broadcastListId ?? null,
    message: row.broadcastMessage ?? null,
    startedAt: row.broadcastStartedAt ?? null,
    round: row.broadcastRound ?? 0,
    roundDelayMinutes: row.broadcastRoundDelayMinutes ?? null,
  };
}

export async function setBroadcastRunning(
  userId: number,
  listId: number,
  message: string,
  roundDelayMinutes: number
): Promise<void> {
  await upsertBroadcast(userId, {
    broadcastRunning: 1,
    broadcastListId: listId,
    broadcastMessage: message,
    broadcastStartedAt: new Date(),
    broadcastRound: 1,
    broadcastRoundDelayMinutes: roundDelayMinutes,
  });
}

export async function incrementBroadcastRound(userId: number): Promise<void> {
  const current = await getBroadcastState(userId);
  await upsertBroadcast(userId, {
    broadcastRound: current.round + 1,
  });
}

export async function stopBroadcastState(userId: number): Promise<void> {
  await upsertBroadcast(userId, {
    broadcastRunning: 0,
    broadcastListId: null,
    broadcastMessage: null,
    broadcastStartedAt: null,
    broadcastRound: 0,
    broadcastRoundDelayMinutes: null,
  });
}

async function upsertBroadcast(
  userId: number,
  values: Partial<{
    broadcastRunning: number;
    broadcastListId: number | null;
    broadcastMessage: string | null;
    broadcastStartedAt: Date | null;
    broadcastRound: number;
    broadcastRoundDelayMinutes: number | null;
  }>
) {
  const now = new Date();
  const existing = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.userSettings)
      .set({ ...values, updatedAt: now })
      .where(eq(schema.userSettings.userId, userId));
  } else {
    await db.insert(schema.userSettings).values({
      userId,
      broadcastRunning: values.broadcastRunning ?? 0,
      broadcastListId: values.broadcastListId ?? null,
      broadcastMessage: values.broadcastMessage ?? null,
      broadcastStartedAt: values.broadcastStartedAt ?? null,
      broadcastRound: values.broadcastRound ?? 0,
      broadcastRoundDelayMinutes: values.broadcastRoundDelayMinutes ?? null,
      updatedAt: now,
    });
  }
}

/**
 * Ambil semua user yang broadcast_running = 1
 * Dipakai saat bot restart untuk melanjutkan broadcast yang tertunda
 */
export async function getAllRunningBroadcasts(): Promise<number[]> {
  const rows = await db
    .select({ userId: schema.userSettings.userId })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.broadcastRunning, 1));

  return rows.map((r) => r.userId);
}
