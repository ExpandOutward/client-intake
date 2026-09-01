import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildListSql } from "../src/db.js";

describe("admin list SQL", () => {
  it("uses Postgres chr() for LIKE ESCAPE instead of CHAR(n)", () => {
    const query = buildListSql({ q: "Harbor", limit: 10, offset: 0, sort: "newest" }, "postgres");

    assert.match(query.listSql, /ESCAPE chr\(92\)/);
    assert.doesNotMatch(query.listSql, /ESCAPE CHAR\(/);
    assert.match(query.listSql, /LIKE \$1 /);
    assert.match(query.listSql, /LIKE \$2 /);
    assert.match(query.listSql, /LIKE \$3 /);
    assert.match(query.listSql, /LIMIT \$4 OFFSET \$5/);
    assert.equal(query.countParams.length, 3);
    assert.equal(query.listParams.length, 5);
    assert.equal(query.listParams[0], "%harbor%");
  });

  it("uses SQLite char() for LIKE ESCAPE", () => {
    const query = buildListSql({ q: "Harbor", limit: 10, offset: 0 }, "sqlite");

    assert.match(query.listSql, /ESCAPE char\(92\)/);
    assert.match(query.listSql, /LIKE \? ESCAPE/);
    assert.equal(query.listParams.at(-2), 10);
    assert.equal(query.listParams.at(-1), 0);
  });

  it("filters by status and search together", () => {
    const query = buildListSql(
      { q: "Harbor", status: "completed", limit: 10, offset: 0 },
      "postgres",
    );

    assert.match(query.listSql, /WHERE status = \$1 AND \(/);
    assert.equal(query.listParams[0], "completed");
    assert.equal(query.listParams[1], "%harbor%");
    assert.equal(query.meta.status, "completed");
  });
});
