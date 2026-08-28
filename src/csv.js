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

export function parseCsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
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
    if (char === ",") {
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

export function csvRowsToObjects(rows) {
  if (!rows.length) return { error: "The CSV file is empty." };
  const headers = rows[0].map((header) => header.trim());
  const missing = CSV_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) {
    return { error: `CSV is missing columns: ${missing.join(", ")}.` };
  }

  const objects = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    objects.push(record);
  }

  if (!objects.length) return { error: "The CSV file has no job rows." };
  if (objects.length > 500) return { error: "CSV has too many rows (max 500)." };
  return { value: objects };
}
