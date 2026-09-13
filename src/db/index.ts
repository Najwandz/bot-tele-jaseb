import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20, // max connections in pool
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err);
});

export const db = drizzle(pool, { schema });
export { schema, pool };
