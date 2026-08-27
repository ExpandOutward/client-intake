const loadingEl = document.getElementById("status-loading");
const errorEl = document.getElementById("status-error");
const errorText = document.getElementById("status-error-text");
const viewEl = document.getElementById("status-view");
const pillEl = document.getElementById("status-pill");

const params = new URLSearchParams(window.location.search);
const requestId = params.get("r");

function showError(message) {
  loadingEl.hidden = true;
  viewEl.hidden = true;
  errorEl.hidden = false;
  errorText.textContent = message;
}

function setText(id, value) {
  document.getElementById(id).textContent = value || "—";
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function loadRequest() {
  if (!requestId) {
    showError("This status link is missing its project id.");
    return;
  }

  try {
    const response = await fetch(`/api/requests/${encodeURIComponent(requestId)}`);
    const body = await response.json().catch(() => null);

    if (response.status === 404) {
      showError("This link may be incomplete or no longer valid.");
      return;
    }
    if (!response.ok) {
      showError(body?.error || "Could not load this project.");
      return;
    }

    pillEl.textContent = body.status_label;
    pillEl.dataset.status = body.status;
    setText("field-name", body.name);
    setText("field-email", body.email);
    setText("field-company", body.company);
    setText("field-site", body.site);
    setText("field-project-type", body.project_type_label);
    setText("field-square-footage", body.square_footage_label);
    setText("field-timeline", body.timeline_label);
    setText("field-budget", body.budget_label);
    setText("field-created", formatDate(body.created_at));
    setText("field-message", body.message);

    loadingEl.hidden = true;
    errorEl.hidden = true;
    viewEl.hidden = false;
  } catch {
    showError("Could not load this project. Try again in a moment.");
  }
}

loadRequest();
