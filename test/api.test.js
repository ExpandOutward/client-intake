import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { closeServer, sampleInquiry, startTestApp } from "./helpers.js";

describe("intake API", { concurrency: false }, () => {
  let ctx;

  afterEach(async () => {
    if (ctx?.server) await closeServer(ctx.server);
    if (ctx?.db) await ctx.db.close();
    ctx = undefined;
  });

  it("creates a request, returns a status link, and loads it back", async () => {
    ctx = await startTestApp();

    const created = await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleInquiry),
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.status, "received");
    assert.equal(body.status_label, "Received");
    assert.match(body.id, /^[a-f0-9]{32}$/);
    assert.equal(body.status_url, `/status.html?r=${body.id}`);

    assert.equal(ctx.events.length, 1);
    assert.equal(ctx.events[0].event, "request.created");
    assert.equal(ctx.events[0].request.email, "priya@harborbookkeeping.com");
    assert.equal(
      ctx.events[0].request.status_url,
      `http://status.test/status.html?r=${body.id}`,
    );

    const loaded = await fetch(`${ctx.url}/api/requests/${body.id}`);
    assert.equal(loaded.status, 200);
    const request = await loaded.json();
    assert.equal(request.name, "Priya Shah");
    assert.equal(request.company, "Harbor Bookkeeping");
    assert.equal(request.site, "1420 Mill Street, Suite 200");
    assert.equal(request.project_type_label, "Office renovation");
    assert.equal(request.square_footage_label, "1,000–3,000 sq ft");
    assert.equal(request.timeline_label, "1–3 months");
    assert.equal(request.budget_label, "$25,000–75,000");
    assert.equal(request.message, sampleInquiry.message);
  });

  it("rejects missing and invalid fields", async () => {
    ctx = await startTestApp();

    const missing = await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Priya Shah" }),
    });
    assert.equal(missing.status, 400);

    const badEmail = await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sampleInquiry, email: "not-an-email" }),
    });
    assert.equal(badEmail.status, 400);
    assert.deepEqual(await badEmail.json(), { error: "Enter a valid email address." });
  });

  it("returns 404 for an unknown request", async () => {
    ctx = await startTestApp();
    const response = await fetch(`${ctx.url}/api/requests/${"a".repeat(32)}`);
    assert.equal(response.status, 404);
  });

  it("updates status with the admin key and emits request.updated", async () => {
    ctx = await startTestApp();
    const created = await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleInquiry),
    });
    const { id } = await created.json();

    const denied = await fetch(`${ctx.url}/api/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "reviewing" }),
    });
    assert.equal(denied.status, 401);

    const updated = await fetch(`${ctx.url}/api/requests/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": "test-admin-key",
      },
      body: JSON.stringify({ status: "reviewing" }),
    });
    assert.equal(updated.status, 200);
    const body = await updated.json();
    assert.equal(body.status, "reviewing");
    assert.equal(body.status_label, "Scheduling site visit");

    const updateEvent = ctx.events.find((event) => event.event === "request.updated");
    assert.ok(updateEvent);
    assert.equal(updateEvent.previous_status, "received");
    assert.equal(updateEvent.request.status, "reviewing");
  });

  it("lists requests only with the admin key", async () => {
    ctx = await startTestApp();
    await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleInquiry),
    });

    const denied = await fetch(`${ctx.url}/api/admin/requests`);
    assert.equal(denied.status, 401);

    const listed = await fetch(`${ctx.url}/api/admin/requests`, {
      headers: { "X-Admin-Key": "test-admin-key" },
    });
    assert.equal(listed.status, 200);
    const body = await listed.json();
    assert.equal(body.requests.length, 1);
    assert.equal(body.requests[0].company, "Harbor Bookkeeping");
    assert.ok(body.statuses.some((status) => status.value === "reviewing"));
  });

  it("serves the intake page and health check", async () => {
    ctx = await startTestApp();
    const home = await fetch(`${ctx.url}/`);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /Construction Business/);
    assert.match(html, /Request a site visit/);

    const health = await fetch(`${ctx.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
  });
});
