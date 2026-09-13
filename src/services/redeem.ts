import { db, schema } from "../db";
import { eq, desc } from "drizzle-orm";
import { customAlphabet } from "nanoid";

// Generator kode 9 digit (uppercase alfanumerik, tanpa karakter ambigu)
const generateCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 9);

// Mapping durasi ke harga jual (Rupiah)
export const DURATION_PRICES: Record<number, number> = {
  1: 3000,
  4: 10000,
  7: 16000,
  15: 30000,
  30: 50000,
};

export type DurationDays = keyof typeof DURATION_PRICES;

export function formatPrice(price: number): string {
  return "Rp" + price.toLocaleString("id-ID");
}

interface GenerateCodeParams {
  durationDays: number;
  expiresInDays: number;
  createdBy: number;
  quantity?: number;
}

interface GenerateResult {
  codes: string[];
  expiresAt: Date;
  durationDays: number;
  price: number;
}

/**
 * Generate kode redeem baru
 */
export async function generateRedeemCodes(
  params: GenerateCodeParams
): Promise<GenerateResult> {
  const { durationDays, expiresInDays, createdBy, quantity = 1 } = params;

  const price = DURATION_PRICES[durationDays];
  if (price === undefined) {
    throw new Error(`Durasi ${durationDays} hari tidak valid`);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

  const codes: string[] = [];
  for (let i = 0; i < quantity; i++) {
    codes.push(generateCode());
  }

  // Bulk insert
  await db.insert(schema.redeemCodes).values(
    codes.map((code) => ({
      code,
      durationDays,
      price,
      createdAt: now,
      expiresAt,
      createdBy,
      status: "unused" as const,
    }))
  );

  return { codes, expiresAt, durationDays, price };
}

/**
 * Ambil semua kode redeem dengan filter status
 */
export async function getRedeemCodes(
  filter?: "unused" | "used" | "expired" | "all"
) {
  if (!filter || filter === "all") {
    return await db
      .select()
      .from(schema.redeemCodes)
      .orderBy(desc(schema.redeemCodes.createdAt));
  }

  return await db
    .select()
    .from(schema.redeemCodes)
    .where(eq(schema.redeemCodes.status, filter))
    .orderBy(desc(schema.redeemCodes.createdAt));
}

/**
 * Cek dan update kode yang sudah expired
 */
export async function checkAndExpireCodes(): Promise<number> {
  const now = new Date();
  const unusedCodes = await db
    .select()
    .from(schema.redeemCodes)
    .where(eq(schema.redeemCodes.status, "unused"));

  let expiredCount = 0;
  for (const code of unusedCodes) {
    if (code.expiresAt <= now) {
      await db
        .update(schema.redeemCodes)
        .set({ status: "expired" })
        .where(eq(schema.redeemCodes.id, code.id));
      expiredCount++;
    }
  }
  return expiredCount;
}

/**
 * Statistik kode redeem
 */
export async function getCodeStats() {
  const all = await db.select().from(schema.redeemCodes);
  return {
    total: all.length,
    unused: all.filter((c) => c.status === "unused").length,
    used: all.filter((c) => c.status === "used").length,
    expired: all.filter((c) => c.status === "expired").length,
  };
}
