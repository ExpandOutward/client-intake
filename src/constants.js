export const PROJECT_TYPES = [
  "new_build",
  "renovation",
  "fit_out",
  "repair",
  "other",
];
export const SQUARE_FOOTAGES = [
  "not_sure",
  "under_1000",
  "1000_3000",
  "3000_8000",
  "8000_plus",
];
export const TIMELINES = ["asap", "1_3_months", "3_6_months", "flexible"];
export const BUDGETS = [
  "not_sure",
  "under_25k",
  "25k_75k",
  "75k_150k",
  "150k_plus",
];
export const STATUSES = [
  "received",
  "reviewing",
  "quoted",
  "accepted",
  "declined",
  "in_progress",
  "completed",
];

export const PROJECT_TYPE_LABELS = {
  new_build: "New office build",
  renovation: "Office renovation",
  fit_out: "Interior fit-out",
  repair: "Repairs & punch list",
  other: "Other",
};

export const SQUARE_FOOTAGE_LABELS = {
  not_sure: "Not sure yet",
  under_1000: "Under 1,000 sq ft",
  "1000_3000": "1,000–3,000 sq ft",
  "3000_8000": "3,000–8,000 sq ft",
  "8000_plus": "8,000+ sq ft",
};

export const TIMELINE_LABELS = {
  asap: "As soon as possible",
  "1_3_months": "1–3 months",
  "3_6_months": "3–6 months",
  flexible: "Flexible",
};

export const BUDGET_LABELS = {
  not_sure: "Not sure yet",
  under_25k: "Under $25,000",
  "25k_75k": "$25,000–75,000",
  "75k_150k": "$75,000–150,000",
  "150k_plus": "$150,000+",
};

export const STATUS_LABELS = {
  received: "Received",
  reviewing: "Scheduling site visit",
  quoted: "Estimate sent",
  accepted: "Scheduled",
  declined: "Declined",
  in_progress: "In construction",
  completed: "Complete",
};

function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

export function presentRequest(row) {
  return {
    id: row.public_id,
    status: row.status,
    status_label: STATUS_LABELS[row.status] ?? row.status,
    name: row.name,
    email: row.email,
    company: row.company,
    site: row.site,
    project_type: row.project_type,
    project_type_label: PROJECT_TYPE_LABELS[row.project_type] ?? row.project_type,
    square_footage: row.square_footage,
    square_footage_label: SQUARE_FOOTAGE_LABELS[row.square_footage] ?? row.square_footage,
    timeline: row.timeline,
    timeline_label: TIMELINE_LABELS[row.timeline] ?? row.timeline,
    budget: row.budget,
    budget_label: BUDGET_LABELS[row.budget] ?? row.budget,
    message: row.message,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export function statusUrl(publicBaseUrl, publicId) {
  return `${publicBaseUrl}/status.html?r=${encodeURIComponent(publicId)}`;
}
