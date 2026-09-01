const KEY_STORAGE = "admin-key";
const PAGE_SIZE = 10;
const RECENT_LIMIT = 2;

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const adminActions = document.getElementById("admin-actions");
const backupBtn = document.getElementById("backup-jobs");
const restoreBtn = document.getElementById("restore-jobs");
const restoreFile = document.getElementById("restore-file");
const resetDemoBtn = document.getElementById("reset-demo");
const signOutBtn = document.getElementById("sign-out");
const boardTools = document.getElementById("board-tools");
const searchForm = document.getElementById("search-form");
const jobSearch = document.getElementById("job-search");
const listAllBtn = document.getElementById("list-all");
const jobSort = document.getElementById("job-sort");
const jobStatusFilter = document.getElementById("job-status-filter");
const jobList = document.getElementById("job-list");
const boardSummary = document.getElementById("board-summary");
const boardEmpty = document.getElementById("board-empty");
const boardError = document.getElementById("board-error");
const boardNote = document.getElementById("board-note");
const boardPager = document.getElementById("board-pager");
const pagerStatus = document.getElementById("pager-status");
const pagerPrev = document.getElementById("pager-prev");
const pagerNext = document.getElementById("pager-next");

const boardState = {
  mode: "recent",
  q: "",
  sort: "newest",
  status: "",
  offset: 0,
};

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

function resetBoardState() {
  boardState.mode = "recent";
  boardState.q = "";
  boardState.sort = "newest";
  boardState.status = "";
  boardState.offset = 0;
  jobSearch.value = "";
  jobSort.value = "newest";
  jobStatusFilter.value = "";
}

function fillStatusFilter(statuses) {
  if (jobStatusFilter.dataset.ready === "1") {
    jobStatusFilter.value = boardState.status;
    return;
  }
  jobStatusFilter.innerHTML = `<option value="">Any status</option>${optionHtml(statuses, boardState.status)}`;
  jobStatusFilter.dataset.ready = "1";
}

function listParams() {
  const params = new URLSearchParams();
  params.set("sort", boardState.sort);
  if (boardState.status) params.set("status", boardState.status);
  if (boardState.mode === "recent") {
    params.set("limit", String(RECENT_LIMIT));
    params.set("offset", "0");
    return params;
  }

  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(boardState.offset));
  if (boardState.mode === "search" && boardState.q) {
    params.set("q", boardState.q);
  }
  return params;
}

