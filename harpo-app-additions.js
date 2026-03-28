/**
 * ════════════════════════════════════════════════════════════════════════════
 * HARPO — app.js additions
 * Three insertion points. Each has a FIND string to locate it in app.js,
 * then ADD the block immediately after that line.
 * ════════════════════════════════════════════════════════════════════════════
 */


// ════════════════════════════════════════════════════════════════════════════
// INSERTION 1 OF 3 — CONSTANTS + DOM REFS + STATE FIELDS
//
// FIND this exact line in app.js:
//   const PREMIUM_SERVICE_CONCURRENCY_LABEL = "Concurrency Monitoring";
//
// ADD everything below immediately after that line:
// ════════════════════════════════════════════════════════════════════════════

const HARPO_MESSAGE_START  = "harpo:startRecording";
const HARPO_MESSAGE_STOP   = "harpo:stopRecording";
const HARPO_MESSAGE_STATUS = "harpo:recordingStatus";
const HARPO_STORAGE_PREFIX = "harpo:";
const HARPO_DOMAIN_PICKER_PLACEHOLDER = "__harpo_choose_domain__";

// ════════════════════════════════════════════════════════════════════════════
// INSERTION 2 OF 3 — DOM ELEMENT REFS + STATE FIELDS + EVENT HANDLERS
//
// FIND this exact line in app.js:
//   const logOutput = document.getElementById("logOutput");
//
// ADD everything below immediately after that line:
// ════════════════════════════════════════════════════════════════════════════

const harpoContainer        = document.getElementById("harpoContainer");
const harpoToggle           = document.getElementById("harpoToggle");
const harpoBody             = document.getElementById("harpoBody");
const harpoHarButton        = document.getElementById("harpoHarButton");
const harpoHarFileInput     = document.getElementById("harpoHarFileInput");
const harpoHarDropZone      = document.getElementById("harpoHarDropZone");
const harpoReproButton      = document.getElementById("harpoReproButton");
const harpoReproSection     = document.getElementById("harpoReproSection");
const harpoDomainPicker     = document.getElementById("harpoDomainPicker");
const harpoLaunchButton     = document.getElementById("harpoLaunchButton");
const harpoRecordingSection = document.getElementById("harpoRecordingSection");
const harpoStopButton       = document.getElementById("harpoStopButton");
const harpoCallCount        = document.getElementById("harpoCallCount");
const harpoStatus           = document.getElementById("harpoStatus");

// ════════════════════════════════════════════════════════════════════════════
// INSERTION 3 OF 3 — STATE FIELDS, EVENT HANDLERS, HELPER FUNCTIONS
//
// FIND this exact line in app.js (inside the state = { ... } object):
//   logs: []
//
// ADD these three fields before that line (inside the state object):
//
//   harpoExpanded: false,
//   harpoReproOpen: false,
//   harpoRecording: false,
//   harpoRecordingCount: 0,
//
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// EVENT HANDLERS — FIND this exact line in app.js:
//   void initialize();
//
// ADD this entire block immediately BEFORE that line:
// ════════════════════════════════════════════════════════════════════════════

// HARPO — collapsible toggle
if (harpoToggle) {
  harpoToggle.addEventListener("click", () => {
    state.harpoExpanded = !state.harpoExpanded;
    if (!state.harpoExpanded) state.harpoReproOpen = false;
    render();
  });
}

// HARPO — HAR button opens file picker
if (harpoHarButton) {
  harpoHarButton.addEventListener("click", () => {
    if (harpoHarFileInput) harpoHarFileInput.click();
  });
}

// HARPO — HAR file input change
if (harpoHarFileInput) {
  harpoHarFileInput.addEventListener("change", (event) => {
    const file = event.currentTarget?.files?.[0];
    if (file) void loadAndOpenHarFile(file);
    event.currentTarget.value = "";
  });
}

// HARPO — HAR drop zone
if (harpoHarDropZone) {
  harpoHarDropZone.addEventListener("dragover", (event) => {
    if (Array.from(event.dataTransfer?.types || []).includes("Files")) {
      event.preventDefault();
      harpoHarDropZone.classList.add("harpo-dropZone--active");
    }
  });
  harpoHarDropZone.addEventListener("dragleave", () => {
    harpoHarDropZone.classList.remove("harpo-dropZone--active");
  });
  harpoHarDropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    harpoHarDropZone.classList.remove("harpo-dropZone--active");
    const file = Array.from(event.dataTransfer?.files || []).find(
      (f) => f.name.endsWith(".har") || f.type === "application/json"
    );
    if (file) await loadAndOpenHarFile(file);
  });
  harpoHarDropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (harpoHarFileInput) harpoHarFileInput.click();
    }
  });
}

// HARPO — REPRO toggle
if (harpoReproButton) {
  harpoReproButton.addEventListener("click", () => {
    state.harpoReproOpen = !state.harpoReproOpen;
    render();
  });
}

