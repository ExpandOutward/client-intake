import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openStore } from "./db.js";
import { loadEnv } from "./env.js";
import { sendWebhook } from "./webhook.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(join(root, ".env"));

const port = Number(process.env.PORT) || 3000;
const publicBaseUrl = (
  process.env.PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${port}`
).replace(/\/$/, "");
const adminKey = process.env.ADMIN_KEY || "";
const webhookUrl = process.env.MAKE_WEBHOOK_URL || "";
const databaseUrl = process.env.DATABASE_URL || "";
const sqlitePath = process.env.DATABASE_PATH || join(root, "data", "intake.db");

const db = await openStore({
  databaseUrl,
  sqlitePath,
});

const app = createApp({
  db,
  publicDir: join(root, "public"),
  publicBaseUrl,
  adminKey,
  sendWebhook: (payload) => sendWebhook({ webhookUrl, payload }),
});

app.listen(port, () => {
  console.log(`Client intake listening on ${publicBaseUrl}`);
  console.log(`Database: ${db.kind}`);
  if (webhookUrl) {
    console.log("Make webhook enabled");
  } else {
    console.log("MAKE_WEBHOOK_URL not set; skipping outbound webhook");
  }
  if (!adminKey) {
    console.log("ADMIN_KEY not set; PATCH /api/requests/:id is disabled");
  }
});
