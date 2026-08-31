import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const SQLITE_SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    notify_email TEXT,
    company TEXT,
    site TEXT,
    project_type TEXT NOT NULL,
    square_footage TEXT NOT NULL DEFAULT 'not_sure',
    timeline TEXT NOT NULL DEFAULT 'flexible',
    budget TEXT NOT NULL DEFAULT 'not_sure',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const POSTGRES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS requests (
    id SERIAL PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    notify_email TEXT,
    company TEXT,
    site TEXT,
    project_type TEXT NOT NULL,
    square_footage TEXT NOT NULL DEFAULT 'not_sure',
    timeline TEXT NOT NULL DEFAULT 'flexible',
    budget TEXT NOT NULL DEFAULT 'not_sure',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );
`;

const INSERT_SQL = `INSERT INTO requests (
  public_id, name, email, notify_email, company, site, project_type, square_footage, timeline,
  budget, message, status, created_at, updated_at
) VALUES`;

function insertParams(fields) {
  const now = new Date().toISOString();
  return [
    fields.public_id,
    fields.name,
    fields.email,
    fields.notify_email,
    fields.company,
    fields.site,
    fields.project_type,
    fields.square_footage,
    fields.timeline,
    fields.budget,
    fields.message,
    fields.status || "received",
    fields.created_at || now,
    fields.updated_at || now,
  ];
}

function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

export const LIST_SORTS = ["newest", "oldest", "az", "za"];

const SORT_SQL = {
  newest: "created_at DESC, id DESC",
  oldest: "created_at ASC, id ASC",
  az: "LOWER(company) ASC, created_at DESC, id DESC",
  za: "LOWER(company) DESC, created_at DESC, id DESC",
};

function likeContains(q) {
  const escaped = q
    .toLowerCase()
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `%${escaped}%`;
}

export function normalizeListOptions(options = {}) {
  const q = typeof options.q === "string" ? options.q.trim() : "";
  const sort = SORT_SQL[options.sort] ? options.sort : "newest";
  let limit = options.limit;
  if (limit == null || limit === "") {
    limit = null;
  } else {
    limit = Number.parseInt(limit, 10);
    if (!Number.isInteger(limit) || limit < 1) limit = null;
  }
  let offset = Number.parseInt(options.offset ?? 0, 10);
  if (!Number.isInteger(offset) || offset < 0) offset = 0;
  return { q, sort, limit, offset };
}

export function buildListSql(options, style) {
  const { q, sort, limit, offset } = normalizeListOptions(options);
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return style === "postgres" ? `$${params.length}` : "?";
  };
  // SQLite's CHAR(n) is a function (code point). Postgres CHAR(n) is a type,
  // so search must use chr(n) there or the query 500s.
  const escapeChar = style === "postgres" ? "chr(92)" : "char(92)";

  let whereSql = "";
  if (q) {
    const pattern = likeContains(q);
    const clauses = ["company", "name", "email"].map((col) => {
      return `LOWER(${col}) LIKE ${addParam(pattern)} ESCAPE ${escapeChar}`;
    });
    whereSql = `WHERE ${clauses.join(" OR ")}`;
  }

  const countParams = params.slice();
  const countSql = `SELECT COUNT(*) AS total FROM requests ${whereSql}`;
  const orderSql = `ORDER BY ${SORT_SQL[sort]}`;

  let limitSql = "";
  if (limit != null) {
    limitSql = `LIMIT ${addParam(limit)} OFFSET ${addParam(offset)}`;
  }

  return {
    countSql,
    countParams,
    listSql: `SELECT * FROM requests ${whereSql} ${orderSql} ${limitSql}`.trim(),
    listParams: params,
    meta: { q, sort, limit, offset },
  };
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    ...row,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function ensureSqliteColumn(db, name, definition) {
  const cols = db.prepare("PRAGMA table_info(requests)").all().map((row) => row.name);
  if (!cols.includes(name)) {
    db.exec(`ALTER TABLE requests ADD COLUMN ${definition}`);
  }
}

async function ensurePostgresColumn(pool, name, definition) {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'requests' AND column_name = $1`,
    [name],
  );
  if (result.rowCount === 0) {
    await pool.query(`ALTER TABLE requests ADD COLUMN ${definition}`);
  }
}

