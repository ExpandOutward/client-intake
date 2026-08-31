import { randomBytes } from "node:crypto";
import express from "express";
import {
  ACCESS_COOKIE,
  accessCookieHeader,
  clearAccessCookieHeader,
  createAccessToken,
  createLoginLimiter,
  passwordMatches,
  readCookie,
  verifyAccessToken,
} from "./access.js";
import {
  presentRequest,
  STATUSES,
  STATUS_LABELS,
  statusUrl,
} from "./constants.js";
import { csvRowsToObjects, parseCsv, toCsv } from "./csv.js";
import { DEMO_JOBS } from "./demo.js";
import { parseCreateBody, parseRestoreRow, parseStatusBody } from "./validate.js";
import { LIST_SORTS } from "./db.js";
import { buildWebhookPayload } from "./webhook.js";

const MAX_ADMIN_PAGE_SIZE = 100;

function parseAdminListQuery(query = {}) {
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";
  const sort = LIST_SORTS.includes(query.sort) ? query.sort : "newest";
  let limit =
    query.limit == null || query.limit === ""
      ? null
      : Number.parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = null;
  if (limit != null && limit > MAX_ADMIN_PAGE_SIZE) limit = MAX_ADMIN_PAGE_SIZE;
  let offset =
    query.offset == null || query.offset === ""
      ? 0
      : Number.parseInt(query.offset, 10);
  if (!Number.isInteger(offset) || offset < 0) offset = 0;
  return { q, sort, limit, offset };
}

function fireWebhook(sendWebhook, payload) {
  void Promise.resolve(sendWebhook(payload)).catch((err) => {
    console.error(`Webhook error: ${err.message}`);
  });
}

function statusOptions() {
  return STATUSES.map((value) => ({
    value,
    label: STATUS_LABELS[value],
  }));
}

