import {
  clearLoginButtonVault,
  deleteProgrammerVaultRecord,
  exportLoginButtonVaultSnapshot,
  getLoginButtonVaultStats,
  importLoginButtonVaultSnapshot,
  readProgrammerVaultRecord
} from "./vault.js"

import { harpoIdbPut } from "./harpo-idb.js"
import {
  createHarpoCaptureSession,
  deriveHarpoProgrammerDomains,
  evaluateHarpoCaptureSession,
  updateHarpoCaptureSessionFromRequest,
  updateHarpoCaptureSessionFromResponse
} from "./harpo-capture.js"
import { getHarpoTrafficHostname, isHarpoAdobeTraffic, isHarpoPhysicalAssetTraffic } from "./harpo-traffic.js"

const LOGINBUTTON_VAULT_REQUEST_TYPE = "loginbutton:vault"
const LOGINBUTTON_GET_UPDATE_STATE_REQUEST_TYPE = "loginbutton:getUpdateState"
const LOGINBUTTON_GET_LATEST_REQUEST_TYPE = "loginbutton:getLatest"
const LOGINBUTTON_GITHUB_OWNER = "HH5HH"
const LOGINBUTTON_GITHUB_REPO = "LOGINBUTTON"
const LOGINBUTTON_LATEST_REF_API_URL = `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/git/ref/heads/main`
const LOGINBUTTON_LATEST_COMMIT_API_URL = `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/commits/main`
const LOGINBUTTON_PACKAGE_METADATA_PATH = "loginbutton_distro.version.json"
const LOGINBUTTON_LATEST_PACKAGE_METADATA_URL = `https://raw.githubusercontent.com/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/main/${LOGINBUTTON_PACKAGE_METADATA_PATH}`
const LOGINBUTTON_LATEST_PACKAGE_METADATA_API_URL = `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/contents/${LOGINBUTTON_PACKAGE_METADATA_PATH}?ref=main`
const LOGINBUTTON_LATEST_PACKAGE_URL = `https://raw.githubusercontent.com/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/main/loginbutton_distro.zip`
const LOGINBUTTON_LOCAL_PACKAGE_PATH = "loginbutton_distro.zip"
const CHROME_EXTENSIONS_URL = "chrome://extensions"
const UPDATE_CHECK_TTL_MS = 10 * 60 * 1000

// ─── HARPO constants ─────────────────────────────────────────────────────────

const HARPO_MESSAGE_START   = "harpo:startRecording"
const HARPO_MESSAGE_STOP    = "harpo:stopRecording"
const HARPO_MESSAGE_STATUS  = "harpo:recordingStatus"
const HARPO_STORAGE_PREFIX  = "harpo:"
const HARPO_HAR_VERSION     = "1.2"
const HARPO_KEEPALIVE_ALARM = "harpo-keepalive"

// Resource types where response bodies are skipped (binary / irrelevant)
const HARPO_SKIP_BODY_TYPES = new Set([
  "Image", "Font", "Stylesheet", "Manifest", "Media", "WebSocket", "Ping", "Preflight"
])

const HARPO_BODY_FETCH_CONCURRENCY = 6  // parallel body fetches

// ─── HARPO recorder state ─────────────────────────────────────────────────────

// HARPO capture contract:
// 1. Before Adobe Pass is engaged, keep only programmer-safe traffic.
// 2. Once the Adobe SAMLAssertionConsumer response appears, open the external
//    redirect window and keep Adobe plus the full MVPD redirect/auth traffic chain.
// 3. Extend that chain from redirect response headers
//    until the browser lands back on a known programmer document.
// 4. Stop automatically after logout is detected, or when the user presses Stop.

const harpoState = {
  recording:         false,
  captureSession:    createHarpoCaptureSession(),
  rootTabId:         null,
  tabIds:            new Set(),
  sessionKey:        "",
  programmerName:    "",
  requestorId:       "",
  requestorName:     "",
  programmerDomains: [],
  safeDomains:       [],
  startedAt:         null,
  stopRequested:     false,
  autoStopTimer:     null,
  observedRequests:  new Map(),
  pendingRequestExtras: new Map(),
  pendingRequests:   new Map(),
  pendingResponses:  new Map(),
  completedObservedRequests: new Map(),
  entries:           []
}

// ─── Update state ─────────────────────────────────────────────────────────────

const updateState = {
  currentVersion:  "",
  latestVersion:   "",
  latestCommitSha: "",
  updateAvailable: false,
  lastCheckedAt:   0,
  checkError:      "",
  inFlight:        null
}

// ─── Side panel ───────────────────────────────────────────────────────────────

async function syncSidePanelBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) return
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }) } catch { }
}

// ─── Version helpers ──────────────────────────────────────────────────────────

function getLoginButtonBuildVersion() {
  return String(chrome.runtime.getManifest()?.version || "").trim()
}

function parseVersionPart(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function compareVersions(a, b) {
  const aParts = String(a || "").split(".")
  const bParts = String(b || "").split(".")
  const length = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < length; i++) {
    const aPart = parseVersionPart(aParts[i])
    const bPart = parseVersionPart(bParts[i])
    if (aPart > bPart) return 1
    if (aPart < bPart) return -1
  }
  return 0
}

function extractVersionFromManifestObject(manifest) {
  const version = manifest?.version ? String(manifest.version).trim() : ""
  if (!version) throw new Error("Latest version unavailable")
  return version
}

function normalizeCommitSha(value) {
  const sha = String(value || "").trim().toLowerCase()
  return /^[a-f0-9]{40}$/.test(sha) ? sha : ""
}

function buildLatestLoginButtonPackageMetadataRawUrl(ref = "") {
  const r = normalizeCommitSha(ref)
  return r
    ? `https://raw.githubusercontent.com/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/${r}/${LOGINBUTTON_PACKAGE_METADATA_PATH}`
    : LOGINBUTTON_LATEST_PACKAGE_METADATA_URL
}

function buildLatestLoginButtonPackageMetadataApiUrl(ref = "") {
  const r = normalizeCommitSha(ref)
  return r
    ? `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/contents/${LOGINBUTTON_PACKAGE_METADATA_PATH}?ref=${r}`
    : LOGINBUTTON_LATEST_PACKAGE_METADATA_API_URL
}

