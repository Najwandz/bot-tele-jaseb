import { db, schema } from "../db";
import { eq, and, isNull } from "drizzle-orm";
import { GroupInfo, getActiveAccount } from "./gramjs";

export interface GroupListSummary {
  id: number;
  name: string;
  itemCount: number;
  accountId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Helper: ambil accountId aktif (null kalau belum ada akun) ────────────────
async function getActiveAccountId(userId: number): Promise<number | null> {
  const active = await getActiveAccount(userId);
  return active?.id ?? null;
}

// ─── Ambil semua list milik akun aktif user ───────────────────────────────────
export async function getUserGroupLists(userId: number): Promise<GroupListSummary[]> {
  const accountId = await getActiveAccountId(userId);

  // Filter berdasarkan accountId — kalau null, ambil list lama (tanpa accountId)
  const lists = accountId
    ? await db
        .select()
        .from(schema.groupLists)
        .where(eq(schema.groupLists.accountId, accountId))
    : await db
        .select()
        .from(schema.groupLists)
        .where(
          and(
            eq(schema.groupLists.userId, userId),
            isNull(schema.groupLists.accountId)
          )
        );

  const result: GroupListSummary[] = [];
  for (const l of lists) {
    const items = await db
      .select()
      .from(schema.groupListItems)
      .where(eq(schema.groupListItems.listId, l.id));
    result.push({
      id: l.id,
      name: l.name,
      itemCount: items.length,
      accountId: l.accountId,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    });
  }
  return result;
}

// ─── Ambil detail item dalam satu list ───────────────────────────────────────
export async function getGroupListItems(listId: number, userId: number) {
  const accountId = await getActiveAccountId(userId);
  const conditions = [eq(schema.groupLists.id, listId)];
  if (accountId) {
    conditions.push(eq(schema.groupLists.accountId, accountId));
  } else {
    conditions.push(eq(schema.groupLists.userId, userId));
    conditions.push(isNull(schema.groupLists.accountId));
  }

  const lists = await db
    .select()
    .from(schema.groupLists)
    .where(and(...conditions))
    .limit(1);

  const list = lists[0];
  if (!list) return null;

  const items = await db
    .select()
    .from(schema.groupListItems)
    .where(eq(schema.groupListItems.listId, listId));

  return { list, items };
}

// ─── Buat list baru (otomatis pakai accountId aktif) ─────────────────────────
export async function createGroupList(
  userId: number,
  name: string,
  groups: GroupInfo[]
): Promise<number> {
  const now = new Date();
  const accountId = await getActiveAccountId(userId);

  const inserted = await db
    .insert(schema.groupLists)
    .values({ userId, accountId, name, createdAt: now, updatedAt: now })
    .returning();

  const listId = inserted[0].id;

  if (groups.length > 0) {
    await db.insert(schema.groupListItems).values(
      groups.map((g) => ({
        listId,
        chatId: g.id,
        title: g.title,
        type: g.type,
      }))
    );
  }

  return listId;
}

// ─── Hapus list ───────────────────────────────────────────────────────────────
export async function deleteGroupList(listId: number, userId: number): Promise<boolean> {
  const accountId = await getActiveAccountId(userId);
  const conditions = [eq(schema.groupLists.id, listId)];
  if (accountId) {
    conditions.push(eq(schema.groupLists.accountId, accountId));
  } else {
    conditions.push(eq(schema.groupLists.userId, userId));
    conditions.push(isNull(schema.groupLists.accountId));
  }

  const lists = await db
    .select()
    .from(schema.groupLists)
    .where(and(...conditions))
    .limit(1);

  if (lists.length === 0) return false;

  await db
    .delete(schema.groupListItems)
    .where(eq(schema.groupListItems.listId, listId));

  await db.delete(schema.groupLists).where(eq(schema.groupLists.id, listId));

  return true;
}