export function createApp({
  db,
  publicDir,
  publicBaseUrl,
  adminKey = "",
  sitePassword = "",
  contactEmail = "",
  sendWebhook = async () => {},
}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "32kb" }));
  const secureCookie = publicBaseUrl.startsWith("https://");
  const allowLogin = createLoginLimiter();

  function hasAccess(req) {
    if (!sitePassword) return true;
    const token = readCookie(req.headers.cookie, ACCESS_COOKIE);
    return verifyAccessToken(sitePassword, token);
  }

  function adminConfigured() {
    return Boolean(adminKey || sitePassword);
  }

  function hasAdmin(req) {
    const provided = req.get("x-admin-key");
    return passwordMatches(provided, adminKey) || passwordMatches(provided, sitePassword);
  }

  app.get("/api/public-config", (_req, res) => {
    res.json({
      access_required: Boolean(sitePassword),
      contact_email: contactEmail || null,
    });
  });

  app.get("/api/access", (req, res) => {
    if (!sitePassword) return res.json({ ok: true, access_required: false });
    if (!hasAccess(req)) return res.status(401).json({ ok: false });
    return res.json({ ok: true, access_required: true });
  });

  app.post("/api/access", (req, res) => {
    if (!sitePassword) return res.json({ ok: true, access_required: false });
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!allowLogin(ip)) {
      return res.status(429).json({ error: "Too many sign-in attempts. Try again later." });
    }
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!passwordMatches(password, sitePassword)) {
      return res.status(401).json({ error: "That login is not valid." });
    }
    const token = createAccessToken(sitePassword);
    res.setHeader("Set-Cookie", accessCookieHeader(token, { secure: secureCookie }));
    return res.json({ ok: true });
  });

  app.post("/api/access/logout", (_req, res) => {
    res.setHeader("Set-Cookie", clearAccessCookieHeader({ secure: secureCookie }));
    return res.json({ ok: true });
  });

  app.get("/health", async (_req, res) => {
    try {
      await db.ping();
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(503).json({ ok: false });
    }
  });

  app.post("/api/requests", async (req, res) => {
    if (!hasAccess(req)) {
      return res.status(401).json({ error: "Sign in to submit a request." });
    }

    const parsed = parseCreateBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const fields = { ...parsed.value };
    if (!fields.notify_email && contactEmail) {
      fields.notify_email = contactEmail.toLowerCase();
    }

    const row = await db.insertRequest({
      public_id: randomBytes(16).toString("hex"),
      ...fields,
    });
    const presented = presentRequest(row);

    fireWebhook(
      sendWebhook,
      buildWebhookPayload({
        event: "request.created",
        row: presented,
        publicBaseUrl,
      }),
    );

    return res.status(201).json({
      id: presented.id,
      status: presented.status,
      status_label: presented.status_label,
      status_url: statusUrl("", presented.id),
    });
  });

  app.get("/api/admin/requests", async (req, res) => {
    if (!adminConfigured()) {
      return res.status(503).json({ error: "Admin access is not configured." });
    }
    if (!hasAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const options = parseAdminListQuery(req.query);
    const { rows, total, q, sort, limit, offset } = await db.listRequests(options);
    return res.json({
      statuses: statusOptions(),
      requests: rows.map(presentRequest),
      total,
      q,
      sort,
      limit,
      offset,
    });
  });

  app.get("/api/requests/:id", async (req, res) => {
    const row = await db.getRequestByPublicId(req.params.id);
    if (!row) {
      return res.status(404).json({ error: "Request not found." });
    }

    return res.json(presentRequest(row));
  });

  app.patch("/api/requests/:id", async (req, res) => {
    if (!adminConfigured()) {
      return res.status(503).json({ error: "Status updates are not configured." });
    }
    if (!hasAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const parsed = parseStatusBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const existing = await db.getRequestByPublicId(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Request not found." });
    }

    if (existing.status === parsed.value.status) {
      return res.json(presentRequest(existing));
    }

    const previousStatus = existing.status;
    const row = await db.updateRequestStatus(req.params.id, parsed.value.status);
    const presented = presentRequest(row);

    fireWebhook(
      sendWebhook,
      buildWebhookPayload({
        event: "request.updated",
        row: presented,
        publicBaseUrl,
        previousStatus,
        previousStatusLabel: STATUS_LABELS[previousStatus] ?? previousStatus,
      }),
    );

    return res.json(presented);
  });

  app.delete("/api/requests/:id", async (req, res) => {
    if (!adminConfigured()) {
      return res.status(503).json({ error: "Admin access is not configured." });
    }
    if (!hasAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const deleted = await db.deleteRequest(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Request not found." });
    }

    return res.json({ ok: true });
  });

  app.post("/api/admin/reset", async (req, res) => {
    if (!adminConfigured()) {
      return res.status(503).json({ error: "Admin access is not configured." });
    }
    if (!hasAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    await db.deleteAllRequests();
    for (const job of DEMO_JOBS) {
      await db.insertRequest({
        public_id: randomBytes(16).toString("hex"),
        ...job,
      });
    }

    const { rows } = await db.listRequests();
    return res.json({
      statuses: statusOptions(),
      requests: rows.map(presentRequest),
    });
  });

  app.get("/api/admin/backup", async (req, res) => {
    if (!adminConfigured()) {
      return res.status(503).json({ error: "Admin access is not configured." });
    }
    if (!hasAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const { rows } = await db.listRequests();
    const csv = toCsv(rows.map(presentRequest));
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="jobs-backup-${day}.csv"`);
    return res.send(csv);
  });

  app.post(
    "/api/admin/restore",
    express.text({ type: ["text/csv", "text/plain"], limit: "512kb" }),
    async (req, res) => {
      if (!adminConfigured()) {
        return res.status(503).json({ error: "Admin access is not configured." });
      }
      if (!hasAdmin(req)) {
        return res.status(401).json({ error: "Unauthorized." });
      }

      const parsedCsv = csvRowsToObjects(parseCsv(req.body));
      if (parsedCsv.error) {
        return res.status(400).json({ error: parsedCsv.error });
      }

      const jobs = [];
      const ids = new Set();
      for (let i = 0; i < parsedCsv.value.length; i += 1) {
        const parsed = parseRestoreRow(parsedCsv.value[i], i + 2);
        if (parsed.error) {
          return res.status(400).json({ error: parsed.error });
        }
        if (ids.has(parsed.value.public_id)) {
          return res.status(400).json({ error: "CSV contains duplicate job ids." });
        }
        ids.add(parsed.value.public_id);
        jobs.push(parsed.value);
      }

      await db.deleteAllRequests();
      for (const job of jobs) {
        await db.insertRequest(job);
      }

      const { rows } = await db.listRequests();
      return res.json({
        statuses: statusOptions(),
        requests: rows.map(presentRequest),
      });
    },
  );

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  app.use(express.static(publicDir));

  app.use((err, _req, res, _next) => {
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({ error: "Invalid JSON." });
    }
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "Request is too large." });
    }
    console.error(err);
    return res.status(500).json({ error: "Something went wrong." });
  });

  return app;
}
