import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvRowsToObjects, parseCsv, toCsv } from "../src/csv.js";

describe("CSV restore parsing", () => {
  it("skips Excel sep= preambles and accepts semicolon files", () => {
    const withSep = parseCsv("sep=,\nid,name\nabc,Priya\n");
    assert.deepEqual(withSep[0], ["id", "name"]);
    assert.deepEqual(withSep[1], ["abc", "Priya"]);

    const semicolon = parseCsv("id;name;email\n1;Priya;priya@test.com\n");
    assert.deepEqual(semicolon[0], ["id", "name", "email"]);
    assert.equal(semicolon[1][1], "Priya");
  });

  it("matches headers case-insensitively and maps public_id", () => {
    const rows = parseCsv("ID,Name,email,notify_email,company,site,project_type,square_footage,timeline,budget,message,status,created_at,updated_at\n");
    const parsed = csvRowsToObjects([
      rows[0],
      [
        "a".repeat(32),
        "Priya",
        "priya@test.com",
        "",
        "Harbor",
        "",
        "renovation",
        "not_sure",
        "flexible",
        "not_sure",
        "Hello",
        "received",
        "",
        "",
      ],
    ]);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.value[0].id, "a".repeat(32));
    assert.equal(parsed.value[0].name, "Priya");
  });

  it("round-trips a backup through parseCsv", () => {
    const csv = toCsv([
      {
        id: "a".repeat(32),
        name: "Priya Shah",
        email: "priya@harborbookkeeping.com",
        notify_email: "",
        company: "Harbor Bookkeeping",
        site: "1420 Mill Street",
        project_type: "renovation",
        square_footage: "1000_3000",
        timeline: "1_3_months",
        budget: "25k_75k",
        message: "Need offices, a lobby, and a lab.",
        status: "received",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const parsed = csvRowsToObjects(parseCsv(csv));
    assert.equal(parsed.value[0].company, "Harbor Bookkeeping");
    assert.match(parsed.value[0].message, /lobby/);
  });
});
