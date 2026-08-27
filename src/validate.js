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
