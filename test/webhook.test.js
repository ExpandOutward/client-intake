import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { sendWebhook } from "../src/webhook.js";

describe("Make webhook sender", () => {
  const received = [];
  let server;
  let url;

  before(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        received.push({
          method: req.method,
          contentType: req.headers["content-type"],
          body: JSON.parse(body),
        });
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Accepted");
      });
    });

    url = await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address();
        resolve(`http://127.0.0.1:${port}`);
      });
    });
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("skips when no webhook URL is configured", async () => {
    const result = await sendWebhook({
      webhookUrl: "",
      payload: { event: "request.created" },
    });
    assert.deepEqual(result, { skipped: true });
  });

  it("POSTs JSON to the webhook URL", async () => {
    const payload = {
      event: "request.created",
      request: { id: "abc", email: "ada@example.com" },
    };
    const result = await sendWebhook({ webhookUrl: url, payload });
    assert.deepEqual(result, { ok: true });
    assert.equal(received.length, 1);
    assert.equal(received[0].method, "POST");
    assert.equal(received[0].contentType, "application/json");
    assert.deepEqual(received[0].body, payload);
  });
});