// HARPO — domain picker enables LAUNCH
if (harpoDomainPicker) {
  harpoDomainPicker.addEventListener("change", () => {
    if (harpoLaunchButton) {
      harpoLaunchButton.disabled =
        !harpoDomainPicker.value ||
        harpoDomainPicker.value === HARPO_DOMAIN_PICKER_PLACEHOLDER;
    }
  });
}

// HARPO — LAUNCH starts recording
if (harpoLaunchButton) {
  harpoLaunchButton.addEventListener("click", async () => {
    const domain = harpoDomainPicker?.value;
    if (!domain || domain === HARPO_DOMAIN_PICKER_PLACEHOLDER) return;
    await harpoStartRecordingFromPanel(domain);
  });
}

// HARPO — STOP recording
if (harpoStopButton) {
  harpoStopButton.addEventListener("click", async () => {
    await harpoStopRecordingFromPanel();
  });
}

// ════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS — FIND this exact line in app.js:
//   function dragEventHasFiles(event) {
//
// ADD this entire block immediately BEFORE that function:
// ════════════════════════════════════════════════════════════════════════════

// ── HARPO: visibility gate ────────────────────────────────────────────────

function deriveHarpoSectionVisible(authenticatedDataContext = {}) {
  const items = Array.isArray(authenticatedDataContext?.premiumServiceItems)
    ? authenticatedDataContext.premiumServiceItems
    : [];
  const hasRestV2 = items.some(
    (item) => item?.requiredScope === "api:client:v2" || item?.serviceKey === "restV2"
  );
  return hasRestV2 && Boolean(authenticatedDataContext?.selectedProgrammer);
}

// ── HARPO: domain extraction ──────────────────────────────────────────────

function deriveHarpoDomains(authenticatedDataContext = {}) {
  const programmer = authenticatedDataContext?.selectedProgrammer;
  if (!programmer) return [];

  // Primary: raw.domains array on the programmer entity
  const rawDomains = Array.isArray(programmer?.raw?.domains)
    ? programmer.raw.domains
    : [];

  // Fallback: domains on associated channels/requestors
  const requestors = Array.isArray(authenticatedDataContext?.requestorOptions)
    ? authenticatedDataContext.requestorOptions
    : [];
  const channelDomains = requestors.flatMap((r) =>
    Array.isArray(r?.raw?.domains) ? r.raw.domains : []
  );

  const all = [...rawDomains, ...channelDomains]
    .map((d) => String(d || "").trim().toLowerCase().replace(/\/$/, ""))
    .filter((d) => d.length > 0);

  return [...new Set(all)].sort();
}

// ── HARPO: sync side panel section ───────────────────────────────────────

function syncHarpoSection(authenticatedDataContext = {}) {
  if (!harpoContainer) return;

  const visible = deriveHarpoSectionVisible(authenticatedDataContext);
  harpoContainer.hidden = !visible;
  if (!visible) return;

  // Sync toggle aria state
  if (harpoToggle) {
    harpoToggle.setAttribute("aria-expanded", state.harpoExpanded ? "true" : "false");
  }
  if (harpoBody) {
    harpoBody.hidden = !state.harpoExpanded;
  }
  if (!state.harpoExpanded) return;

  // Recording mode
  if (state.harpoRecording) {
    if (harpoReproSection) harpoReproSection.hidden = true;
    if (harpoRecordingSection) harpoRecordingSection.hidden = false;
    if (harpoCallCount) harpoCallCount.textContent = String(state.harpoRecordingCount || 0);
    if (harpoHarButton) harpoHarButton.disabled = true;
    if (harpoReproButton) harpoReproButton.disabled = true;
    return;
  }

  // Normal mode
  if (harpoRecordingSection) harpoRecordingSection.hidden = true;
  if (harpoHarButton) harpoHarButton.disabled = false;
  if (harpoReproButton) harpoReproButton.disabled = false;
  if (harpoReproSection) harpoReproSection.hidden = !state.harpoReproOpen;

  // Populate domain picker when REPRO is open
  if (state.harpoReproOpen && harpoDomainPicker) {
    const domains = deriveHarpoDomains(authenticatedDataContext);
    const sig = domains.join("|");
    if (harpoDomainPicker.dataset.domainSig !== sig) {
      harpoDomainPicker.innerHTML = "";
      const ph = document.createElement("option");
      ph.value = HARPO_DOMAIN_PICKER_PLACEHOLDER;
      ph.textContent = domains.length > 0 ? "Choose a domain…" : "No domains configured";
      harpoDomainPicker.appendChild(ph);
      domains.forEach((domain) => {
        const opt = document.createElement("option");
        opt.value = domain;
        opt.textContent = domain;
        harpoDomainPicker.appendChild(opt);
      });
      harpoDomainPicker.dataset.domainSig = sig;
      harpoDomainPicker.value = HARPO_DOMAIN_PICKER_PLACEHOLDER;
      if (harpoLaunchButton) harpoLaunchButton.disabled = true;
    }
    harpoDomainPicker.disabled = state.busy || domains.length === 0;
  }
}

