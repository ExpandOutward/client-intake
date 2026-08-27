const form = document.getElementById("intake-form");
const pageIntro = document.getElementById("page-intro");
const thanks = document.getElementById("thanks");
const errorEl = document.getElementById("form-error");
const statusLink = document.getElementById("status-link");
const submitBtn = document.getElementById("submit-btn");
const copyBtn = document.getElementById("copy-link");
const copyNote = document.getElementById("copy-note");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMIT_LABEL = "Request a site visit";

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const data = Object.fromEntries(new FormData(form));
  const name = data.name.trim();
  const email = data.email.trim();
  const company = data.company.trim();
  const site = data.site.trim();
  const projectType = data.project_type;
  const squareFootage = data.square_footage;
  const timeline = data.timeline;
  const budget = data.budget;
  const message = data.message.trim();

  if (!name || !email || !company || !message || !projectType) {
    showError("Name, email, business name, work type, and a short description are required.");
    return;
  }
  if (!EMAIL_RE.test(email)) {
    showError("Enter a valid email address.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  try {
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        company,
        site,
        project_type: projectType,
        square_footage: squareFootage,
        timeline,
        budget,
        message,
      }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      showError(body?.error || "Could not send your request. Try again.");
      return;
    }

    statusLink.href = body.status_url;
    form.hidden = true;
    pageIntro.hidden = true;
    thanks.hidden = false;
  } catch {
    showError("Could not send your request. Try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = SUBMIT_LABEL;
  }
});

copyBtn.addEventListener("click", async () => {
  const url = new URL(statusLink.href, window.location.origin).toString();
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt("Copy this status link:", url);
  }
  copyNote.hidden = false;
});
