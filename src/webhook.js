export async function sendWebhook({ webhookUrl, payload, timeoutMs = 5000 }) {
  if (!webhookUrl) return { skipped: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "client-intake/0.1",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Webhook failed: ${response.status} ${body}`);
      return { ok: false, status: response.status };
    }

    return { ok: true };
  } catch (err) {
    console.error(`Webhook error: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

export function buildWebhookPayload({
  event,
  row,
  publicBaseUrl,
  previousStatus = null,
  previousStatusLabel = null,
}) {
  const occurredAt = new Date().toISOString();
  const payload = {
    event,
    occurred_at: occurredAt,
    notify_email: row.notify_email || null,
    request: {
      ...row,
      status_url: `${publicBaseUrl}/status.html?r=${encodeURIComponent(row.id)}`,
    },
  };

  if (event === "request.updated") {
    payload.previous_status = previousStatus;
    payload.previous_status_label = previousStatusLabel;
  }

  return payload;
}