async function fetchLatestLoginButtonVersionFromRaw(ref = "") {
  const response = await fetch(buildLatestLoginButtonPackageMetadataRawUrl(ref), { cache: "no-store" })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return extractVersionFromManifestObject(await response.json())
}

async function fetchLatestLoginButtonVersionFromGithubApi(ref = "") {
  const response = await fetch(buildLatestLoginButtonPackageMetadataApiUrl(ref), { cache: "no-store" })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = await response.json()
  const encoded = payload?.content ? String(payload.content).replace(/\s+/g, "") : ""
  if (!encoded) throw new Error("GitHub API content unavailable")
  try { return extractVersionFromManifestObject(JSON.parse(atob(encoded))) }
  catch { throw new Error("GitHub API manifest decode failed") }
}

async function fetchLatestLoginButtonVersion(ref = "") {
  const r = normalizeCommitSha(ref)
  const resolvers = r
    ? [
        () => fetchLatestLoginButtonVersionFromRaw(r),
        () => fetchLatestLoginButtonVersionFromGithubApi(r),
        () => fetchLatestLoginButtonVersionFromGithubApi(),
        () => fetchLatestLoginButtonVersionFromRaw()
      ]
    : [fetchLatestLoginButtonVersionFromGithubApi, fetchLatestLoginButtonVersionFromRaw]
  let lastError = null
  for (const resolver of resolvers) {
    try { return await resolver() } catch (error) { lastError = error }
  }
  throw lastError || new Error("Latest version unavailable")
}

function extractCommitShaFromRefPayload(payload)    { return normalizeCommitSha(payload?.object?.sha) }
function extractCommitShaFromCommitPayload(payload) { return normalizeCommitSha(payload?.sha) }

async function fetchLatestLoginButtonCommitShaFromRefApi() {
  const response = await fetch(LOGINBUTTON_LATEST_REF_API_URL, { cache: "no-store" })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const sha = extractCommitShaFromRefPayload(await response.json())
  if (!sha) throw new Error("Git ref API commit SHA unavailable")
  return sha
}

async function fetchLatestLoginButtonCommitShaFromCommitApi() {
  const response = await fetch(LOGINBUTTON_LATEST_COMMIT_API_URL, { cache: "no-store" })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const sha = extractCommitShaFromCommitPayload(await response.json())
  if (!sha) throw new Error("Commit API SHA unavailable")
  return sha
}

async function fetchLatestLoginButtonCommitSha() {
  let lastError = null
  for (const resolver of [fetchLatestLoginButtonCommitShaFromRefApi, fetchLatestLoginButtonCommitShaFromCommitApi]) {
    try { return await resolver() } catch (error) { lastError = error }
  }
  throw lastError || new Error("Latest commit SHA unavailable")
}

function withCacheBust(url) {
  const text = String(url || "").trim()
  if (!text) return ""
  const value = `cacheBust=${Date.now()}`
  return text.includes("?") ? `${text}&${value}` : `${text}?${value}`
}

function buildLatestLoginButtonPackageUrl(commitSha = "") {
  const sha = normalizeCommitSha(commitSha)
  const baseUrl = sha
    ? `https://raw.githubusercontent.com/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/${sha}/loginbutton_distro.zip`
    : LOGINBUTTON_LATEST_PACKAGE_URL
  return withCacheBust(baseUrl)
}

function buildLocalLoginButtonPackageUrl() {
  try {
    const runtimeUrl = chrome.runtime?.getURL ? chrome.runtime.getURL(LOGINBUTTON_LOCAL_PACKAGE_PATH) : ""
    return withCacheBust(runtimeUrl)
  } catch { return "" }
}

function shouldPreferLocalLoginButtonPackage(currentVersion = "", latestVersion = "") {
  const c = String(currentVersion || "").trim()
  const l = String(latestVersion || "").trim()
  if (!c || !l) return false
  return compareVersions(c, l) >= 0
}

function buildLatestLoginButtonPackageFileName(version = "", commitSha = "") {
  const v = String(version || "").trim()
  const sha = normalizeCommitSha(commitSha)
  const suffix = sha ? `-${sha.slice(0, 7)}` : ""
  return v ? `loginbutton-${v}${suffix}.zip` : `loginbutton-latest${suffix}.zip`
}

async function startLatestPackageDownload({ url, filename, conflictAction = "uniquify", saveAs = false }) {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (fn, value) => { if (settled) return; settled = true; fn(value) }
    try {
      const maybePromise = chrome.downloads.download({ url, filename, conflictAction, saveAs }, (downloadId) => {
        const err = chrome.runtime?.lastError
        if (err) { settle(reject, new Error(err.message || "Chrome downloads API failed")); return }
        settle(resolve, downloadId)
      })
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then((id) => settle(resolve, id), (err) => settle(reject, err))
      }
    } catch (error) {
      settle(reject, error instanceof Error ? error : new Error(String(error || "Chrome downloads API failed")))
    }
  })
}

function getUpdateStatePayload() {
  return {
    currentVersion:  updateState.currentVersion || getLoginButtonBuildVersion(),
    latestVersion:   updateState.latestVersion || "",
    latestCommitSha: updateState.latestCommitSha || "",
    updateAvailable: updateState.updateAvailable === true,
    checkedAt:       Number(updateState.lastCheckedAt || 0),
    checkError:      updateState.checkError || ""
  }
}

async function refreshUpdateState(options = {}) {
  const force = options?.force === true
  const now = Date.now()
  const currentVersion = getLoginButtonBuildVersion()
  updateState.currentVersion = currentVersion

  if (!force && updateState.lastCheckedAt && now - updateState.lastCheckedAt < UPDATE_CHECK_TTL_MS) {
    return { ...getUpdateStatePayload(), changed: false }
  }
  if (updateState.inFlight) return updateState.inFlight

  updateState.inFlight = (async () => {
    const previous = {
      latestVersion:   updateState.latestVersion,
      latestCommitSha: updateState.latestCommitSha,
      updateAvailable: updateState.updateAvailable === true,
      checkError:      updateState.checkError
    }
    try {
      const latestCommitSha = await fetchLatestLoginButtonCommitSha().catch(() => "")
      const latestVersion = await fetchLatestLoginButtonVersion(latestCommitSha)
      updateState.latestVersion   = latestVersion
      updateState.latestCommitSha = normalizeCommitSha(latestCommitSha)
      updateState.updateAvailable = compareVersions(currentVersion, latestVersion) < 0
      updateState.checkError      = ""
    } catch (error) {
      updateState.latestVersion   = previous.latestVersion || ""
      updateState.latestCommitSha = previous.latestCommitSha || ""
      updateState.updateAvailable = previous.updateAvailable === true
      updateState.checkError      = error instanceof Error ? error.message : "Version check failed"
    } finally {
      updateState.lastCheckedAt = Date.now()
      updateState.inFlight      = null
    }
    const payload = getUpdateStatePayload()
    const changed =
      previous.latestVersion   !== updateState.latestVersion   ||
      previous.latestCommitSha !== updateState.latestCommitSha ||
      previous.updateAvailable !== (updateState.updateAvailable === true) ||
      previous.checkError      !== updateState.checkError
    return { ...payload, changed }
  })()

  return updateState.inFlight
}

