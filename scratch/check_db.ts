import { db, schema } from "../src/db";

async function main() {
  console.log("--- SESSIONS ---");
  const sessions = await db.select().from(schema.userSessions);
  console.log(JSON.stringify(sessions, null, 2));

  console.log("--- SETTINGS ---");
  const settings = await db.select().from(schema.userSettings);
  console.log(JSON.stringify(settings, null, 2));

  console.log("--- REMOTE GRANTS ---");
  const grants = await db.select().from(schema.remoteAccessGrants);
  console.log(JSON.stringify(grants, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
