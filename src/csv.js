export const CSV_COLUMNS = [
  "id",
  "name",
  "email",
  "notify_email",
  "company",
  "site",
  "project_type",
  "square_footage",
  "timeline",
  "budget",
  "message",
  "status",
  "created_at",
  "updated_at",
];

export function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(requests) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const request of requests) {
    lines.push(CSV_COLUMNS.map((column) => csvEscape(request[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function firstLine(source) {
  const breakAt = source.search(/\r\n|\n|\r/);
  if (breakAt === -1) return { line: source, restStart: source.length };
  const crlf = source.startsWith("\r\n", breakAt);
  return { line: source.slice(0, breakAt), restStart: breakAt + (crlf ? 2 : 1) };
}

function countUnquoted(text, delimiter) {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) count += 1;
  }
  return count;
}

function parseCsvWithDelimiter(source, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== "")) rows.push(row);
  }

  return rows;
}

export function parseCsv(text) {
  let source = String(text ?? "").replace(/^\uFEFF/, "");
  if (!source.trim()) return [];

  const { line, restStart } = firstLine(source);
  const sepMatch = /^sep=(.)$/i.exec(line.trim());
  let delimiter = ",";
  if (sepMatch) {
    delimiter = sepMatch[1];
    source = source.slice(restStart);
  } else if (countUnquoted(line, ";") > countUnquoted(line, ",")) {
    delimiter = ";";
  }

  return parseCsvWithDelimiter(source, delimiter);
}

const HEADER_ALIASES = {
  public_id: "id",
  job_id: "id",
};

const LABEL_FALLBACKS = {
  status: "status_label",
  project_type: "project_type_label",
  square_footage: "square_footage_label",
  timeline: "timeline_label",
  budget: "budget_label",
};

function canonicalHeader(header) {
  const key = String(header ?? "").trim().toLowerCase();
  return HEADER_ALIASES[key] || key;
}

const OPTIONAL_COLUMNS = new Set(["id", "notify_email", "site", "created_at", "updated_at"]);

export function csvRowsToObjects(rows) {
  if (!rows.length) return { error: "The CSV file is empty." };
  const headers = rows[0].map(canonicalHeader);
  const missing = CSV_COLUMNS.filter(
    (column) => !OPTIONAL_COLUMNS.has(column) && !headers.includes(column),
  );
  if (missing.length) {
    return { error: `CSV is missing columns: ${missing.join(", ")}.` };
  }

  const objects = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const record = {};
    headers.forEach((header, index) => {
      if (!header || record[header] != null && record[header] !== "") return;
      record[header] = row[index] ?? "";
    });
    for (const [column, labelColumn] of Object.entries(LABEL_FALLBACKS)) {
      if (!asNonEmpty(record[column]) && asNonEmpty(record[labelColumn])) {
        record[column] = record[labelColumn];
      }
    }
    objects.push(record);
  }

  if (!objects.length) return { error: "The CSV file has no job rows." };
  if (objects.length > 500) return { error: "CSV has too many rows (max 500)." };
  return { value: objects };
}

function asNonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}
