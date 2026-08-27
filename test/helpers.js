import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { openStore } from "../src/db.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

export function listen(app) {
  const server = createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

export async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

export async function startTestApp(overrides = {}) {
  const db = await openStore({ sqlitePath: ":memory:" });
  const events = [];
  const app = createApp({
    db,
    publicDir,
    publicBaseUrl: "http://status.test",
    adminKey: "test-admin-key",
    sendWebhook: async (payload) => {
      events.push(payload);
    },
    ...overrides,
  });
  const { server, url } = await listen(app);
  return { db, events, server, url };
}

export const sampleInquiry = {
  name: "Priya Shah",
  email: "priya@harborbookkeeping.com",
  company: "Harbor Bookkeeping",
  site: "1420 Mill Street, Suite 200",
  project_type: "renovation",
  square_footage: "1000_3000",
  timeline: "1_3_months",
  budget: "25k_75k",
  message:
    "Open office for eight people, two private offices, and a small meeting room. Carpet is worn and we want a cleaner client-facing front.",
};
