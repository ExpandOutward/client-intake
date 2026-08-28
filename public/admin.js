const KEY_STORAGE = "admin-key";

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const signOutBtn = document.getElementById("sign-out");
const jobList = document.getElementById("job-list");
const boardEmpty = document.getElementById("board-empty");
const boardError = document.getElementById("board-error");
const boardNote = document.getElementById("board-note");

function getKey() {
  return sessionStorage.getItem(KEY_STORAGE) || "";
}

function setKey(key) {
  sessionStorage.setItem(KEY_STORAGE, key);
}

function clearKey() {
  sessionStorage.removeItem(KEY_STORAGE);
}

function showNote(message) {
  boardNote.textContent = message;
  boardNote.hidden = !message;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function optionHtml(statuses, selected) {
  return statuses
    .map((status) => {
      const current = status.value === selected ? " selected" : "";
      return `<option value="${status.value}"${current}>${status.label}</option>`;
    })
    .join("");
}

function jobCard(request, statuses) {
  const article = document.createElement("article");
  article.className = "job-card";
  article.dataset.id = request.id;
  article.innerHTML = `
    <div class="job-head">
      <div>
        <h2>${escapeHtml(request.company)}</h2>
        <p class="hint">${escapeHtml(request.project_type_label)} · ${escapeHtml(request.site || "No jobsite given")}</p>
      </div>
      <label class="status-control">
        Status
        <select data-status-for="${request.id}">
          ${optionHtml(statuses, request.status)}
        </select>
      </label>
    </div>
    <dl class="facts">
      <div>
        <dt>Contact</dt>
        <dd>${escapeHtml(request.name)}</dd>
      </div>
      <div>
        <dt>Email</dt>
        <dd><a href="mailto:${escapeHtml(request.email)}">${escapeHtml(request.email)}</a></dd>
      </div>
      <div>
        <dt>Notify</dt>
        <dd>${
          request.notify_email
            ? `<a href="mailto:${escapeHtml(request.notify_email)}">${escapeHtml(request.notify_email)}</a>`
            : "—"
        }</dd>
      </div>
      <div>
        <dt>Size</dt>
        <dd>${escapeHtml(request.square_footage_label)}</dd>
      </div>
      <div>
        <dt>Start</dt>
        <dd>${escapeHtml(request.timeline_label)}</dd>
      </div>
      <div>
        <dt>Budget</dt>
        <dd>${escapeHtml(request.budget_label)}</dd>
      </div>
      <div>
        <dt>Submitted</dt>
        <dd>${escapeHtml(formatDate(request.created_at))}</dd>
      </div>
    </dl>
    <h3>About the space</h3>
    <p class="message">${escapeHtml(request.message)}</p>
    <div class="job-actions">
      <a href="/status.html?r=${encodeURIComponent(request.id)}" target="_blank" rel="noreferrer">Client status page</a>
      <button type="button" class="danger" data-delete="${request.id}">Remove</button>
    </div>
  `;
  return article;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function fetchJobs(key) {
  const response = await fetch("/api/admin/requests", {
    headers: { "X-Admin-Key": key },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function showLoggedOut() {
  loginForm.hidden = false;
  signOutBtn.hidden = true;
  jobList.hidden = true;
  jobList.innerHTML = "";
  boardEmpty.hidden = true;
  boardError.hidden = true;
  showNote("");
}

function showLoggedIn() {
  loginForm.hidden = true;
  signOutBtn.hidden = false;
}

async function loadBoard(key) {
  boardError.hidden = true;
  const { response, body } = await fetchJobs(key);
  if (response.status === 401 || response.status === 503) {
    clearKey();
    showLoggedOut();
    loginError.textContent = body?.error || "Could not sign in.";
    loginError.hidden = false;
    return false;
  }
  if (!response.ok) {
    boardError.textContent = body?.error || "Could not load jobs.";
    boardError.hidden = false;
    return false;
  }

  showLoggedIn();
  const requests = body.requests || [];
  const statuses = body.statuses || [];
  jobList.innerHTML = "";
  if (!requests.length) {
    boardEmpty.hidden = false;
    jobList.hidden = true;
    return true;
  }

  boardEmpty.hidden = true;
  jobList.hidden = false;
  for (const request of requests) {
    jobList.append(jobCard(request, statuses));
  }
  return true;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const key = new FormData(loginForm).get("key").trim();
  if (!key) {
    loginError.textContent = "Enter the password.";
    loginError.hidden = false;
    return;
  }

  const ok = await loadBoard(key);
  if (ok) setKey(key);
});

signOutBtn.addEventListener("click", () => {
  clearKey();
  showLoggedOut();
});

jobList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-delete]");
  if (!button) return;

  const id = button.getAttribute("data-delete");
  const company = button.closest(".job-card")?.querySelector("h2")?.textContent || "this job";
  if (!window.confirm(`Remove ${company}? The client's status link will stop working.`)) {
    return;
  }

  const key = getKey();
  button.disabled = true;
  showNote("");

  try {
    const response = await fetch(`/api/requests/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "X-Admin-Key": key },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      showNote(body?.error || "Could not remove this job.");
      button.disabled = false;
      return;
    }
    showNote("Job removed.");
    await loadBoard(key);
  } catch {
    showNote("Could not remove this job.");
    button.disabled = false;
  }
});

jobList.addEventListener("change", async (event) => {
  const select = event.target.closest("select[data-status-for]");
  if (!select) return;

  const id = select.getAttribute("data-status-for");
  const key = getKey();
  select.disabled = true;
  showNote("");

  try {
    const response = await fetch(`/api/requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": key,
      },
      body: JSON.stringify({ status: select.value }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      showNote(body?.error || "Could not update status.");
      await loadBoard(key);
      return;
    }
    showNote(`Saved as ${body.status_label}. A status email will go out to the client.`);
  } catch {
    showNote("Could not update status.");
  } finally {
    select.disabled = false;
  }
});

if (getKey()) {
  loadBoard(getKey());
}
