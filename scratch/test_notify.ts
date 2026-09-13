import { loadClientByAccount, getAccountGrantees } from "../src/services/gramjs";
import { db, schema } from "../src/db";
import { eq } from "drizzle-orm";

async function main() {
  const accountId = 15;
  const grantees = await getAccountGrantees(accountId);
  console.log("Grantees:", grantees);

  if (grantees.length === 0) return;

  const client = await loadClientByAccount(accountId);
  if (!client) return;

  try {
    console.log("Fetching dialogs to populate entity cache...");
    // Fetch a limit of dialogs to see if it loads the entity
    await client.getDialogs({ limit: 40 });
    
    const summary = "<b>Test Notifikasi Admin</b>\n\n<blockquote>Ini adalah pesan uji coba blockquote.</blockquote>\n\nSukses: 1\nGagal: 0\n\nUserbot by @CVunBOT";
    for (const adminId of grantees) {
      console.log(`Sending to admin ${adminId}...`);
      try {
        const res = await client.sendMessage(adminId, { message: summary, parseMode: "html" });
        console.log(`Sent successfully to ${adminId}! Message ID:`, res.id);
      } catch (err) {
        console.error(`Failed to send to ${adminId}:`, err);
      }
    }
  } catch (err) {
    console.error("General error:", err);
  } finally {
    console.log("Disconnecting client...");
    await client.disconnect();
    console.log("Done");
  }
}

main().catch(console.error);
