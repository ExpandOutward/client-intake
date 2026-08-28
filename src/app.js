import { randomBytes, timingSafeEqual } from "node:crypto";
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
import { parseCreateBody, parseStatusBody } from "./validate.js";
import { buildWebhookPayload } from "./webhook.js";

function adminKeyMatches(provided, expected) {
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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

    const row = await db.insertRequest({
      public_id: randomBytes(16).toString("hex"),
      ...parsed.value,
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
    if (!adminKey) {
      return res.status(503).json({ error: "Admin access is not configured." });
    }
    if (!adminKeyMatches(req.get("x-admin-key"), adminKey)) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    const rows = await db.listRequests();
    return res.json({
      statuses: statusOptions(),
      requests: rows.map(presentRequest),
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
    if (!adminKey) {
      return res.status(503).json({ error: "Status updates are not configured." });
    }
    if (!adminKeyMatches(req.get("x-admin-key"), adminKey)) {
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
