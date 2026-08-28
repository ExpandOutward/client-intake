import {
  BUDGETS,
  PROJECT_TYPES,
  SQUARE_FOOTAGES,
  STATUSES,
  TIMELINES,
} from "./constants.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseCreateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Send a JSON object." };
  }

  const name = asTrimmedString(body.name);
  const email = asTrimmedString(body.email).toLowerCase();
  const notifyEmail = asTrimmedString(body.notify_email).toLowerCase();
  const company = asTrimmedString(body.company);
  const site = asTrimmedString(body.site);
  const projectType = asTrimmedString(body.project_type);
  const squareFootage = asTrimmedString(body.square_footage) || "not_sure";
  const timeline = asTrimmedString(body.timeline) || "flexible";
  const budget = asTrimmedString(body.budget) || "not_sure";
  const message = asTrimmedString(body.message);

  if (!name) return { error: "Name is required." };
  if (name.length > 120) return { error: "Name is too long." };

  if (!email) return { error: "Email is required." };
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }

  if (notifyEmail && (notifyEmail.length > 254 || !EMAIL_RE.test(notifyEmail))) {
    return { error: "Enter a valid notification email." };
  }

  if (!company) return { error: "Business name is required." };
  if (company.length > 120) return { error: "Business name is too long." };
  if (site.length > 200) return { error: "Jobsite is too long." };
  if (!PROJECT_TYPES.includes(projectType)) return { error: "Select the type of work." };
  if (!SQUARE_FOOTAGES.includes(squareFootage)) {
    return { error: "Select a valid space size." };
  }
  if (!TIMELINES.includes(timeline)) return { error: "Select a valid start window." };
  if (!BUDGETS.includes(budget)) return { error: "Select a valid budget." };

  if (!message) return { error: "Describe the space and work." };
  if (message.length > 5000) return { error: "Description is too long." };

  return {
    value: {
      name,
      email,
      notify_email: notifyEmail || null,
      company,
      site: site || null,
      project_type: projectType,
      square_footage: squareFootage,
      timeline,
      budget,
      message,
    },
  };
}

export function parseStatusBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Send a JSON object." };
  }

  const status = asTrimmedString(body.status);
  if (!STATUSES.includes(status)) {
    return { error: "Select a valid status." };
  }

  return { value: { status } };
}

export function parseRestoreRow(body, index) {
  const created = parseCreateBody(body);
  if (created.error) {
    return { error: `Row ${index}: ${created.error}` };
  }

  const id = asTrimmedString(body.id);
  if (!/^[a-f0-9]{32}$/i.test(id)) {
    return { error: `Row ${index}: Each job needs a 32-character id.` };
  }

  const status = asTrimmedString(body.status) || "received";
  if (!STATUSES.includes(status)) {
    return { error: `Row ${index}: Select a valid status.` };
  }

  const createdAt = asTrimmedString(body.created_at);
  const updatedAt = asTrimmedString(body.updated_at);
  if (createdAt && Number.isNaN(new Date(createdAt).getTime())) {
    return { error: `Row ${index}: created_at is not a valid date.` };
  }
  if (updatedAt && Number.isNaN(new Date(updatedAt).getTime())) {
    return { error: `Row ${index}: updated_at is not a valid date.` };
  }

  return {
    value: {
      public_id: id.toLowerCase(),
      ...created.value,
      status,
      created_at: createdAt || undefined,
      updated_at: updatedAt || undefined,
    },
  };
}
