# Construction Business intake

Project intake for a construction company that builds and renovates offices for small businesses. Includes a private status page, a JSON API, and an outbound webhook shaped for Make.com.

## Run locally

```bash
cp .env.example .env
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Optional:

- `MAKE_WEBHOOK_URL` — Make.com custom webhook. If empty, the app still saves requests and skips the outbound call.
- `ADMIN_KEY` — required to change status with `PATCH /api/requests/:id`.
- `PUBLIC_BASE_URL` — absolute origin used in webhook `status_url` values. On Render this falls back to `RENDER_EXTERNAL_URL`.
- `DATABASE_URL` — Postgres connection string. When set, SQLite is not used.
- `DATABASE_PATH` — local SQLite file. Used only when `DATABASE_URL` is empty.

```bash
npm test
npm run dev
```

## API

### `POST /api/requests`

Creates a request. Status starts at `received`.

```json
{
  "name": "Priya Shah",
  "email": "priya@harborbookkeeping.com",
  "company": "Harbor Bookkeeping",
  "site": "1420 Mill Street, Suite 200",
  "project_type": "renovation",
  "square_footage": "1000_3000",
  "timeline": "1_3_months",
  "budget": "25k_75k",
  "message": "Open office for eight people and a small meeting room."
}
```

`site` is optional. `square_footage` defaults to `not_sure`. `timeline` defaults to `flexible`. `budget` defaults to `not_sure`.

**201**

```json
{
  "id": "32-char-hex-token",
  "status": "received",
  "status_label": "Received",
  "status_url": "/status.html?r=32-char-hex-token"
}
```

The `id` is unguessable. Share only the status URL with the client.

### `GET /api/requests/:id`

Public-but-unguessable read for the status page.

### `PATCH /api/requests/:id`

Header: `X-Admin-Key: $ADMIN_KEY`

```json
{ "status": "reviewing" }
```

Allowed statuses: `received`, `reviewing`, `quoted`, `accepted`, `declined`, `in_progress`, `completed`.

### `GET /health`

Render-style health check: `{ "ok": true }`.

## Webhook payload (Make.com)

When `MAKE_WEBHOOK_URL` is set, the app POSTs JSON after create and after a status change. A webhook failure is logged and does **not** fail the client request.

**`request.created`**

```json
{
  "event": "request.created",
  "occurred_at": "2026-08-27T15:00:00.000Z",
  "request": {
    "id": "32-char-hex-token",
    "status": "received",
    "status_label": "Received",
    "name": "Priya Shah",
    "email": "priya@harborbookkeeping.com",
    "company": "Harbor Bookkeeping",
    "site": "1420 Mill Street, Suite 200",
    "project_type": "renovation",
    "project_type_label": "Office renovation",
    "square_footage": "1000_3000",
    "square_footage_label": "1,000–3,000 sq ft",
    "timeline": "1_3_months",
    "timeline_label": "1–3 months",
    "budget": "25k_75k",
    "budget_label": "$25,000–75,000",
    "message": "Open office for eight people and a small meeting room.",
    "status_url": "http://localhost:3000/status.html?r=32-char-hex-token",
    "created_at": "2026-08-27T15:00:00.000Z",
    "updated_at": "2026-08-27T15:00:00.000Z"
  }
}
```

**`request.updated`** — same `request` object, plus:

```json
{
  "event": "request.updated",
  "previous_status": "received",
  "previous_status_label": "Received"
}
```

## Deploy on Render

1. Create a **Postgres** database in the same region as the web service.
2. Create a **Web Service** from this repo:

| Field | Value |
|---|---|
| Runtime | Node |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/health` |
| Node version | `22` (from `.node-version`) |

3. Link `client-intake-db` so Render injects `DATABASE_URL`.
4. Set `ADMIN_KEY` to a long random string. Leave `MAKE_WEBHOOK_URL` empty until Make.com is next.

Local development stays on SQLite. Render uses Postgres.