async function openLoginButtonGetLatestFlow() {
  await refreshUpdateState({ force: true }).catch(() => {})
  const currentVersion     = getLoginButtonBuildVersion()
  const useFresh           = !updateState.checkError
  const latestVersion      = useFresh ? updateState.latestVersion || "" : ""
  const latestCommitSha    = useFresh ? updateState.latestCommitSha || "" : ""
  const preferLocal        = shouldPreferLocalLoginButtonPackage(currentVersion, latestVersion)
  const downloadUrl        = preferLocal ? buildLocalLoginButtonPackageUrl() : buildLatestLoginButtonPackageUrl(latestCommitSha)
  const downloadFileName   = preferLocal
    ? buildLatestLoginButtonPackageFileName(currentVersion, "")
    : buildLatestLoginButtonPackageFileName(latestVersion, latestCommitSha)

  const result = {
    ok: false, downloadUrl, downloadFileName, currentVersion, latestVersion, latestCommitSha,
    updateAvailable: updateState.updateAvailable === true, checkError: updateState.checkError || "",
    downloadSource: preferLocal ? "local-runtime" : "github-remote",
    downloadId: 0, downloadStarted: false, downloadTabOpened: false, extensionsOpened: false
  }

  try {
    if (!downloadUrl) throw new Error("No LoginButton package URL available")
    result.downloadId      = Number(await startLatestPackageDownload({ url: downloadUrl, filename: downloadFileName, conflictAction: "uniquify", saveAs: false }) || 0)
    result.downloadStarted = true
  } catch {
    try { await chrome.tabs.create({ url: downloadUrl }); result.downloadTabOpened = true } catch { }
  }

  try { await chrome.tabs.create({ url: CHROME_EXTENSIONS_URL }); result.extensionsOpened = true } catch { }
  result.ok = result.downloadStarted || result.downloadTabOpened
  if (!result.ok) {
    result.error = preferLocal
      ? `Loaded LoginButton v${currentVersion || "current"} is newer than GitHub latest v${latestVersion || "remote"}, but the local ${LOGINBUTTON_LOCAL_PACKAGE_PATH} package could not be opened.`
      : "Unable to open update links"
  }
  return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// HARPO — Service Worker keepalive via chrome.alarms
// chrome.alarms fires the SW every ~24 seconds during recording,
// preventing Chrome from killing the idle service worker.
// ═══════════════════════════════════════════════════════════════════════════════

function harpoStartKeepalive() {
  if (!chrome.alarms?.create) return
  chrome.alarms.create(HARPO_KEEPALIVE_ALARM, { periodInMinutes: 0.4 }) // fires ~every 24s
}

function harpoStopKeepalive() {
  if (!chrome.alarms?.clear) return
  chrome.alarms.clear(HARPO_KEEPALIVE_ALARM)
}

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    // No-op — waking the SW is the purpose. The alarm name identifies it as ours.
    if (alarm.name !== HARPO_KEEPALIVE_ALARM) return
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// HARPO — chrome.debugger event handler
// ═══════════════════════════════════════════════════════════════════════════════

function harpoNormalizeHeaders(headersObj = {}) {
  return Object.entries(headersObj || {}).map(([name, value]) => ({ name, value: String(value) }))
}

function harpoMergeHeaders(existingHeaders = [], nextHeaders = []) {
  const merged = new Map()
  ;[...(Array.isArray(existingHeaders) ? existingHeaders : []), ...(Array.isArray(nextHeaders) ? nextHeaders : [])]
    .forEach((header) => {
      const name = String(header?.name || "").trim()
      if (!name) return
      merged.set(name.toLowerCase(), { name, value: String(header?.value || "") })
    })
  return [...merged.values()]
}

function harpoNormalizeResponseRecord(response = {}, timestamp = 0) {
  return {
    status:            Number(response.status || 0),
    statusText:        response.statusText || "",
    headers:           harpoNormalizeHeaders(response.headers),
    mimeType:          response.mimeType || "",
    responseTime:      timestamp || 0,
    encodedDataLength: Number(response.encodedDataLength || 0)
  }
}

function harpoGetHeaderValue(headers = [], name = "") {
  const normalizedName = String(name || "").trim().toLowerCase()
  return (Array.isArray(headers) ? headers : []).find((header) =>
    String(header?.name || "").trim().toLowerCase() === normalizedName
  )?.value || ""
}

function harpoBuildRequestKey(tabId, requestId) {
  return `${Number(tabId || 0)}:${String(requestId || "")}`
}

function harpoBuildObservedBodyPromise(request = null, debuggeeId = 0, requestId = "") {
  const resourceType = String(request?.resourceType || "")
  if (HARPO_SKIP_BODY_TYPES.has(resourceType)) {
    return Promise.resolve({
      text: "",
      encoding: "",
      error: "Skipped body capture for binary or irrelevant resource type"
    })
  }

  return Promise.race([
    harpoFetchOneBody(debuggeeId, requestId),
    new Promise((resolve) => setTimeout(() => resolve({
      text: "",
      encoding: "",
      error: "Timed out while fetching response body"
    }), 4000))
  ]).catch(() => ({
    text: "",
    encoding: "",
    error: "Response body unavailable"
  }))
}

function harpoFinalizeCapturedRequest(requestKey, {
  requestId = "",
  endTime = 0,
  encodedDataLength = 0,
  bodyPromise = null,
  failed = false,
  errorText = "",
  responseOverride = null
} = {}) {
  const req = harpoState.pendingRequests.get(requestKey)
  if (!req) return false

  const resp = responseOverride || harpoState.pendingResponses.get(requestKey) || null
  const normalizedEndTime = Number(endTime || 0) || Number(req.startTime || 0)
  const entry = {
    tabId: req.tabId,
    requestKey,
    requestId: requestId || req.requestId,
    req,
    resp,
    endTime: normalizedEndTime,
    totalMs: Math.round((normalizedEndTime - (req.startTime || normalizedEndTime)) * 1000),
    encodedDataLength: Number(encodedDataLength || resp?.encodedDataLength || 0)
  }

  if (bodyPromise) {
    entry.bodyPromise = bodyPromise
  }
  if (failed) {
    entry.failed = true
    entry.errorText = String(errorText || "")
  }

  harpoState.entries.push(entry)
  harpoState.observedRequests.delete(requestKey)
  harpoState.pendingRequests.delete(requestKey)
  harpoState.pendingResponses.delete(requestKey)
  harpoState.pendingRequestExtras.delete(requestKey)
  harpoState.completedObservedRequests.delete(requestKey)
  harpoMaybeFinalizeAutoStop()
  return true
}

function harpoPromoteObservedRequest(requestKey) {
  const observedRequest = harpoState.observedRequests.get(requestKey)
  if (!observedRequest || harpoState.pendingRequests.has(requestKey)) {
    return false
  }

  const captureDecision = evaluateHarpoCaptureSession(
    harpoState.captureSession,
    observedRequest.url || "",
    {
      resourceType: observedRequest.resourceType || "Other",
      headers: observedRequest.headers,
      initiatorUrl: observedRequest.initiator?.url || "",
      documentUrl: observedRequest.documentUrl || ""
    }
  )
  harpoState.captureSession = captureDecision.nextSession
  if (!captureDecision.allowCapture) {
    return false
  }

  harpoState.pendingRequests.set(requestKey, observedRequest)
  harpoState.pendingRequestExtras.delete(requestKey)
  if (captureDecision.logoutTraffic && !captureDecision.nextSession.externalTrafficWindowOpen) {
    harpoRequestAutoStop()
  }
  if (captureDecision.returnedToProgrammerDomain && captureDecision.nextSession.logoutDetected) {
    harpoRequestAutoStop()
  }

  const completedObservedRequest = harpoState.completedObservedRequests.get(requestKey)
  if (completedObservedRequest) {
    harpoFinalizeCapturedRequest(requestKey, completedObservedRequest)
  }
  return true
}

function harpoPromoteObservedRequests() {
  let promoted = false
  let changed = true
  while (changed) {
    changed = false
    for (const requestKey of [...harpoState.observedRequests.keys()]) {
      if (harpoPromoteObservedRequest(requestKey)) {
        promoted = true
        changed = true
      }
    }
  }
  return promoted
}

function harpoPurgePendingEntriesForTab(tabId) {
  const normalizedTabId = Number(tabId || 0)
  for (const requestKey of [...harpoState.observedRequests.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.observedRequests.delete(requestKey)
    }
  }
  for (const requestKey of [...harpoState.pendingRequests.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.pendingRequests.delete(requestKey)
      harpoState.pendingResponses.delete(requestKey)
    }
  }
  for (const requestKey of [...harpoState.pendingRequestExtras.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.pendingRequestExtras.delete(requestKey)
    }
  }
  for (const requestKey of [...harpoState.completedObservedRequests.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.completedObservedRequests.delete(requestKey)
    }
  }
}

function harpoMergeResponseRecord(existingResponse = null, nextResponse = null) {
  const existingRecord =
    existingResponse && typeof existingResponse === "object" ? existingResponse : null
  const nextRecord =
    nextResponse && typeof nextResponse === "object" ? nextResponse : null

  if (!existingRecord) return nextRecord
  if (!nextRecord) return existingRecord

  return {
    ...existingRecord,
    ...nextRecord,
    status: Number(nextRecord.status || existingRecord.status || 0),
    statusText: nextRecord.statusText || existingRecord.statusText || "",
    headers: harpoMergeHeaders(existingRecord.headers, nextRecord.headers),
    mimeType: nextRecord.mimeType || existingRecord.mimeType || "",
    responseTime: nextRecord.responseTime || existingRecord.responseTime || 0,
    encodedDataLength: Number(nextRecord.encodedDataLength || existingRecord.encodedDataLength || 0)
  }
}

function harpoMatchesDomainList(url, domains = []) {
  const hostname = getHarpoTrafficHostname(url)
  if (!hostname) return false
  return (Array.isArray(domains) ? domains : []).some((domain) => {
    const normalizedDomain = getHarpoTrafficHostname(domain)
    if (!normalizedDomain) return false
    return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`)
  })
}

function harpoShouldPersistEntry(entry, captureSession = createHarpoCaptureSession()) {
  const session =
    captureSession && typeof captureSession === "object"
      ? captureSession
      : createHarpoCaptureSession()
  const request = entry?.request || {}
  const response = entry?.response || {}
  const resourceType = entry?._resourceType || request?._resourceType || ""
  const mimeType = response?.content?.mimeType || response?.mimeType || ""
  if (isHarpoPhysicalAssetTraffic({
    url: request.url || "",
    resourceType,
    mimeType,
    headers: response?.headers || []
  })) {
    return false
  }
  return (
    harpoMatchesDomainList(request.url || "", session.safeDomains || []) ||
    isHarpoAdobeTraffic(request.url || "") ||
    harpoMatchesDomainList(request.url || "", session.mvpdDomains || [])
  )
}

async function harpoAttachDebuggerToTab(tabId) {
  const normalizedTabId = Number(tabId || 0)
  if (!Number.isFinite(normalizedTabId) || normalizedTabId <= 0) return false
  if (harpoState.tabIds.has(normalizedTabId)) return true

  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId: normalizedTabId }, "1.3", () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve()
    })
  })

  await new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId: normalizedTabId }, "Network.enable", {}, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else resolve()
    })
  })

  harpoState.tabIds.add(normalizedTabId)
  return true
}

function harpoHandleTrackedTabCreated(tab) {
  if (!harpoState.recording) return
  const createdTabId = Number(tab?.id || 0)
  const openerTabId = Number(tab?.openerTabId || 0)
  if (createdTabId <= 0 || openerTabId <= 0 || !harpoState.tabIds.has(openerTabId)) return
  void harpoAttachDebuggerToTab(createdTabId).catch(() => {})
}

function harpoHandleCreatedNavigationTarget(details) {
  if (!harpoState.recording) return
  const sourceTabId = Number(details?.sourceTabId || 0)
  const createdTabId = Number(details?.tabId || 0)
  if (createdTabId <= 0 || sourceTabId <= 0 || !harpoState.tabIds.has(sourceTabId)) return
  void harpoAttachDebuggerToTab(createdTabId).catch(() => {})
}

function harpoHandleTrackedTabRemoved(removedTabId) {
  const normalizedTabId = Number(removedTabId || 0)
  if (!harpoState.tabIds.has(normalizedTabId)) return
  harpoState.tabIds.delete(normalizedTabId)
  harpoPurgePendingEntriesForTab(normalizedTabId)
  if (harpoState.recording && harpoState.tabIds.size === 0) {
    void harpoStopRecordingFlow()
  }
}

function harpoClearAutoStopTimer() {
  if (!harpoState.autoStopTimer) return
  clearTimeout(harpoState.autoStopTimer)
  harpoState.autoStopTimer = null
}

function harpoMaybeFinalizeAutoStop() {
  if (!harpoState.recording || !harpoState.stopRequested) return
  if (harpoState.pendingRequests.size > 0) return
  harpoClearAutoStopTimer()
  void harpoStopRecordingFlow()
}

function harpoRequestAutoStop() {
  if (!harpoState.recording || harpoState.stopRequested) return
  harpoState.stopRequested = true
  harpoClearAutoStopTimer()
  harpoState.autoStopTimer = setTimeout(() => {
    harpoState.autoStopTimer = null
    if (harpoState.recording) {
      void harpoStopRecordingFlow()
    }
  }, 1500)
  harpoMaybeFinalizeAutoStop()
}

function harpoOnDebuggerEvent(debuggeeId, method, params) {
  const tabId = Number(debuggeeId?.tabId || 0)
  if (!harpoState.tabIds.has(tabId)) return

  switch (method) {
    case "Network.requestWillBeSent": {
      const requestKey = harpoBuildRequestKey(tabId, params.requestId)
      const url          = params.request?.url || ""
      const resourceType = params.type || "Other"
      const existingReq = harpoState.pendingRequests.get(requestKey)
      const requestHeaders = harpoMergeHeaders(
        harpoNormalizeHeaders(params.request?.headers),
        harpoState.pendingRequestExtras.get(requestKey)
      )
      if (params.redirectResponse) {
        harpoState.captureSession = updateHarpoCaptureSessionFromResponse(
          harpoState.captureSession,
          params.redirectResponse?.url || existingReq?.url || "",
          {
            headers: params.redirectResponse?.headers,
            status: params.redirectResponse?.status
          }
        )
      }
      harpoState.captureSession = updateHarpoCaptureSessionFromRequest(
        harpoState.captureSession,
        url,
        {
          headers: requestHeaders
        }
      )
      const observedRequest = {
        tabId,
        requestKey,
        requestId:    params.requestId,
        url,
        method:       params.request.method,
        headers:      requestHeaders,
        postData:     params.request.postData || "",
        startTime:    params.timestamp,
        resourceType,
        initiator:    params.initiator,
        documentUrl:  params.documentURL || ""
      }
      harpoState.observedRequests.set(requestKey, observedRequest)
      const captureDecision = evaluateHarpoCaptureSession(harpoState.captureSession, url, {
        resourceType,
        headers: requestHeaders,
        initiatorUrl: params.initiator?.url || "",
        documentUrl: params.documentURL || ""
      })
      harpoState.captureSession = captureDecision.nextSession
      if (existingReq && params.redirectResponse) {
        harpoState.entries.push({
          tabId,
          requestKey,
          requestId:         params.requestId,
          req:               existingReq,
          resp:              harpoNormalizeResponseRecord(params.redirectResponse, params.timestamp),
          endTime:           params.timestamp,
          totalMs:           Math.round((params.timestamp - (existingReq.startTime || params.timestamp)) * 1000),
          encodedDataLength: Number(params.redirectResponse?.encodedDataLength || 0)
        })
        harpoState.observedRequests.delete(requestKey)
        harpoState.pendingRequests.delete(requestKey)
        harpoState.pendingResponses.delete(requestKey)
        harpoState.pendingRequestExtras.delete(requestKey)
      }

      harpoState.pendingRequestExtras.delete(requestKey)
      if (!captureDecision.allowCapture) {
        if (captureDecision.physicalAssetTraffic) {
          harpoState.observedRequests.delete(requestKey)
          harpoState.pendingResponses.delete(requestKey)
          harpoState.completedObservedRequests.delete(requestKey)
        }
        break
      }

      harpoState.pendingRequests.set(requestKey, observedRequest)
      if (captureDecision.logoutTraffic && !captureDecision.nextSession.externalTrafficWindowOpen) {
        harpoRequestAutoStop()
      }
      if (captureDecision.returnedToProgrammerDomain && captureDecision.nextSession.logoutDetected) {
        harpoRequestAutoStop()
      }
      break
    }

    case "Network.requestWillBeSentExtraInfo": {
      const requestKey = harpoBuildRequestKey(tabId, params.requestId)
      const extraHeaders = harpoNormalizeHeaders(params.headers)
      const pendingRequest = harpoState.pendingRequests.get(requestKey)
      if (pendingRequest) {
        pendingRequest.headers = harpoMergeHeaders(pendingRequest.headers, extraHeaders)
        harpoState.captureSession = updateHarpoCaptureSessionFromRequest(
          harpoState.captureSession,
          pendingRequest.url || "",
          {
            headers: pendingRequest.headers
          }
        )
        harpoPromoteObservedRequests()
      } else {
        const observedRequest = harpoState.observedRequests.get(requestKey)
        const mergedExtraHeaders = harpoMergeHeaders(
          harpoState.pendingRequestExtras.get(requestKey),
          extraHeaders
        )
        harpoState.pendingRequestExtras.set(requestKey, mergedExtraHeaders)
        if (observedRequest) {
          observedRequest.headers = harpoMergeHeaders(observedRequest.headers, mergedExtraHeaders)
          harpoState.captureSession = updateHarpoCaptureSessionFromRequest(
            harpoState.captureSession,
            observedRequest.url || "",
            {
              headers: observedRequest.headers,
              initiatorUrl: observedRequest.initiator?.url || "",
              documentUrl: observedRequest.documentUrl || ""
            }
          )
          harpoPromoteObservedRequests()
        }
      }
      break
    }

    case "Network.responseReceived":
      {
      const requestKey = harpoBuildRequestKey(tabId, params.requestId)
      harpoState.captureSession = updateHarpoCaptureSessionFromResponse(
        harpoState.captureSession,
        params.response?.url || harpoState.pendingRequests.get(requestKey)?.url || "",
        {
          headers: params.response?.headers,
          status: params.response?.status
        }
      )
      harpoPromoteObservedRequests()
      if (!harpoState.pendingRequests.has(requestKey) && !harpoState.observedRequests.has(requestKey)) break
      harpoState.pendingResponses.set(
        requestKey,
        harpoMergeResponseRecord(
          harpoState.pendingResponses.get(requestKey),
          harpoNormalizeResponseRecord(params.response, params.timestamp)
        )
      )
      break
      }

    case "Network.responseReceivedExtraInfo": {
      const requestKey = harpoBuildRequestKey(tabId, params.requestId)
      const pendingRequest = harpoState.pendingRequests.get(requestKey)
      const observedRequest = harpoState.observedRequests.get(requestKey)
      harpoState.captureSession = updateHarpoCaptureSessionFromResponse(
        harpoState.captureSession,
        pendingRequest?.url || observedRequest?.url || "",
        {
          headers: params.headers,
          status: params.statusCode
        }
      )
      harpoPromoteObservedRequests()
      if (!pendingRequest && !harpoState.observedRequests.has(requestKey)) break
      harpoState.pendingResponses.set(
        requestKey,
        harpoMergeResponseRecord(
          harpoState.pendingResponses.get(requestKey),
          {
            status: Number(params.statusCode || 0),
            statusText: "",
            headers: harpoNormalizeHeaders(params.headers),
            mimeType: "",
            responseTime: 0,
            encodedDataLength: 0
          }
        )
      )
      break
    }

    case "Network.loadingFinished": {
      const requestKey = harpoBuildRequestKey(tabId, params.requestId)
      const req  = harpoState.pendingRequests.get(requestKey)
      const resp = harpoState.pendingResponses.get(requestKey)
      if (req) {
        harpoFinalizeCapturedRequest(requestKey, {
          requestId: params.requestId,
          endTime: params.timestamp,
          encodedDataLength: params.encodedDataLength || 0,
          bodyPromise: harpoBuildObservedBodyPromise(req, debuggeeId, params.requestId)
        })
      } else {
        const observedRequest = harpoState.observedRequests.get(requestKey)
        if (observedRequest) {
          harpoState.completedObservedRequests.set(requestKey, {
            requestId: params.requestId,
            endTime: params.timestamp,
            encodedDataLength: params.encodedDataLength || 0,
            bodyPromise: harpoBuildObservedBodyPromise(observedRequest, debuggeeId, params.requestId)
          })
          harpoPromoteObservedRequests()
        } else {
          harpoState.pendingRequestExtras.delete(requestKey)
          harpoState.pendingResponses.delete(requestKey)
          harpoState.completedObservedRequests.delete(requestKey)
        }
      }
      break
    }

    case "Network.loadingFailed": {
      const requestKey = harpoBuildRequestKey(tabId, params.requestId)
      const req = harpoState.pendingRequests.get(requestKey)
      if (req) {
        harpoFinalizeCapturedRequest(requestKey, {
          requestId: params.requestId,
          endTime: params.timestamp,
          failed: true,
          errorText: params.errorText || "",
          responseOverride: {
            status: 0,
            statusText: params.errorText || "Failed",
            headers: [],
            mimeType: "",
            responseTime: params.timestamp,
            encodedDataLength: 0
          }
        })
      } else {
        const observedRequest = harpoState.observedRequests.get(requestKey)
        if (observedRequest) {
          harpoState.completedObservedRequests.set(requestKey, {
            requestId: params.requestId,
            endTime: params.timestamp,
            failed: true,
            errorText: params.errorText || "",
            responseOverride: {
              status: 0,
              statusText: params.errorText || "Failed",
              headers: [],
              mimeType: "",
              responseTime: params.timestamp,
              encodedDataLength: 0
            }
          })
          harpoPromoteObservedRequests()
        } else {
          harpoState.pendingRequestExtras.delete(requestKey)
          harpoState.pendingResponses.delete(requestKey)
          harpoState.completedObservedRequests.delete(requestKey)
        }
      }
      break
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HARPO — Response body fetcher (concurrent pool, skip binary types)
// ═══════════════════════════════════════════════════════════════════════════════

function harpoFetchOneBody(tabId, requestId) {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand({ tabId }, "Network.getResponseBody", { requestId }, (result) => {
      if (chrome.runtime.lastError) {
        resolve({
          text: "",
          encoding: "",
          error: chrome.runtime.lastError.message || "Response body unavailable"
        })
        return
      }
      if (!result) {
        resolve({
          text: "",
          encoding: "",
          error: "Response body unavailable"
        })
        return
      }
      resolve({
        text: result.body || "",
        encoding: result.base64Encoded ? "base64" : "",
        error: ""
      })
    })
  })
}

async function harpoFetchAllBodies(entries) {
  // Filter to entries worth fetching bodies for
  const fetchable = entries.filter((e) =>
    !e.failed && !HARPO_SKIP_BODY_TYPES.has(e.req?.resourceType) && Number(e?.tabId || 0) > 0
  )

  const bodyMap = new Map()
  const queue   = [...fetchable]

  async function worker() {
    while (queue.length > 0) {
      const entry = queue.shift()
      if (!entry) break
      if (entry.bodyPromise) {
        const settled = await entry.bodyPromise.catch(() => ({
          text: "",
          encoding: "",
          error: "Response body unavailable"
        }))
        bodyMap.set(entry.requestKey || harpoBuildRequestKey(entry.tabId, entry.requestId), settled)
        continue
      }
      const body = await Promise.race([
        harpoFetchOneBody(Number(entry.tabId || 0), entry.requestId),
        new Promise((resolve) => setTimeout(() => resolve({
          text: "",
          encoding: "",
          error: "Timed out while fetching response body"
        }), 4000))
      ]).catch(() => ({
        text: "",
        encoding: "",
        error: "Response body unavailable"
      }))
      bodyMap.set(entry.requestKey || harpoBuildRequestKey(entry.tabId, entry.requestId), body)
    }
  }

  await Promise.all(Array.from({ length: HARPO_BODY_FETCH_CONCURRENCY }, () => worker()))
  return bodyMap
}

// ═══════════════════════════════════════════════════════════════════════════════
// HARPO — HAR assembly
// ═══════════════════════════════════════════════════════════════════════════════

function harpoParseQueryString(url) {
  try {
    return [...new URL(url).searchParams.entries()].map(([name, value]) => ({ name, value }))
  } catch { return [] }
}

async function harpoBuildHar(captureSession = createHarpoCaptureSession()) {
  const entries = harpoState.entries
  const bodyMap = await harpoFetchAllBodies(entries)

  const harEntries = entries.map((entry) => {
    const req          = entry.req
    const resp         = entry.resp || {}
    const startMs      = Math.round((req.startTime || 0) * 1000)
    const responseBody =
      bodyMap.get(entry.requestKey || harpoBuildRequestKey(entry.tabId, entry.requestId)) ||
      { text: "", encoding: "", error: "" }
    const requestContentType = (req.headers || []).find((header) => String(header?.name || "").toLowerCase() === "content-type")?.value || ""
    const responseBodyText = responseBody.text || ""
    const responseBodySize = Number(resp.encodedDataLength || entry.encodedDataLength || responseBodyText.length || 0)
    const redirectUrl = harpoGetHeaderValue(resp.headers, "location")

    return {
      startedDateTime: new Date(startMs).toISOString(),
      time:            entry.totalMs,
      _resourceType:   req.resourceType || "Other",
      request: {
        method:      req.method || "GET",
        url:         req.url,
        httpVersion: "HTTP/1.1",
        headers:     req.headers || [],
        queryString: harpoParseQueryString(req.url),
        cookies:     [],
        headersSize: -1,
        bodySize:    req.postData ? req.postData.length : -1,
        ...(req.postData ? {
          postData: {
            mimeType: requestContentType || "text/plain",
            text: req.postData
          }
        } : {})
      },
      response: {
        status:      resp.status || 0,
        statusText:  resp.statusText || "",
        httpVersion: "HTTP/1.1",
        headers:     resp.headers || [],
        cookies:     [],
        content: {
          size:     responseBodySize,
          mimeType: resp.mimeType || "text/plain",
          ...(responseBodyText ? { text: responseBodyText } : {}),
          ...(responseBody.encoding ? { encoding: responseBody.encoding } : {}),
          ...(responseBody.error ? { comment: responseBody.error } : {})
        },
        redirectURL: redirectUrl,
        headersSize: -1,
        bodySize:    responseBodySize
      },
      cache:   {},
      timings: { send: 0, wait: Math.max(0, entry.totalMs - 1), receive: 1 }
    }
  }).filter((entry) => harpoShouldPersistEntry(entry, captureSession))

  return {
    log: {
      version: HARPO_HAR_VERSION,
      creator: { name: "HARPO / LoginButton", version: chrome.runtime.getManifest()?.version || "1.4.0" },
      browser: { name: "Chrome", version: "" },
      pages:   [],
      entries: harEntries
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HARPO — Start / Stop
// ═══════════════════════════════════════════════════════════════════════════════

function harpoGenerateKey() {
  return `${HARPO_STORAGE_PREFIX}${Array.from(
    crypto.getRandomValues(new Uint8Array(12))
  ).map(b => b.toString(16).padStart(2, "0")).join("")}`
}

async function harpoStartRecordingFlow(
  url,
  programmerName,
  requestorId = "",
  requestorName = "",
  safeDomains = [],
  programmerDomains = []
) {
  if (harpoState.recording) throw new Error("HARPO is already recording. Stop the current session first.")

  const tab   = await chrome.tabs.create({ url, active: true })
  const tabId = tab.id
  await harpoAttachDebuggerToTab(tabId)

  const sessionKey = harpoGenerateKey()

  harpoState.recording        = true
  harpoState.rootTabId        = tabId
  harpoState.sessionKey       = sessionKey
  harpoState.programmerName   = String(programmerName || "")
  harpoState.requestorId      = String(requestorId || "")
  harpoState.requestorName    = String(requestorName || "")
  harpoState.safeDomains      = Array.isArray(safeDomains) ? safeDomains : []
  harpoState.programmerDomains =
    Array.isArray(programmerDomains) && programmerDomains.length > 0
      ? programmerDomains
      : deriveHarpoProgrammerDomains(harpoState.safeDomains)
  harpoState.captureSession   = createHarpoCaptureSession({
    safeDomains: harpoState.safeDomains,
    programmerDomains: harpoState.programmerDomains
  })
  harpoState.startedAt        = new Date().toISOString()
  harpoState.stopRequested    = false
  harpoClearAutoStopTimer()
  harpoState.entries          = []
  harpoState.observedRequests.clear()
  harpoState.pendingRequestExtras.clear()
  harpoState.pendingRequests.clear()
  harpoState.pendingResponses.clear()
  harpoState.completedObservedRequests.clear()

  chrome.debugger.onEvent.addListener(harpoOnDebuggerEvent)
  chrome.tabs.onCreated.addListener(harpoHandleTrackedTabCreated)
  chrome.tabs.onRemoved.addListener(harpoHandleTrackedTabRemoved)
  if (chrome.webNavigation?.onCreatedNavigationTarget) {
    chrome.webNavigation.onCreatedNavigationTarget.addListener(harpoHandleCreatedNavigationTarget)
  }
  harpoStartKeepalive()
}

async function harpoStopRecordingFlow() {
  if (!harpoState.recording) return { ok: false, error: "No active recording." }

  const trackedTabIds = [...harpoState.tabIds]
  const sessionKey = harpoState.sessionKey

  harpoState.recording = false
  harpoState.stopRequested = false
  harpoClearAutoStopTimer()
  harpoStopKeepalive()
  chrome.debugger.onEvent.removeListener(harpoOnDebuggerEvent)
  chrome.tabs.onCreated.removeListener(harpoHandleTrackedTabCreated)
  chrome.tabs.onRemoved.removeListener(harpoHandleTrackedTabRemoved)
  if (chrome.webNavigation?.onCreatedNavigationTarget) {
    chrome.webNavigation.onCreatedNavigationTarget.removeListener(harpoHandleCreatedNavigationTarget)
  }

  // Build HAR while debugger is still attached (required for body fetching)
  let har        = null
  let buildError = null
  try {
    har = await harpoBuildHar(harpoState.captureSession)
  } catch (err) {
    buildError = err instanceof Error ? err.message : String(err)
  }

  // Detach debugger
  await Promise.all(trackedTabIds.map((trackedTabId) => new Promise((resolve) => {
    chrome.debugger.detach({ tabId: trackedTabId }, () => resolve())
  }).catch(() => { })))

  // Close recorded tabs and popups
  if (trackedTabIds.length > 0) {
    try { await chrome.tabs.remove(trackedTabIds) } catch { }
  }

  harpoState.rootTabId   = null
  harpoState.tabIds      = new Set()
  harpoState.sessionKey = ""

  if (!har) {
    return { ok: false, error: buildError || "Failed to build HAR.", entryCount: 0 }
  }

  const entryCount = har.log.entries.length

  // ── Write to IndexedDB — no quota limit ──────────────────────────────────
  try {
    await harpoIdbPut(sessionKey, {
      har,
      source:          "recording",
      fileName:        "",
      programmerName:  harpoState.programmerName,
      requestorId:     harpoState.requestorId,
      requestorName:   harpoState.requestorName,
      programmerDomains: harpoState.programmerDomains,
      safeDomains:     harpoState.safeDomains,
      mvpdDomains:     Array.isArray(harpoState.captureSession?.mvpdDomains)
        ? harpoState.captureSession.mvpdDomains
        : [],
      createdAt:       harpoState.startedAt || new Date().toISOString()
    })
  } catch (idbErr) {
    return {
      ok: false,
      error: `IndexedDB write failed: ${idbErr instanceof Error ? idbErr.message : idbErr}`,
      entryCount
    }
  }

  // Open HARPO Workspace
  const workspaceUrl = chrome.runtime.getURL(`harpo.html#${sessionKey}`)
  try { await chrome.tabs.create({ url: workspaceUrl }) } catch { }

  harpoState.requestorId = ""
  harpoState.requestorName = ""
  harpoState.programmerDomains = []
  harpoState.safeDomains = []
  harpoState.captureSession = createHarpoCaptureSession()
  harpoState.observedRequests.clear()
  harpoState.pendingRequestExtras.clear()
  harpoState.pendingRequests.clear()
  harpoState.pendingResponses.clear()
  harpoState.completedObservedRequests.clear()

  return { ok: true, entryCount, sessionKey }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════════════════════

void syncSidePanelBehavior()
void refreshUpdateState({ force: true }).catch(() => { })

chrome.runtime.onInstalled.addListener(() => {
  void syncSidePanelBehavior()
  void refreshUpdateState({ force: true }).catch(() => { })
})

if (chrome.runtime.onStartup?.addListener) {
  chrome.runtime.onStartup.addListener(() => {
    void refreshUpdateState({ force: true }).catch(() => { })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Message router
// ═══════════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message?.type === LOGINBUTTON_VAULT_REQUEST_TYPE) {
    void (async () => {
      try {
        sendResponse({ ok: true, result: await handleVaultMessage(message) })
      } catch (error) {
        sendResponse({ ok: false, error: serializeBackgroundError(error), senderUrl: String(sender?.url || "").trim() })
      }
    })()
    return true
  }

  if (message?.type === LOGINBUTTON_GET_UPDATE_STATE_REQUEST_TYPE) {
    void refreshUpdateState({ force: message?.force === true })
      .then((info) => sendResponse(info && typeof info === "object" ? info : getUpdateStatePayload()))
      .catch(() => sendResponse(getUpdateStatePayload()))
    return true
  }

  if (message?.type === LOGINBUTTON_GET_LATEST_REQUEST_TYPE) {
    void openLoginButtonGetLatestFlow()
      .then((result) => sendResponse(result && typeof result === "object" ? result : { ok: false, error: "Unknown error" }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    return true
  }

  if (message?.type === HARPO_MESSAGE_START) {
    void harpoStartRecordingFlow(
      String(message?.url || ""),
      String(message?.programmerName || ""),
      String(message?.requestorId || ""),
      String(message?.requestorName || ""),
      Array.isArray(message?.safeDomains)
        ? message.safeDomains
        : Array.isArray(message?.programmerDomains)
          ? message.programmerDomains
          : [],
      Array.isArray(message?.programmerDomains) ? message.programmerDomains : []
    )
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    return true
  }

  if (message?.type === HARPO_MESSAGE_STOP) {
    void harpoStopRecordingFlow()
      .then((result) => sendResponse(result && typeof result === "object" ? result : { ok: false, error: "Unknown error" }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    return true
  }

  if (message?.type === HARPO_MESSAGE_STATUS) {
    sendResponse({ recording: harpoState.recording, count: harpoState.entries.length, tabId: harpoState.tabId })
    return true
  }

  return undefined
})

// ─── Vault handler ────────────────────────────────────────────────────────────

async function handleVaultMessage(message = {}) {
  const action = String(message?.action || "").trim()
  switch (action) {
    case "stats":                return getLoginButtonVaultStats()
    case "export":               return exportLoginButtonVaultSnapshot()
    case "import":               return importLoginButtonVaultSnapshot(message?.payload || null, { replaceExisting: message?.replaceExisting === true })
    case "clear":                return clearLoginButtonVault()
    case "get-programmer-record":
      return readProgrammerVaultRecord({ environmentId: message?.environmentId, programmerId: message?.programmerId })
    case "delete-programmer-record":
      return deleteProgrammerVaultRecord({ environmentId: message?.environmentId, programmerId: message?.programmerId })
    default:
      throw new Error(`Unsupported LoginButton VAULT action: ${action || "unknown"}`)
  }
}

function serializeBackgroundError(error) {
  if (error instanceof Error) return error.message || "Unknown error"
  return String(error || "Unknown error")
}