async function fetchJobs(key) {
  const response = await fetch(`/api/admin/requests?${listParams()}`, {
    headers: { "X-Admin-Key": key },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function showSummary(message) {
  boardSummary.textContent = message;
  boardSummary.hidden = !message;
}

function emptyMessage() {
  if (boardState.mode === "search") return "No jobs matched that search.";
  if (boardState.status) return "No jobs with that status.";
  return "No requests yet.";
}

function updatePager(total, shown) {
  if (boardState.mode === "recent") {
    boardPager.hidden = true;
    pagerStatus.textContent = "";
    if (total > shown) {
      showSummary(
        `Showing the ${shown} most recent jobs. Search or list all to browse the rest.`,
      );
    } else {
      showSummary("");
    }
    return;
  }

  const start = total === 0 || shown === 0 ? 0 : boardState.offset + 1;
  const end = boardState.offset + shown;
  const label =
    boardState.mode === "search"
      ? `Showing ${start}–${end} of ${total} matches`
      : `Showing ${start}–${end} of ${total}`;
  pagerStatus.textContent = total === 0 ? "" : label;
  const multiPage = total > PAGE_SIZE;
  pagerPrev.disabled = boardState.offset <= 0;
  pagerNext.disabled = boardState.offset + shown >= total;
  pagerPrev.hidden = !multiPage;
  pagerNext.hidden = !multiPage;
  boardPager.hidden = total === 0;
  showSummary("");
}

function showLoggedOut() {
  loginForm.hidden = false;
  adminActions.hidden = true;
  boardTools.hidden = true;
  boardPager.hidden = true;
  jobList.hidden = true;
  jobList.innerHTML = "";
  boardEmpty.hidden = true;
  boardError.hidden = true;
  showSummary("");
  showNote("");
  resetBoardState();
}

function showLoggedIn() {
  loginForm.hidden = true;
  adminActions.hidden = false;
  boardTools.hidden = false;
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
  const total = body.total ?? requests.length;
  fillStatusFilter(statuses);

  if (
    !requests.length &&
    boardState.mode !== "recent" &&
    boardState.offset > 0 &&
    total > 0
  ) {
    boardState.offset = Math.max(0, boardState.offset - PAGE_SIZE);
    return loadBoard(key);
  }

  jobList.innerHTML = "";
  if (!requests.length) {
    boardEmpty.textContent = emptyMessage();
    boardEmpty.hidden = false;
    jobList.hidden = true;
    updatePager(total, 0);
    return true;
  }

  boardEmpty.hidden = true;
  jobList.hidden = false;
  for (const request of requests) {
    jobList.append(jobCard(request, statuses));
  }
  updatePager(total, requests.length);
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

  resetBoardState();
  const ok = await loadBoard(key);
  if (ok) setKey(key);
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const q = jobSearch.value.trim();
  if (!q) {
    showNote("Enter a company, contact name, or email to search.");
    jobSearch.focus();
    return;
  }

  boardState.mode = "search";
  boardState.q = q;
  boardState.offset = 0;
  showNote("");
  await loadBoard(getKey());
});

listAllBtn.addEventListener("click", async () => {
  boardState.mode = "all";
  boardState.offset = 0;
  showNote("");
  await loadBoard(getKey());
});

jobSort.addEventListener("change", async () => {
  boardState.sort = jobSort.value;
  if (boardState.mode === "recent") {
    boardState.mode = "all";
  }
  boardState.offset = 0;
  showNote("");
  await loadBoard(getKey());
});

jobStatusFilter.addEventListener("change", async () => {
  boardState.status = jobStatusFilter.value;
  if (boardState.mode === "recent") {
    boardState.mode = "all";
  }
  boardState.offset = 0;
  showNote("");
  await loadBoard(getKey());
});

pagerPrev.addEventListener("click", async () => {
  boardState.offset = Math.max(0, boardState.offset - PAGE_SIZE);
  await loadBoard(getKey());
});

pagerNext.addEventListener("click", async () => {
  boardState.offset += PAGE_SIZE;
  await loadBoard(getKey());
});

signOutBtn.addEventListener("click", () => {
  clearKey();
  showLoggedOut();
});

backupBtn.addEventListener("click", async () => {
  const key = getKey();
  backupBtn.disabled = true;
  showNote("");
  try {
    const response = await fetch("/api/admin/backup", {
      headers: { "X-Admin-Key": key },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      showNote(body?.error || "Could not create a backup.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const day = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `jobs-backup-${day}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showNote("Backup downloaded.");
  } catch {
    showNote("Could not create a backup.");
  } finally {
    backupBtn.disabled = false;
  }
});

restoreBtn.addEventListener("click", () => {
  restoreFile.click();
});

restoreFile.addEventListener("change", async () => {
  const file = restoreFile.files?.[0];
  restoreFile.value = "";
  if (!file) return;

  if (
    !window.confirm(
      "Restore from this file? All data will be overwritten. This cannot be undone, and no emails will be sent.",
    )
  ) {
    return;
  }

  const key = getKey();
  restoreBtn.disabled = true;
  showNote("");

  try {
    const csv = await file.text();
    const response = await fetch("/api/admin/restore", {
      method: "POST",
      headers: {
        "Content-Type": "text/csv",
        "X-Admin-Key": key,
      },
      body: csv,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      showNote(body?.error || "Could not restore from this file.");
      return;
    }
    showNote("Restore complete. All jobs were replaced from the backup. No emails were sent.");
    resetBoardState();
    await loadBoard(key);
  } catch {
    showNote("Could not restore from this file.");
  } finally {
    restoreBtn.disabled = false;
  }
});

resetDemoBtn.addEventListener("click", async () => {
  if (
    !window.confirm(
      "Reset the demo? All current jobs will be replaced with the two sample records. No emails will be sent.",
    )
  ) {
    return;
  }

  const key = getKey();
  resetDemoBtn.disabled = true;
  showNote("");

  try {
    const response = await fetch("/api/admin/reset", {
      method: "POST",
      headers: { "X-Admin-Key": key },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      showNote(body?.error || "Could not reset the demo.");
      return;
    }
    showNote("Demo reset. Two sample jobs are loaded. No emails were sent.");
    resetBoardState();
    await loadBoard(key);
  } catch {
    showNote("Could not reset the demo.");
  } finally {
    resetDemoBtn.disabled = false;
  }
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
    if (boardState.status && boardState.status !== body.status) {
      await loadBoard(key);
    }
  } catch {
    showNote("Could not update status.");
  } finally {
    select.disabled = false;
  }
});

if (getKey()) {
  loadBoard(getKey());
}
