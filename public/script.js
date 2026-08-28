const form = document.getElementById("intake-form");
const intakeFields = document.getElementById("intake-fields");
const pageIntro = document.getElementById("page-intro");
const thanks = document.getElementById("thanks");
const errorEl = document.getElementById("form-error");
const statusLink = document.getElementById("status-link");
const submitBtn = document.getElementById("submit-btn");
const copyBtn = document.getElementById("copy-link");
const copyNote = document.getElementById("copy-note");
const accessPanel = document.getElementById("access-panel");
const accessLocked = document.getElementById("access-locked");
const accessForm = document.getElementById("access-form");
const accessError = document.getElementById("access-error");
const accessBtn = document.getElementById("access-btn");
const accessContact = document.getElementById("access-contact");
const accessBar = document.getElementById("access-bar");
const accessSignOut = document.getElementById("access-sign-out");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMIT_LABEL = "Request a site visit";

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function setIntakeLocked(locked) {
  intakeFields.disabled = locked;
  form.classList.toggle("locked", locked);
  for (const el of intakeFields.querySelectorAll("input, select, textarea, button")) {
    el.disabled = locked;
  }
}

function setContact(contactEmail) {
  if (!contactEmail) {
    accessContact.hidden = true;
    return;
  }
  accessContact.replaceChildren();
  accessContact.append("Want a login? Email ");
  const link = document.createElement("a");
  link.href = `mailto:${contactEmail}?subject=${encodeURIComponent("Demo access for the intake app")}`;
  link.textContent = contactEmail;
  accessContact.append(link);
  accessContact.append(".");
  accessContact.hidden = false;
}

function lockForm(contactEmail) {
  setIntakeLocked(true);
  form.hidden = false;
  pageIntro.hidden = false;
  thanks.hidden = true;
  accessPanel.hidden = false;
  accessLocked.hidden = false;
  accessBar.hidden = true;
  setContact(contactEmail);
}

function unlockForm() {
  setIntakeLocked(false);
  form.hidden = false;
  pageIntro.hidden = false;
  accessLocked.hidden = true;
  accessBar.hidden = false;
  accessPanel.hidden = false;
}

function openForm() {
  setIntakeLocked(false);
  accessPanel.hidden = true;
}

async function loadAccessState() {
  const config = await fetch("/api/public-config").then((res) => res.json());
  if (!config.access_required) {
    openForm();
    return;
  }

  const session = await fetch("/api/access");
  if (session.ok) {
    unlockForm();
    return;
  }

  lockForm(config.contact_email);
}

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessError.hidden = true;
  const password = new FormData(accessForm).get("password");
  accessBtn.disabled = true;
  try {
    const response = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      accessError.textContent = body?.error || "That login is not valid.";
      accessError.hidden = false;
      return;
    }
    accessForm.reset();
    unlockForm();
  } catch {
    accessError.textContent = "Could not sign in. Try again.";
    accessError.hidden = false;
  } finally {
    accessBtn.disabled = false;
  }
});

accessSignOut.addEventListener("click", async () => {
  await fetch("/api/access/logout", { method: "POST" });
  const config = await fetch("/api/public-config").then((res) => res.json());
  lockForm(config.contact_email);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (intakeFields.disabled) return;
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
    if (response.status === 401) {
      const config = await fetch("/api/public-config").then((res) => res.json());
      lockForm(config.contact_email);
      return;
    }
    if (!response.ok) {
      showError(body?.error || "Could not send your request. Try again.");
      return;
    }

    statusLink.href = body.status_url;
    form.hidden = true;
    pageIntro.hidden = true;
    accessPanel.hidden = true;
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

loadAccessState().catch(() => {
  showError("Could not load the form. Refresh and try again.");
});