export function createSqliteStore(path) {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec(SQLITE_SCHEMA);
  ensureSqliteColumn(db, "site", "site TEXT");
  ensureSqliteColumn(db, "notify_email", "notify_email TEXT");
  ensureSqliteColumn(db, "square_footage", "square_footage TEXT NOT NULL DEFAULT 'not_sure'");
  ensureSqliteColumn(db, "timeline", "timeline TEXT NOT NULL DEFAULT 'flexible'");

  return {
    kind: "sqlite",
    async ping() {
      db.prepare("SELECT 1").get();
    },
    async insertRequest(fields) {
      const params = insertParams(fields);
      db.prepare(
        `${INSERT_SQL} (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(...params);
      return this.getRequestByPublicId(fields.public_id);
    },
    async getRequestByPublicId(publicId) {
      return normalizeRow(
        db.prepare("SELECT * FROM requests WHERE public_id = ?").get(publicId) ?? null,
      );
    },
    async listRequests(options = {}) {
      const query = buildListSql(options, "sqlite");
      const countRow = db.prepare(query.countSql).get(...query.countParams);
      const total = Number(countRow?.total ?? 0);
      const rows = db
        .prepare(query.listSql)
        .all(...query.listParams)
        .map(normalizeRow);
      return { rows, total, ...query.meta };
    },
    async updateRequestStatus(publicId, status) {
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE requests SET status = ?, updated_at = ? WHERE public_id = ?",
      ).run(status, now, publicId);
      return this.getRequestByPublicId(publicId);
    },
    async deleteRequest(publicId) {
      const result = db.prepare("DELETE FROM requests WHERE public_id = ?").run(publicId);
      return result.changes > 0;
    },
    async deleteAllRequests() {
      db.exec("DELETE FROM requests");
    },
    async close() {
      db.close();
    },
  };
}

function postgresSsl(connectionString) {
  const isLocal =
    connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  return isLocal ? false : { rejectUnauthorized: false };
}

export async function createPostgresStore(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    ssl: postgresSsl(connectionString),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  await pool.query(POSTGRES_SCHEMA);
  await ensurePostgresColumn(pool, "notify_email", "notify_email TEXT");
  await ensurePostgresColumn(pool, "site", "site TEXT");
  await ensurePostgresColumn(pool, "square_footage", "square_footage TEXT NOT NULL DEFAULT 'not_sure'");
  await ensurePostgresColumn(pool, "timeline", "timeline TEXT NOT NULL DEFAULT 'flexible'");

  return {
    kind: "postgres",
    async ping() {
      await pool.query("SELECT 1");
    },
    async insertRequest(fields) {
      const params = insertParams(fields);
      const result = await pool.query(
        `${INSERT_SQL} ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        params,
      );
      return normalizeRow(result.rows[0]);
    },
    async getRequestByPublicId(publicId) {
      const result = await pool.query(
        "SELECT * FROM requests WHERE public_id = $1",
        [publicId],
      );
      return normalizeRow(result.rows[0] ?? null);
    },
    async listRequests(options = {}) {
      const query = buildListSql(options, "postgres");
      const countResult = await pool.query(query.countSql, query.countParams);
      const total = Number(countResult.rows[0]?.total ?? 0);
      const result = await pool.query(query.listSql, query.listParams);
      return { rows: result.rows.map(normalizeRow), total, ...query.meta };
    },
    async updateRequestStatus(publicId, status) {
      const now = new Date().toISOString();
      const result = await pool.query(
        "UPDATE requests SET status = $1, updated_at = $2 WHERE public_id = $3 RETURNING *",
        [status, now, publicId],
      );
      return normalizeRow(result.rows[0] ?? null);
    },
    async deleteRequest(publicId) {
      const result = await pool.query(
        "DELETE FROM requests WHERE public_id = $1",
        [publicId],
      );
      return result.rowCount > 0;
    },
    async deleteAllRequests() {
      await pool.query("DELETE FROM requests");
    },
    async close() {
      await pool.end();
    },
  };
}

export async function openStore({ databaseUrl, sqlitePath } = {}) {
  if (databaseUrl) {
    return createPostgresStore(databaseUrl);
  }
  if (!sqlitePath) {
    throw new Error("Set DATABASE_URL or DATABASE_PATH.");
  }
  return createSqliteStore(sqlitePath);
}
