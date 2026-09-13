import { pgTable, serial, text, integer, bigint, timestamp, index } from "drizzle-orm/pg-core";

export const redeemCodes = pgTable("redeem_codes", {
  id: serial("id").primaryKey(),
  // Kode redeem 9 digit (huruf + angka uppercase)
  code: text("code").notNull().unique(),
  // Durasi layanan dalam hari (1, 4, 7, 15, 30)
  durationDays: integer("duration_days").notNull(),
  // Harga jual kode dalam Rupiah
  price: integer("price").notNull(),
  // Status kode
  status: text("status", { enum: ["unused", "used", "expired"] })
    .notNull()
    .default("unused"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: false }).notNull(),
  // User yang memakai kode (Telegram user ID)
  usedBy: bigint("used_by", { mode: "number" }),
  usedAt: timestamp("used_at", { mode: "date", withTimezone: false }),
  // Admin yang membuat kode (Telegram user ID)
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
});

/**
 * Subscription = masa aktif user setelah redeem kode.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    username: text("username"),
    codeId: integer("code_id")
      .notNull()
      .references(() => redeemCodes.id),
    code: text("code").notNull(),
    serviceType: text("service_type", { enum: ["sewa_bot", "sewa_jasa"] }),
    durationDays: integer("duration_days").notNull(),
    activatedAt: timestamp("activated_at", { mode: "date", withTimezone: false })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: false }).notNull(),
    status: text("status", { enum: ["active", "expired"] })
      .notNull()
      .default("active"),
  },
  (table) => ({
    userIdx: index("idx_sub_user").on(table.userId),
    statusIdx: index("idx_sub_status").on(table.status),
  })
);

/**
 * Session GramJS user. Satu user bot bisa punya banyak akun (multi-account).
 * Setiap akun punya broadcast state sendiri (independen).
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    phone: text("phone").notNull(),
    sessionString: text("session_string").notNull(),
    label: text("label"),
    isActive: integer("is_active").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { mode: "date", withTimezone: false })
      .notNull()
      .defaultNow(),
    // ─── Broadcast state per akun ─────────────────────────────────────────
    broadcastRunning: integer("broadcast_running").notNull().default(0),
    broadcastListId: integer("broadcast_list_id"),
    broadcastMessage: text("broadcast_message"),
    broadcastStartedAt: timestamp("broadcast_started_at", { mode: "date", withTimezone: false }),
    broadcastRound: integer("broadcast_round").notNull().default(0),
    broadcastRoundDelayMinutes: integer("broadcast_round_delay_minutes"),
  },
  (table) => ({
    userIdx: index("idx_us_user").on(table.userId),
  })
);

/**
 * List grup buatan user — dipisah per akun.
 */
export const groupLists = pgTable(
  "group_lists",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    // ID akun (user_sessions.id) yang membuat list ini
    accountId: integer("account_id"),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: false })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_gl_user").on(table.userId),
    accountIdx: index("idx_gl_account").on(table.accountId),
  })
);

/**
 * Item dalam group_list.
 */
export const groupListItems = pgTable(
  "group_list_items",
  {
    id: serial("id").primaryKey(),
    listId: integer("list_id")
      .notNull()
      .references(() => groupLists.id),
    chatId: text("chat_id").notNull(),
    title: text("title").notNull(),
    type: text("type", { enum: ["group", "supergroup", "channel"] }).notNull(),
  },
  (table) => ({
    listIdx: index("idx_gli_list").on(table.listId),
  })
);

/**
 * Pengaturan per user.
 */
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().unique(),
  // Jeda per grup (detik)
  delayMode: text("delay_mode", { enum: ["global", "safe", "per_group", "per_round"] }),
  delaySeconds: integer("delay_seconds"),
  delayMin: integer("delay_min"),
  delayMax: integer("delay_max"),
  // Notifikasi broadcast
  notifyEnabled: integer("notify_enabled").notNull().default(0),
  notifyTargets: text("notify_targets").default("[]"),
  // ─── Broadcast state (persisten agar tidak hilang saat bot restart) ───────
  // Apakah broadcast sedang berjalan
  broadcastRunning: integer("broadcast_running").notNull().default(0),
  // ID list grup yang sedang di-broadcast
  broadcastListId: integer("broadcast_list_id"),
  // Pesan yang sedang di-broadcast (JSON string untuk support media nanti)
  broadcastMessage: text("broadcast_message"),
  // Kapan broadcast dimulai
  broadcastStartedAt: timestamp("broadcast_started_at", { mode: "date", withTimezone: false }),
  // Putaran ke berapa saat ini
  broadcastRound: integer("broadcast_round").notNull().default(0),
  // Jeda antar putaran dalam menit
  broadcastRoundDelayMinutes: integer("broadcast_round_delay_minutes"),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false })
    .notNull()
    .defaultNow(),
});

/**
 * Akses remote yang diberikan oleh Owner ke User (Telegram ID) lain.
 */
export const remoteAccessGrants = pgTable("remote_access_grants", {
  id: serial("id").primaryKey(),
  ownerId: bigint("owner_id", { mode: "number" }).notNull(),
  granteeId: bigint("grantee_id", { mode: "number" }).notNull(),
  accountId: integer("account_id").notNull().references(() => userSessions.id),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: false }).defaultNow().notNull(),
});

/**
 * Akun remote yang sedang aktif digunakan oleh pengguna.
 */
export const activeRemoteAccounts = pgTable("active_remote_accounts", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().unique(), // Satu user max 1 akun remote aktif
  accountId: integer("account_id").notNull().references(() => userSessions.id),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: false }).defaultNow().notNull(),
});