// ── HARPO: open HAR file ──────────────────────────────────────────────────

async function loadAndOpenHarFile(file) {
  if (!file) return;
  setHarpoStatus(`Reading ${file.name}…`);
  try {
    const text = await file.text();
    const har = parseJsonText(text, null);
    if (!har?.log) throw new Error("Not a valid HAR file — missing .log");
    await openHarpoWorkspace(har, { source: "file", fileName: file.name });
    setHarpoStatus(`Opened ${file.name}`, { ok: true });
  } catch (err) {
    setHarpoStatus(`Failed: ${serializeError(err)}`, { error: true });
  }
}

// ── HARPO: open workspace tab ─────────────────────────────────────────────

async function openHarpoWorkspace(har, { source = "file", fileName = "", programmerName = "" } = {}) {
  const key = `${HARPO_STORAGE_PREFIX}${randomToken()}`;
  const selectedProgrammer = resolveSelectedProgrammer(
    state.session?.console?.programmers || [],
    state.selectedProgrammerId
  );
  const pName =
    programmerName ||
    firstNonEmptyString([selectedProgrammer?.name, selectedProgrammer?.id, ""]);

  await chrome.storage.session.set({
    [key]: {
      har,
      source,
      fileName,
      programmerName: pName,
      createdAt: new Date().toISOString()
    }
  });

  const workspaceUrl = chrome.runtime.getURL(`harpo.html#${key}`);
  await chrome.tabs.create({ url: workspaceUrl });
}

// ── HARPO: start recording via background ────────────────────────────────

async function harpoStartRecordingFromPanel(domain) {
  if (state.harpoRecording) return;
  setHarpoStatus("Starting recording…");
  try {
    const domainUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    const selectedProgrammer = resolveSelectedProgrammer(
      state.session?.console?.programmers || [],
      state.selectedProgrammerId
    );
    const response = await chrome.runtime.sendMessage({
      type: HARPO_MESSAGE_START,
      url: domainUrl,
      programmerName: firstNonEmptyString([selectedProgrammer?.name, state.selectedProgrammerId, ""])
    });
    if (!response?.ok) throw new Error(response?.error || "Failed to start recording.");
    state.harpoRecording = true;
    state.harpoRecordingCount = 0;
    setHarpoStatus("");
    render();
    harpoStartCountPoll();
  } catch (err) {
    setHarpoStatus(`Could not start: ${serializeError(err)}`, { error: true });
  }
}

// ── HARPO: stop recording via background ─────────────────────────────────

async function harpoStopRecordingFromPanel() {
  if (!state.harpoRecording) return;
  harpoStopCountPoll();
  setHarpoStatus("Stopping…");
  try {
    const response = await chrome.runtime.sendMessage({ type: HARPO_MESSAGE_STOP });
    state.harpoRecording = false;
    state.harpoRecordingCount = 0;
    state.harpoReproOpen = false;
    render();
    if (response?.ok) {
      setHarpoStatus(`Done — ${response.entryCount || 0} calls. Opening workspace…`, { ok: true });
    } else {
      throw new Error(response?.error || "Stop failed.");
    }
  } catch (err) {
    state.harpoRecording = false;
    setHarpoStatus(`Stop failed: ${serializeError(err)}`, { error: true });
    render();
  }
}

// ── HARPO: polling for live call count ────────────────────────────────────

let harpoCountPollTimer = 0;

function harpoStartCountPoll() {
  harpoStopCountPoll();
  harpoCountPollTimer = window.setInterval(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: HARPO_MESSAGE_STATUS });
      if (response?.recording) {
        state.harpoRecordingCount = Number(response.count || 0);
        if (harpoCallCount) harpoCallCount.textContent = String(state.harpoRecordingCount);
      } else if (state.harpoRecording) {
        state.harpoRecording = false;
        harpoStopCountPoll();
        render();
      }
    } catch {
      // ignore poll errors
    }
  }, 1500);
}

function harpoStopCountPoll() {
  if (harpoCountPollTimer) {
    window.clearInterval(harpoCountPollTimer);
    harpoCountPollTimer = 0;
  }
}

// ── HARPO: status line helper ─────────────────────────────────────────────

function setHarpoStatus(message, { ok = false, error = false } = {}) {
  if (!harpoStatus) return;
  harpoStatus.textContent = String(message || "");
  harpoStatus.hidden = !message;
  harpoStatus.className = "spectrum-Body spectrum-Body--sizeS harpo-status";
  if (error) harpoStatus.classList.add("harpo-status--error");
  if (ok)    harpoStatus.classList.add("harpo-status--ok");
}

// ════════════════════════════════════════════════════════════════════════════
// RENDER WIRING — FIND this exact line in app.js:
//   syncAuthenticatedFieldGroups();
//
// ADD the single line below immediately AFTER it:
//   syncHarpoSection(authenticatedDataContext);
//
// The variable authenticatedDataContext is already in scope at that call site.
// ════════════════════════════════════════════════════════════════════════════
