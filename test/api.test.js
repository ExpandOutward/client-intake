import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { closeServer, sampleInquiry, startTestApp } from "./helpers.js";

function seedJob(overrides = {}) {
  return {
    public_id: randomBytes(16).toString("hex"),
    name: "Priya Shah",
    email: "priya@harborbookkeeping.com",
    notify_email: null,
    company: "Harbor Bookkeeping",
    site: "1420 Mill Street, Suite 200",
    project_type: "renovation",
    square_footage: "1000_3000",
    timeline: "1_3_months",
    budget: "25k_75k",
    message: "Open office for eight people.",
    status: "received",
    ...overrides,
  };
}

function adminList(url, query = "") {
  const suffix = query ? `?${query}` : "";
  return fetch(`${url}/api/admin/requests${suffix}`, {
    headers: { "X-Admin-Key": "test-admin-key" },
  });
}

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
    assert.equal(ctx.events[0].notify_email, null);
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

  it("uses notify_email on the webhook, falling back to CONTACT_EMAIL", async () => {
    ctx = await startTestApp({ contactEmail: "owner@example.com" });

    const withOverride = await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...sampleInquiry,
        notify_email: "tester@example.com",
      }),
    });
    assert.equal(withOverride.status, 201);
    assert.equal(ctx.events[0].notify_email, "tester@example.com");
    assert.equal(ctx.events[0].request.notify_email, "tester@example.com");

    const fallback = await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleInquiry),
    });
    assert.equal(fallback.status, 201);
    assert.equal(ctx.events[1].notify_email, "owner@example.com");
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
    assert.equal(updateEvent.notify_email, null);
  });

  it("lets the demo password open the admin board and change status", async () => {
    ctx = await startTestApp({
      adminKey: "",
      sitePassword: "demo-pass",
    });
    const login = await fetch(`${ctx.url}/api/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "demo-pass" }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    const created = await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        ...sampleInquiry,
        notify_email: "tester@example.com",
      }),
    });
    const { id } = await created.json();

    const listed = await fetch(`${ctx.url}/api/admin/requests`, {
      headers: { "X-Admin-Key": "demo-pass" },
    });
    assert.equal(listed.status, 200);

    const updated = await fetch(`${ctx.url}/api/requests/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": "demo-pass",
      },
      body: JSON.stringify({ status: "quoted" }),
    });
    assert.equal(updated.status, 200);
    const updateEvent = ctx.events.find((event) => event.event === "request.updated");
    assert.equal(updateEvent.notify_email, "tester@example.com");
  });

  it("deletes a request with the admin password", async () => {
    ctx = await startTestApp();
    const created = await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleInquiry),
    });
    const { id } = await created.json();

    const denied = await fetch(`${ctx.url}/api/requests/${id}`, { method: "DELETE" });
    assert.equal(denied.status, 401);

    const removed = await fetch(`${ctx.url}/api/requests/${id}`, {
      method: "DELETE",
      headers: { "X-Admin-Key": "test-admin-key" },
    });
    assert.equal(removed.status, 200);

    const missing = await fetch(`${ctx.url}/api/requests/${id}`);
    assert.equal(missing.status, 404);
  });

  it("resets the demo to two sample jobs without sending webhooks", async () => {
    ctx = await startTestApp();
    await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleInquiry),
    });
    assert.equal(ctx.events.length, 1);

    const denied = await fetch(`${ctx.url}/api/admin/reset`, { method: "POST" });
    assert.equal(denied.status, 401);

    const reset = await fetch(`${ctx.url}/api/admin/reset`, {
      method: "POST",
      headers: { "X-Admin-Key": "test-admin-key" },
    });
    assert.equal(reset.status, 200);
    const body = await reset.json();
    assert.equal(body.requests.length, 2);
    const byCompany = Object.fromEntries(body.requests.map((row) => [row.company, row]));
    assert.equal(byCompany["COMPANY 1 LLC"].name, "Company Guy Sr.");
    assert.equal(byCompany["COMPANY 1 LLC"].email, "company.guy1@noreply.com");
    assert.equal(byCompany["COMPANY 1 LLC"].site, "123 Main Street, Pittsburgh, PA 15222");
    assert.equal(byCompany["COMPANY 1 LLC"].message, "Sample Data 1");
    assert.equal(byCompany["COMPANY 2 LLC"].name, "Company Guy Jr.");
    assert.equal(byCompany["COMPANY 2 LLC"].site, "1 Main Road, Pittsburgh, PA 15222");
    assert.equal(ctx.events.length, 1);
  });

  it("backs up jobs as CSV and restores without sending webhooks", async () => {
    ctx = await startTestApp();
    await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...sampleInquiry,
        message: "Need offices, a lobby, and a lab.",
      }),
    });
    assert.equal(ctx.events.length, 1);

    const backup = await fetch(`${ctx.url}/api/admin/backup`, {
      headers: { "X-Admin-Key": "test-admin-key" },
    });
    assert.equal(backup.status, 200);
    assert.match(backup.headers.get("content-type"), /csv/);
    const csv = await backup.text();
    assert.match(csv, /^id,name,email,notify_email,company,site,project_type/);
    assert.match(csv, /Harbor Bookkeeping/);
    assert.match(csv, /Need offices, a lobby, and a lab/);

    await fetch(`${ctx.url}/api/admin/reset`, {
      method: "POST",
      headers: { "X-Admin-Key": "test-admin-key" },
    });
    const restored = await fetch(`${ctx.url}/api/admin/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "text/csv",
        "X-Admin-Key": "test-admin-key",
      },
      body: csv,
    });
    assert.equal(restored.status, 200);
    const body = await restored.json();
    assert.equal(body.requests.length, 1);
    assert.equal(body.requests[0].company, "Harbor Bookkeeping");
    assert.equal(body.requests[0].message, "Need offices, a lobby, and a lab.");
    assert.equal(ctx.events.length, 1);
  });

  it("blocks public submissions when a site password is set", async () => {
    ctx = await startTestApp({ sitePassword: "demo-pass" });

    const config = await fetch(`${ctx.url}/api/public-config`);
    assert.deepEqual(await config.json(), {
      access_required: true,
      contact_email: null,
    });

    const denied = await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleInquiry),
    });
    assert.equal(denied.status, 401);

    const badLogin = await fetch(`${ctx.url}/api/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "nope" }),
    });
    assert.equal(badLogin.status, 401);

    const login = await fetch(`${ctx.url}/api/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "demo-pass" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);

    const created = await fetch(`${ctx.url}/api/requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(sampleInquiry),
    });
    assert.equal(created.status, 201);
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
    assert.equal(body.total, 1);
    assert.equal(body.sort, "newest");
    assert.equal(body.requests[0].company, "Harbor Bookkeeping");
    assert.ok(body.statuses.some((status) => status.value === "reviewing"));
  });

  it("searches admin jobs by company, contact name, or email", async () => {
    ctx = await startTestApp();
    await ctx.db.insertRequest(
      seedJob({
        company: "Harbor Bookkeeping",
        name: "Priya Shah",
        email: "priya@harborbookkeeping.com",
        site: "Apex warehouse",
        message: "Ask Jordan about paint.",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    );
    await ctx.db.insertRequest(
      seedJob({
        company: "Apex Builders",
        name: "Jordan Lee",
        email: "jordan@apex.test",
        site: "Harbor Street",
        message: "Priya wants new lighting.",
        created_at: "2026-02-01T00:00:00.000Z",
      }),
    );
    await ctx.db.insertRequest(
      seedJob({
        company: "Northside Dental",
        name: "Chris Ng",
        email: "chris@northside.test",
        created_at: "2026-03-01T00:00:00.000Z",
      }),
    );

    const byCompany = await adminList(ctx.url, "q=harbor");
    const companyBody = await byCompany.json();
    assert.equal(byCompany.status, 200);
    assert.equal(companyBody.total, 1);
    assert.equal(companyBody.requests[0].company, "Harbor Bookkeeping");

    const byName = await adminList(ctx.url, "q=jordan");
    const nameBody = await byName.json();
    assert.equal(nameBody.total, 1);
    assert.equal(nameBody.requests[0].name, "Jordan Lee");

    const byEmail = await adminList(ctx.url, "q=chris@northside.test");
    const emailBody = await byEmail.json();
    assert.equal(emailBody.total, 1);
    assert.equal(emailBody.requests[0].email, "chris@northside.test");

    const noSiteOrMessage = await adminList(ctx.url, "q=warehouse");
    const missed = await noSiteOrMessage.json();
    assert.equal(missed.total, 0);
    assert.equal(missed.requests.length, 0);
  });

  it("sorts and paginates the admin job list", async () => {
    ctx = await startTestApp();
    const jobs = [
      { company: "Zulu Office", name: "Ann", email: "ann@zulu.test", created_at: "2026-01-01T00:00:00.000Z" },
      { company: "Alpha Shop", name: "Bea", email: "bea@alpha.test", created_at: "2026-02-01T00:00:00.000Z" },
      { company: "Midtown Lab", name: "Cal", email: "cal@midtown.test", created_at: "2026-03-01T00:00:00.000Z" },
    ];
    for (const job of jobs) {
      await ctx.db.insertRequest(seedJob(job));
    }

    const newest = await (await adminList(ctx.url, "sort=newest")).json();
    assert.deepEqual(
      newest.requests.map((row) => row.company),
      ["Midtown Lab", "Alpha Shop", "Zulu Office"],
    );

    const oldest = await (await adminList(ctx.url, "sort=oldest")).json();
    assert.deepEqual(
      oldest.requests.map((row) => row.company),
      ["Zulu Office", "Alpha Shop", "Midtown Lab"],
    );

    const az = await (await adminList(ctx.url, "sort=az")).json();
    assert.deepEqual(
      az.requests.map((row) => row.company),
      ["Alpha Shop", "Midtown Lab", "Zulu Office"],
    );

    const za = await (await adminList(ctx.url, "sort=za")).json();
    assert.deepEqual(
      za.requests.map((row) => row.company),
      ["Zulu Office", "Midtown Lab", "Alpha Shop"],
    );

    const page = await (await adminList(ctx.url, "limit=2&offset=0&sort=newest")).json();
    assert.equal(page.total, 3);
    assert.equal(page.limit, 2);
    assert.equal(page.offset, 0);
    assert.equal(page.requests.length, 2);
    assert.deepEqual(
      page.requests.map((row) => row.company),
      ["Midtown Lab", "Alpha Shop"],
    );

    const nextPage = await (await adminList(ctx.url, "limit=2&offset=2&sort=newest")).json();
    assert.equal(nextPage.total, 3);
    assert.equal(nextPage.requests.length, 1);
    assert.equal(nextPage.requests[0].company, "Zulu Office");
  });

  it("treats search wildcards as literal text", async () => {
    ctx = await startTestApp();
    await ctx.db.insertRequest(seedJob({ company: "100% Construction" }));
    await ctx.db.insertRequest(seedJob({ company: "Harbor Bookkeeping", name: "Sam Underscore" }));

    const percent = await (await adminList(ctx.url, "q=100%25")).json();
    assert.equal(percent.total, 1);
    assert.equal(percent.requests[0].company, "100% Construction");

    const underscore = await (await adminList(ctx.url, "q=_")).json();
    assert.equal(underscore.total, 0);
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

    const admin = await fetch(`${ctx.url}/admin.html`);
    assert.equal(admin.status, 200);
    const adminHtml = await admin.text();
    assert.match(adminHtml, /id="search-form"/);
    assert.match(adminHtml, /List All/);
    assert.match(adminHtml, /Company A–Z/);
  });
});
