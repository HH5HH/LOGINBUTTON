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
  shouldPersistHarpoCapturedEntry,
  updateHarpoCaptureSessionFromRequest,
  updateHarpoCaptureSessionFromResponse
} from "./harpo-capture.js"
import { getHarpoTrafficHostname, isHarpoAdobeTraffic, isHarpoPhysicalAssetTraffic } from "./harpo-traffic.js"

const LOGINBUTTON_VAULT_REQUEST_TYPE = "loginbutton:vault"
const LOGINBUTTON_GET_UPDATE_STATE_REQUEST_TYPE = "loginbutton:getUpdateState"
const LOGINBUTTON_GET_LATEST_REQUEST_TYPE = "loginbutton:getLatest"
const LOGINBUTTON_FETCH_AVATAR_REQUEST_TYPE = "loginbutton:fetchAvatarDataUrl"
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
const LOGINBUTTON_AVATAR_MAX_DATAURL_BYTES = 6 * 1024 * 1024
const LOGINBUTTON_IMS_BASE_URL = "https://ims-na1.adobelogin.com"
const LOGINBUTTON_PPS_PROFILE_BASE_URL = "https://pps.services.adobe.com"
const LOGINBUTTON_AVATAR_SIZE_PREFERENCES = [128, 64, 256, 32]
const LOGINBUTTON_LEGACY_IMS_AVATAR_CLIENT_IDS = ["AdobePass1"]

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
const HARPO_BODY_FETCH_RETRY_DELAYS_MS = [120, 260, 520]
const HARPO_NETWORK_MAX_TOTAL_BUFFER_SIZE = 100 * 1024 * 1024
const HARPO_NETWORK_MAX_RESOURCE_BUFFER_SIZE = 10 * 1024 * 1024
const HARPO_NETWORK_MAX_POST_DATA_SIZE = 1024 * 1024
const HARPO_FETCH_INTERCEPT_RESOURCE_TYPES = ["Document", "XHR", "Fetch", "Script", "Other"]

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
  pendingRequestPostData: new Map(),
  capturedResponseBodies: new Map(),
  pendingCapturedResponseBodies: new Map(),
  fetchResponseBodies: new Map(),
  pendingFetchResponseBodies: new Map(),
  pendingStreamBodies: new Map(),
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

function normalizeLoginButtonAvatarCandidate(value = "") {
  if (typeof value !== "string") {
    return ""
  }

  const trimmed = value.trim().replace(/^['"]+|['"]+$/g, "")
  if (!trimmed) {
    return ""
  }

  if (/^data:image\//i.test(trimmed) || /^blob:/i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`
  }

  if (/^\/?api\/profile\/[^/]+\/image(\/|$)/i.test(trimmed)) {
    const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
    return `${LOGINBUTTON_PPS_PROFILE_BASE_URL}${normalizedPath}`
  }

  if (/^ims\/avatar\/download\//i.test(trimmed)) {
    return `${LOGINBUTTON_IMS_BASE_URL}/${trimmed}`
  }

  if (/^avatar\/download\//i.test(trimmed)) {
    return `${LOGINBUTTON_IMS_BASE_URL}/ims/${trimmed}`
  }

  if (/^\/ims\/avatar\/download\//i.test(trimmed)) {
    return `${LOGINBUTTON_IMS_BASE_URL}${trimmed}`
  }

  if (trimmed.startsWith("/")) {
    return `${LOGINBUTTON_IMS_BASE_URL}${trimmed}`
  }

  if (!trimmed.includes("://") && /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    return `https://${trimmed}`
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:"
    }
    return parsed.protocol === "https:" ? parsed.toString() : ""
  } catch {
    return ""
  }
}

function isLoginButtonImsAvatarDownloadUrl(url = "") {
  const normalized = normalizeLoginButtonAvatarCandidate(url)
  if (!normalized || normalized.startsWith("data:image/") || normalized.startsWith("blob:")) {
    return false
  }

  try {
    const parsed = new URL(normalized)
    return /(^|\.)adobelogin\.com$/i.test(parsed.hostname) && /\/ims\/avatar\/download\//i.test(parsed.pathname)
  } catch {
    return false
  }
}

function isLoginButtonPpsProfileImageUrl(url = "") {
  const normalized = normalizeLoginButtonAvatarCandidate(url)
  if (!normalized || normalized.startsWith("data:image/") || normalized.startsWith("blob:")) {
    return false
  }

  try {
    const parsed = new URL(normalized)
    return /(^|\.)pps\.services\.adobe\.com$/i.test(parsed.hostname) && /\/api\/profile\/[^/]+\/image(\/|$)/i.test(parsed.pathname)
  } catch {
    return false
  }
}

function toLoginButtonPpsProfileImageSizeUrl(url = "", size = 0) {
  const normalized = normalizeLoginButtonAvatarCandidate(url)
  if (!normalized || !isLoginButtonPpsProfileImageUrl(normalized) || !Number.isFinite(size) || size <= 0) {
    return normalized
  }

  try {
    const parsed = new URL(normalized)
    const nextSize = String(Math.floor(size))
    const withTrailingSize = parsed.pathname.replace(/\/(\d+)(\/?)$/i, `/${nextSize}$2`)
    if (withTrailingSize !== parsed.pathname) {
      parsed.pathname = withTrailingSize
      return parsed.toString()
    }
    parsed.pathname = `${parsed.pathname.replace(/\/?$/, "")}/${nextSize}`
    return parsed.toString()
  } catch {
    return normalized
  }
}

function buildLoginButtonAvatarFetchUrlCandidates(url = "") {
  const normalized = normalizeLoginButtonAvatarCandidate(url)
  if (!normalized) {
    return []
  }

  const candidates = [normalized]
  const pushCandidate = (value) => {
    const candidate = normalizeLoginButtonAvatarCandidate(value)
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate)
    }
  }

  if (isLoginButtonPpsProfileImageUrl(normalized)) {
    for (const size of LOGINBUTTON_AVATAR_SIZE_PREFERENCES) {
      pushCandidate(toLoginButtonPpsProfileImageSizeUrl(normalized, size))
    }
    return candidates
  }

  try {
    const parsed = new URL(normalized)
    if (isLoginButtonImsAvatarDownloadUrl(normalized)) {
      if (!parsed.searchParams.has("size")) {
        const sized = new URL(parsed.toString())
        sized.searchParams.set("size", String(LOGINBUTTON_AVATAR_SIZE_PREFERENCES[0] || 128))
        pushCandidate(sized.toString())
      }
      return candidates
    }

    for (const size of LOGINBUTTON_AVATAR_SIZE_PREFERENCES) {
      const sized = new URL(parsed.toString())
      sized.searchParams.set("size", String(size))
      pushCandidate(sized.toString())
    }
  } catch {
    // Keep original URL only.
  }

  return candidates
}

function decodeLoginButtonBase64UrlText(value = "") {
  let normalized = String(value || "").trim().replace(/-/g, "+").replace(/_/g, "/")
  if (!normalized) {
    return ""
  }
  const remainder = normalized.length % 4
  if (remainder) {
    normalized += "=".repeat(4 - remainder)
  }
  try {
    return atob(normalized)
  } catch {
    return ""
  }
}

function parseLoginButtonJwtPayload(token = "") {
  const raw = String(token || "").trim()
  if (!raw) {
    return null
  }
  const parts = raw.split(".")
  if (parts.length < 2) {
    return null
  }
  try {
    const parsed = JSON.parse(decodeLoginButtonBase64UrlText(parts[1]))
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

function inferLoginButtonImageMimeTypeFromBuffer(buffer = new ArrayBuffer(0)) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png"
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.subarray(0, 6))
    if (signature === "GIF87a" || signature === "GIF89a") {
      return "image/gif"
    }
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp"
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.subarray(0, 4))
    const webp = String.fromCharCode(...bytes.subarray(8, 12))
    if (riff === "RIFF" && webp === "WEBP") {
      return "image/webp"
    }
  }
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, 256))).trim()
  if (/^<svg[\s>]/i.test(head) || /^<\?xml[\s\S]*<svg[\s>]/i.test(head)) {
    return "image/svg+xml"
  }
  return ""
}

function buildLoginButtonAvatarFetchAttempts(accessToken = "", clientId = "", url = "") {
  const baseHeaders = {
    Accept: "image/*,*/*;q=0.8"
  }
  const preferPpsIdentitySessionFirst = isLoginButtonPpsProfileImageUrl(url)
  const tokenClaims = parseLoginButtonJwtPayload(accessToken) || {}
  const avatarClientIds = [...new Set([
    String(clientId || "").trim(),
    String(tokenClaims?.client_id || tokenClaims?.clientId || "").trim(),
    ...LOGINBUTTON_LEGACY_IMS_AVATAR_CLIENT_IDS
  ].filter(Boolean))]

  const attempts = []
  const seen = new Set()
  const pushAttempt = (headers, credentials) => {
    const key = `${credentials}|${Object.entries(headers)
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
      .map(([headerName, value]) => `${headerName}:${value}`)
      .join("|")}`
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    attempts.push({ headers, credentials })
  }

  if (preferPpsIdentitySessionFirst) {
    pushAttempt(baseHeaders, "include")
    pushAttempt(baseHeaders, "omit")
  }

  if (accessToken) {
    pushAttempt({ ...baseHeaders, Authorization: `Bearer ${accessToken}` }, "omit")
    pushAttempt({ ...baseHeaders, Authorization: `Bearer ${accessToken}` }, "include")
    pushAttempt({ Accept: "*/*", Authorization: `Bearer ${accessToken}` }, "omit")
    for (const currentClientId of avatarClientIds) {
      pushAttempt(
        {
          ...baseHeaders,
          Authorization: `Bearer ${accessToken}`,
          "X-IMS-ClientId": currentClientId,
          "x-api-key": currentClientId
        },
        "omit"
      )
      pushAttempt(
        {
          ...baseHeaders,
          Authorization: `Bearer ${accessToken}`,
          "X-IMS-ClientId": currentClientId,
          "x-api-key": currentClientId
        },
        "include"
      )
    }
  }

  if (!preferPpsIdentitySessionFirst) {
    pushAttempt(baseHeaders, "omit")
    pushAttempt(baseHeaders, "include")
  } else {
    pushAttempt({ Accept: "*/*" }, "include")
    pushAttempt({ Accept: "*/*" }, "omit")
  }

  return attempts
}

function isAllowedLoginButtonAvatarRelayUrl(value = "") {
  const normalized = normalizeLoginButtonAvatarCandidate(value)
  if (!normalized) {
    return false
  }
  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== "https:") {
      return false
    }
    const host = String(parsed.hostname || "").toLowerCase()
    return /(^|\.)adobelogin\.com$/i.test(host) ||
      host === "pps.services.adobe.com" ||
      /(^|\.)adobe\.com$/i.test(host)
  } catch {
    return false
  }
}

async function fetchLoginButtonAvatarAsDataUrl(url = "", accessToken = "", clientId = "") {
  const normalizedUrl = normalizeLoginButtonAvatarCandidate(url)
  if (!normalizedUrl) {
    throw new Error("Missing avatar URL.")
  }
  if (!isAllowedLoginButtonAvatarRelayUrl(normalizedUrl)) {
    throw new Error("Avatar relay only supports Adobe avatar hosts.")
  }

  const urlCandidates = buildLoginButtonAvatarFetchUrlCandidates(normalizedUrl)
  const maxAttempts = 14
  let attemptCount = 0
  let lastError = null

  for (const targetUrl of urlCandidates) {
    const attempts = buildLoginButtonAvatarFetchAttempts(String(accessToken || "").trim(), String(clientId || "").trim(), targetUrl)
    for (const attempt of attempts) {
      attemptCount += 1
      if (attemptCount > maxAttempts) {
        break
      }

      try {
        const response = await fetch(targetUrl, {
          method: "GET",
          cache: "no-store",
          credentials: attempt.credentials,
          redirect: "follow",
          headers: attempt.headers
        })
        if (!response.ok) {
          lastError = new Error(`Avatar request failed (${response.status})`)
          continue
        }

        const blob = await response.blob()
        if (!blob || blob.size === 0) {
          lastError = new Error("Avatar response was empty.")
          continue
        }
        if (blob.size > LOGINBUTTON_AVATAR_MAX_DATAURL_BYTES) {
          lastError = new Error("Avatar payload too large for data URL transport.")
          continue
        }

        const buffer = await blob.arrayBuffer()
        const responseMimeType = String(blob.type || "").toLowerCase()
        const resolvedMimeType = responseMimeType.startsWith("image/")
          ? responseMimeType
          : inferLoginButtonImageMimeTypeFromBuffer(buffer)
        if (!resolvedMimeType) {
          lastError = new Error(`Avatar response type was not image (${blob.type || "unknown"}).`)
          continue
        }

        const base64 = harpoBytesToBase64(new Uint8Array(buffer))
        if (!base64) {
          lastError = new Error("Avatar body encoding failed.")
          continue
        }

        return `data:${resolvedMimeType};base64,${base64}`
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
    if (attemptCount > maxAttempts) {
      break
    }
  }

  throw lastError || new Error("Unable to fetch avatar.")
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

function harpoBuildEmptyBodyResult(comment = "") {
  return {
    text: "",
    encoding: "",
    comment: String(comment || "")
  }
}

function harpoHasBodyResult(bodyResult = null) {
  if (!bodyResult || typeof bodyResult !== "object") return false
  return Boolean(String(bodyResult.text || "") || String(bodyResult.comment || ""))
}

function harpoNormalizeContentType(contentType = "") {
  return String(contentType || "").split(";")[0].trim().toLowerCase()
}

function harpoIsJsonContentType(contentType = "") {
  const normalized = harpoNormalizeContentType(contentType)
  return normalized === "application/json" || normalized.endsWith("+json")
}

function harpoIsXmlLikeContentType(contentType = "") {
  const normalized = harpoNormalizeContentType(contentType)
  return normalized === "application/xml" ||
    normalized === "text/xml" ||
    normalized === "text/html" ||
    normalized.endsWith("+xml")
}

function harpoIsUrlEncodedContentType(contentType = "") {
  return harpoNormalizeContentType(contentType) === "application/x-www-form-urlencoded"
}

function harpoIsTextualContentType(contentType = "") {
  const normalized = harpoNormalizeContentType(contentType)
  if (!normalized) return false
  return normalized.startsWith("text/") ||
    normalized.includes("javascript") ||
    normalized.includes("ecmascript") ||
    normalized.includes("graphql") ||
    harpoIsJsonContentType(normalized) ||
    harpoIsXmlLikeContentType(normalized) ||
    harpoIsUrlEncodedContentType(normalized)
}

function harpoBase64ToBytes(base64 = "") {
  try {
    const binary = atob(String(base64 || ""))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return new Uint8Array(0)
  }
}

function harpoBytesToBase64(bytes = new Uint8Array(0)) {
  try {
    const chunkSize = 0x8000
    let binary = ""
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return btoa(binary)
  } catch {
    return ""
  }
}

function harpoTextToBytes(text = "") {
  try {
    return new TextEncoder().encode(String(text || ""))
  } catch {
    return new Uint8Array(0)
  }
}

function harpoBytesToUtf8Text(bytes = new Uint8Array(0)) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0/g, "")
  } catch {
    return ""
  }
}

function harpoDecodeBase64Utf8(base64 = "") {
  const bytes = harpoBase64ToBytes(base64)
  if (!bytes.length) {
    return ""
  }
  return harpoBytesToUtf8Text(bytes)
}

function harpoConcatByteChunks(chunks = []) {
  const safeChunks = (Array.isArray(chunks) ? chunks : []).filter((chunk) => chunk instanceof Uint8Array && chunk.length > 0)
  if (!safeChunks.length) return new Uint8Array(0)
  const totalLength = safeChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of safeChunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return combined
}

function harpoCombineBase64Chunks(chunks = []) {
  const safeChunks = (Array.isArray(chunks) ? chunks : []).filter((chunk) => typeof chunk === "string" && chunk)
  if (!safeChunks.length) return ""
  if (safeChunks.length === 1) return safeChunks[0]
  const parts = safeChunks.map((chunk) => harpoBase64ToBytes(chunk)).filter((chunk) => chunk.length > 0)
  if (!parts.length) return safeChunks[0]
  const totalLength = parts.reduce((sum, chunk) => sum + chunk.length, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of parts) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return harpoBytesToBase64(combined)
}

function harpoBuildStreamBodyResult(requestKey = "") {
  const streamState = harpoState.pendingStreamBodies.get(requestKey)
  if (!streamState) return null
  const text = harpoCombineBase64Chunks(streamState.chunks)
  if (!text) return null
  return {
    text,
    encoding: "base64",
    comment: ""
  }
}

function harpoResolveResponseContentType(response = null) {
  const mimeType = String(response?.mimeType || response?.contentType || "").trim()
  if (mimeType) {
    return mimeType
  }
  const responseHeaders = Array.isArray(response?.headers)
    ? response.headers
    : harpoNormalizeFetchHeaderEntries(response?.responseHeaders)
  return harpoGetHeaderValue(responseHeaders, "content-type")
}

function harpoNormalizeCapturedBodyResult(bodyResult = null, { contentType = "" } = {}) {
  const normalizedBodyResult = harpoHasBodyResult(bodyResult)
    ? {
        text: String(bodyResult?.text || ""),
        encoding: String(bodyResult?.encoding || ""),
        comment: String(bodyResult?.comment || "")
      }
    : harpoBuildEmptyBodyResult()

  if (
    normalizedBodyResult.encoding !== "base64" ||
    !normalizedBodyResult.text ||
    !harpoIsTextualContentType(contentType)
  ) {
    return normalizedBodyResult
  }

  const decodedText = harpoDecodeBase64Utf8(normalizedBodyResult.text)
  if (!decodedText) {
    return normalizedBodyResult
  }

  return {
    ...normalizedBodyResult,
    text: decodedText,
    encoding: ""
  }
}

function harpoNormalizeFetchHeaderEntries(headers = []) {
  return (Array.isArray(headers) ? headers : [])
    .map((header) => ({
      name: String(header?.name || "").trim(),
      value: String(header?.value || "")
    }))
    .filter((header) => header.name)
}

function harpoResolveRequestContentType(request = null) {
  return harpoGetHeaderValue(Array.isArray(request?.headers) ? request.headers : [], "content-type")
}

function harpoIsFetchRedirectResponse(params = {}) {
  const statusCode = Number(params?.responseStatusCode || 0)
  if (![301, 302, 303, 307, 308].includes(statusCode)) {
    return false
  }

  return Boolean(harpoGetHeaderValue(harpoNormalizeFetchHeaderEntries(params?.responseHeaders), "location"))
}

function harpoBuildFetchBodyResult(result = null, contentType = "") {
  return harpoNormalizeCapturedBodyResult({
    text: String(result?.body || ""),
    encoding: result?.base64Encoded ? "base64" : "",
    comment: ""
  }, { contentType })
}

function harpoBuildRequestBodyResult(result = null, contentType = "") {
  return harpoNormalizeCapturedBodyResult({
    text: String(result?.postData || ""),
    encoding: result?.base64Encoded ? "base64" : "",
    comment: ""
  }, { contentType })
}

function harpoFormatByteCount(bytes = 0) {
  const normalizedBytes = Number(bytes || 0)
  if (!Number.isFinite(normalizedBytes) || normalizedBytes <= 0) {
    return "0 bytes"
  }
  if (normalizedBytes < 1024) {
    return `${normalizedBytes} byte${normalizedBytes === 1 ? "" : "s"}`
  }
  if (normalizedBytes < 1024 * 1024) {
    return `${(normalizedBytes / 1024).toFixed(normalizedBytes >= 10 * 1024 ? 0 : 1)} KB`
  }
  return `${(normalizedBytes / (1024 * 1024)).toFixed(normalizedBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function harpoBuildMissingBodyComment(
  request = null,
  response = null,
  {
    failed = false,
    errorText = "",
    encodedDataLength = 0
  } = {}
) {
  const requestMethod = String(request?.method || "").trim().toUpperCase()
  const resourceType = String(request?.resourceType || "").trim()
  const responseStatus = Number(response?.status || 0)
  const responseHeaders = Array.isArray(response?.headers) ? response.headers : []
  const redirectUrl = harpoGetHeaderValue(responseHeaders, "location")
  const safeErrorText = String(errorText || "").trim()
  const normalizedEncodedLength = Number(encodedDataLength || response?.encodedDataLength || 0)

  if (HARPO_SKIP_BODY_TYPES.has(resourceType)) {
    return `HARPO skipped body capture for ${resourceType || "this"} traffic because Chrome does not expose useful text payloads for that resource type.`
  }
  if (failed) {
    return safeErrorText
      ? `The request failed before a usable response body was available: ${safeErrorText}`
      : "The request failed before a usable response body was available."
  }
  if (requestMethod === "HEAD") {
    return "HEAD responses do not carry a response body by design."
  }
  if (resourceType === "Preflight" || requestMethod === "OPTIONS") {
    return "CORS preflight responses typically do not include a response body."
  }
  if ([204, 205, 304].includes(responseStatus)) {
    return `HTTP ${responseStatus} responses do not include a response body by definition.`
  }
  if ([301, 302, 303, 307, 308].includes(responseStatus) && redirectUrl) {
    return `Redirect response. The Location header is authoritative here: ${redirectUrl}`
  }
  if (normalizedEncodedLength > 0) {
    return `Chrome reported ${harpoFormatByteCount(normalizedEncodedLength)} on the wire, but CDP did not expose a readable response body. HARPO exhausted Fetch interception, streaming capture, and Network.getResponseBody retries.`
  }
  return "No response bytes were recorded for this response."
}

function harpoRememberCapturedBodyResult(requestKey = "", bodyResult = null, fallbackComment = "") {
  const normalizedBodyResult = harpoHasBodyResult(bodyResult)
    ? {
        text: String(bodyResult?.text || ""),
        encoding: String(bodyResult?.encoding || ""),
        comment: String(bodyResult?.comment || "")
      }
    : harpoBuildEmptyBodyResult(fallbackComment)

  if (requestKey) {
    harpoState.capturedResponseBodies.set(requestKey, normalizedBodyResult)
  }
  return normalizedBodyResult
}

function harpoShouldTreatResponseAsBodyless(request = null, response = null) {
  const requestMethod = String(request?.method || "").trim().toUpperCase()
  const resourceType = String(request?.resourceType || "").trim()
  const responseStatus = Number(response?.status || response?.responseStatusCode || 0)
  const responseHeaders = Array.isArray(response?.headers)
    ? response.headers
    : harpoNormalizeFetchHeaderEntries(response?.responseHeaders)
  const redirectUrl = harpoGetHeaderValue(responseHeaders, "location")

  if (HARPO_SKIP_BODY_TYPES.has(resourceType)) return true
  if (requestMethod === "HEAD") return true
  if (resourceType === "Preflight" || requestMethod === "OPTIONS") return true
  if ([204, 205, 304].includes(responseStatus)) return true
  if ([301, 302, 303, 307, 308].includes(responseStatus) && redirectUrl) return true
  return false
}

function harpoSendDebuggerCommand(debuggee, method, commandParams = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee, method, commandParams, (result) => {
      const lastErrorMessage = chrome.runtime.lastError?.message || ""
      if (lastErrorMessage) {
        reject(new Error(lastErrorMessage))
        return
      }
      resolve(result)
    })
  })
}

async function harpoContinueFetchRequest(debuggeeId, requestId = "") {
  const normalizedRequestId = String(requestId || "").trim()
  if (!normalizedRequestId) return
  await harpoSendDebuggerCommand(debuggeeId, "Fetch.continueRequest", {
    requestId: normalizedRequestId
  }).catch(() => {})
}

async function harpoReadIoStreamAsBase64(debuggeeId, streamHandle = "") {
  const normalizedStreamHandle = String(streamHandle || "").trim()
  if (!normalizedStreamHandle) {
    return ""
  }

  const chunks = []
  try {
    while (true) {
      const result = await harpoSendDebuggerCommand(debuggeeId, "IO.read", {
        handle: normalizedStreamHandle,
        size: 64 * 1024
      })
      const rawData = typeof result?.data === "string" ? result.data : ""
      if (rawData) {
        chunks.push(result?.base64Encoded ? harpoBase64ToBytes(rawData) : harpoTextToBytes(rawData))
      }
      if (result?.eof) {
        break
      }
    }
  } finally {
    await harpoSendDebuggerCommand(debuggeeId, "IO.close", {
      handle: normalizedStreamHandle
    }).catch(() => {})
  }

  return harpoBytesToBase64(harpoConcatByteChunks(chunks))
}

async function harpoFulfillFetchResponse(debuggeeId, requestId = "", params = {}, body = null) {
  const normalizedRequestId = String(requestId || "").trim()
  if (!normalizedRequestId) return
  const responseHeaders = harpoNormalizeFetchHeaderEntries(params?.responseHeaders)
  const responseCode = Number(params?.responseStatusCode || 200)
  const responsePhrase = String(params?.responseStatusText || "").trim()

  await harpoSendDebuggerCommand(debuggeeId, "Fetch.fulfillRequest", {
    requestId: normalizedRequestId,
    responseCode,
    ...(responsePhrase ? { responsePhrase } : {}),
    ...(responseHeaders.length ? { responseHeaders } : {}),
    ...(typeof body === "string" ? { body } : {})
  })
}

async function harpoHandleFetchRequestPaused(debuggeeId, params = {}) {
  const fetchRequestId = String(params?.requestId || "").trim()
  if (!fetchRequestId) {
    return
  }

  const isResponseStage =
    Object.prototype.hasOwnProperty.call(params, "responseStatusCode") ||
    Object.prototype.hasOwnProperty.call(params, "responseErrorReason")
  if (!isResponseStage) {
    await harpoContinueFetchRequest(debuggeeId, fetchRequestId)
    return
  }

  const networkRequestId = String(params?.networkId || "").trim()
  const requestKey = networkRequestId
    ? harpoBuildRequestKey(debuggeeId?.tabId, networkRequestId)
    : ""
  const trackedRequest = requestKey
    ? harpoState.pendingRequests.get(requestKey) || harpoState.observedRequests.get(requestKey) || null
    : null
  const resourceType = String(params?.resourceType || trackedRequest?.resourceType || "")
  const fetchResponseMeta = {
    responseStatusCode: Number(params?.responseStatusCode || 0),
    responseStatusText: String(params?.responseStatusText || ""),
    responseHeaders: harpoNormalizeFetchHeaderEntries(params?.responseHeaders)
  }
  const responseContentType = harpoResolveResponseContentType(fetchResponseMeta)

  if (
    !requestKey ||
    !trackedRequest ||
    HARPO_SKIP_BODY_TYPES.has(resourceType) ||
    harpoIsFetchRedirectResponse(params) ||
    harpoShouldTreatResponseAsBodyless(trackedRequest, fetchResponseMeta)
  ) {
    await harpoContinueFetchRequest(debuggeeId, fetchRequestId)
    return
  }

  const existingBodyPromise = harpoState.pendingFetchResponseBodies.get(requestKey)
  if (existingBodyPromise) {
    await harpoContinueFetchRequest(debuggeeId, fetchRequestId)
    return
  }

  const capturePromise = (async () => {
    let streamTaken = false
    let fulfilled = false
    let streamedBody = null
    try {
      let bodyResult = null
      try {
        const streamResult = await harpoSendDebuggerCommand(debuggeeId, "Fetch.takeResponseBodyAsStream", {
          requestId: fetchRequestId
        })
        streamTaken = true
        const body = await harpoReadIoStreamAsBase64(debuggeeId, String(streamResult?.stream || ""))
        streamedBody = body
        bodyResult = harpoNormalizeCapturedBodyResult({
          text: body,
          encoding: body ? "base64" : "",
          comment: ""
        }, { contentType: responseContentType })
        await harpoFulfillFetchResponse(debuggeeId, fetchRequestId, params, body)
        fulfilled = true
      } catch {
        if (!streamTaken) {
          const result = await harpoSendDebuggerCommand(debuggeeId, "Fetch.getResponseBody", {
            requestId: fetchRequestId
          })
          bodyResult = harpoBuildFetchBodyResult(result, responseContentType)
          await harpoContinueFetchRequest(debuggeeId, fetchRequestId)
          fulfilled = true
        } else {
          throw new Error("HARPO stream replay failed")
        }
      }
      if (harpoHasBodyResult(bodyResult)) {
        harpoState.fetchResponseBodies.set(requestKey, bodyResult)
        harpoRememberCapturedBodyResult(requestKey, bodyResult)
      }
      return bodyResult
    } catch {
      if (streamTaken && !fulfilled) {
        await harpoFulfillFetchResponse(debuggeeId, fetchRequestId, params, streamedBody).catch(() => {})
      } else if (!streamTaken && !fulfilled) {
        await harpoContinueFetchRequest(debuggeeId, fetchRequestId).catch(() => {})
      }
      return harpoBuildEmptyBodyResult()
    } finally {
      harpoState.pendingFetchResponseBodies.delete(requestKey)
    }
  })()

  harpoState.pendingFetchResponseBodies.set(requestKey, capturePromise)
}

function harpoMaybeCaptureRequestPostData(tabId, requestId = "", requestKey = "", requestRecord = null, requestMeta = {}) {
  const normalizedRequestId = String(requestId || "").trim()
  const safeRequestRecord =
    requestRecord && typeof requestRecord === "object" ? requestRecord : null
  const hasPostData =
    Boolean(requestMeta?.hasPostData) ||
    (Array.isArray(requestMeta?.postDataEntries) && requestMeta.postDataEntries.length > 0)

  if (!normalizedRequestId || !requestKey || !safeRequestRecord || safeRequestRecord.postData || !hasPostData) {
    return
  }

  if (harpoState.pendingRequestPostData.has(requestKey)) {
    return
  }

  const capturePromise = harpoSendDebuggerCommand({ tabId: Number(tabId || 0) }, "Network.getRequestPostData", {
    requestId: normalizedRequestId
  }).then((result) => {
    const requestBody = harpoBuildRequestBodyResult(result, harpoResolveRequestContentType(safeRequestRecord))
    if (requestBody.text) {
      safeRequestRecord.postData = requestBody.text
    }
    return requestBody
  }).catch(() => harpoBuildEmptyBodyResult()).finally(() => {
    harpoState.pendingRequestPostData.delete(requestKey)
  })

  harpoState.pendingRequestPostData.set(requestKey, capturePromise)
}

function harpoWait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function harpoShouldRetryBodyFetch(errorMessage = "") {
  const normalizedMessage = String(errorMessage || "").trim().toLowerCase()
  if (!normalizedMessage) return false
  return (
    normalizedMessage.includes("no resource with given identifier found") ||
    normalizedMessage.includes("request content was evicted from inspector cache") ||
    normalizedMessage.includes("cannot access contents of url")
  )
}

function harpoMaybeStartStreamingBody(tabId, requestKey = "", requestId = "", resourceType = "") {
  if (!requestKey || !requestId) return
  if (HARPO_SKIP_BODY_TYPES.has(String(resourceType || ""))) return
  const existingState = harpoState.pendingStreamBodies.get(requestKey)
  if (existingState?.started) return
  const streamState = existingState || {
    tabId: Number(tabId || 0),
    requestId: String(requestId || ""),
    chunks: [],
    started: true,
    active: false
  }
  streamState.tabId = Number(tabId || 0)
  streamState.requestId = String(requestId || "")
  streamState.started = true
  harpoState.pendingStreamBodies.set(requestKey, streamState)

  chrome.debugger.sendCommand({ tabId: Number(tabId || 0) }, "Network.streamResourceContent", { requestId }, (result) => {
    if (chrome.runtime.lastError) {
      streamState.active = false
      return
    }
    streamState.active = true
    if (typeof result?.bufferedData === "string" && result.bufferedData) {
      streamState.chunks.push(result.bufferedData)
    }
  })
}

function harpoBuildObservedBodyPromise(request = null, debuggeeId = 0, requestId = "", requestKey = "") {
  return harpoCaptureObservedBody(request, debuggeeId, requestId, requestKey)
}

function harpoCaptureObservedBody(
  request = null,
  debuggeeId = 0,
  requestId = "",
  requestKey = "",
  {
    response = null,
    failed = false,
    errorText = "",
    encodedDataLength = 0
  } = {}
) {
  const resourceType = String(request?.resourceType || "")
  const responseContentType = harpoResolveResponseContentType(response)
  const fallbackComment = harpoBuildMissingBodyComment(request, response, {
    failed,
    errorText,
    encodedDataLength
  })

  const capturedBody = harpoState.capturedResponseBodies.get(requestKey)
  if (harpoHasBodyResult(capturedBody)) {
    return Promise.resolve(capturedBody)
  }

  const pendingBodyCapture = harpoState.pendingCapturedResponseBodies.get(requestKey)
  if (pendingBodyCapture) {
    return pendingBodyCapture
  }

  if (HARPO_SKIP_BODY_TYPES.has(resourceType)) {
    return Promise.resolve(harpoRememberCapturedBodyResult(requestKey, null, fallbackComment))
  }

  const capturePromise = (async () => {
    let candidateBody = null
    const pendingInterceptedBody = harpoState.pendingFetchResponseBodies.get(requestKey)
    if (pendingInterceptedBody) {
      candidateBody = await pendingInterceptedBody.catch(() => harpoBuildEmptyBodyResult())
    }

    if (harpoHasBodyResult(candidateBody)) {
      return harpoRememberCapturedBodyResult(
        requestKey,
        harpoNormalizeCapturedBodyResult(candidateBody, { contentType: responseContentType }),
        fallbackComment
      )
    }

    const interceptedBody = harpoState.fetchResponseBodies.get(requestKey)
    if (harpoHasBodyResult(interceptedBody)) {
      return harpoRememberCapturedBodyResult(
        requestKey,
        harpoNormalizeCapturedBodyResult(interceptedBody, { contentType: responseContentType }),
        fallbackComment
      )
    }

    const streamedBody = harpoNormalizeCapturedBodyResult(
      harpoBuildStreamBodyResult(requestKey),
      { contentType: responseContentType }
    )
    if (streamedBody) {
      return harpoRememberCapturedBodyResult(requestKey, streamedBody, fallbackComment)
    }

    const networkBody = await Promise.race([
      harpoFetchOneBody(debuggeeId, requestId, responseContentType),
      new Promise((resolve) => setTimeout(() => resolve(harpoBuildEmptyBodyResult()), 4000))
    ]).catch(() => harpoBuildEmptyBodyResult())
    return harpoRememberCapturedBodyResult(requestKey, networkBody, fallbackComment)
  })().finally(() => {
    harpoState.pendingCapturedResponseBodies.delete(requestKey)
  })

  harpoState.pendingCapturedResponseBodies.set(requestKey, capturePromise)
  return capturePromise
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
  harpoState.pendingCapturedResponseBodies.delete(requestKey)
  harpoState.pendingStreamBodies.delete(requestKey)
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
      harpoState.pendingCapturedResponseBodies.delete(requestKey)
      harpoState.pendingStreamBodies.delete(requestKey)
    }
  }
  for (const requestKey of [...harpoState.pendingRequestExtras.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.pendingRequestExtras.delete(requestKey)
    }
  }
  for (const requestKey of [...harpoState.pendingRequestPostData.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.pendingRequestPostData.delete(requestKey)
    }
  }
  for (const requestKey of [...harpoState.completedObservedRequests.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.completedObservedRequests.delete(requestKey)
    }
  }
  for (const requestKey of [...harpoState.fetchResponseBodies.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.fetchResponseBodies.delete(requestKey)
    }
  }
  for (const requestKey of [...harpoState.capturedResponseBodies.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.capturedResponseBodies.delete(requestKey)
    }
  }
  for (const requestKey of [...harpoState.pendingCapturedResponseBodies.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.pendingCapturedResponseBodies.delete(requestKey)
    }
  }
  for (const requestKey of [...harpoState.pendingFetchResponseBodies.keys()]) {
    if (requestKey.startsWith(`${normalizedTabId}:`)) {
      harpoState.pendingFetchResponseBodies.delete(requestKey)
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
  return shouldPersistHarpoCapturedEntry(entry, captureSession)
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

  try {
    await new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId: normalizedTabId }, "Network.enable", {
        maxTotalBufferSize: HARPO_NETWORK_MAX_TOTAL_BUFFER_SIZE,
        maxResourceBufferSize: HARPO_NETWORK_MAX_RESOURCE_BUFFER_SIZE,
        maxPostDataSize: HARPO_NETWORK_MAX_POST_DATA_SIZE
      }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else resolve()
      })
    })
  } catch {
    await new Promise((resolve, reject) => {
      chrome.debugger.sendCommand({ tabId: normalizedTabId }, "Network.enable", {}, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else resolve()
      })
    })
  }

  chrome.debugger.sendCommand({ tabId: normalizedTabId }, "Network.configureDurableMessages", {
    enable: true,
    maxTotalBufferSize: HARPO_NETWORK_MAX_TOTAL_BUFFER_SIZE
  }, () => void chrome.runtime.lastError)

  chrome.debugger.sendCommand({ tabId: normalizedTabId }, "Fetch.enable", {
    patterns: HARPO_FETCH_INTERCEPT_RESOURCE_TYPES.map((resourceType) => ({
      resourceType,
      requestStage: "Response"
    }))
  }, () => void chrome.runtime.lastError)

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
      harpoMaybeCaptureRequestPostData(tabId, params.requestId, requestKey, observedRequest, params.request)
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
      harpoMaybeStartStreamingBody(
        tabId,
        requestKey,
        params.requestId,
        harpoState.pendingRequests.get(requestKey)?.resourceType || harpoState.observedRequests.get(requestKey)?.resourceType || params.type || ""
      )
      break
      }

    case "Network.dataReceived": {
      const requestKey = harpoBuildRequestKey(tabId, params.requestId)
      const streamState = harpoState.pendingStreamBodies.get(requestKey)
      if (!streamState) break
      if (typeof params.data === "string" && params.data) {
        streamState.chunks.push(params.data)
      }
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
          bodyPromise: harpoCaptureObservedBody(req, debuggeeId, params.requestId, requestKey, {
            response: resp,
            encodedDataLength: params.encodedDataLength || 0
          })
        })
      } else {
        const observedRequest = harpoState.observedRequests.get(requestKey)
        if (observedRequest) {
          harpoState.completedObservedRequests.set(requestKey, {
            requestId: params.requestId,
            endTime: params.timestamp,
            encodedDataLength: params.encodedDataLength || 0,
            bodyPromise: harpoCaptureObservedBody(observedRequest, debuggeeId, params.requestId, requestKey, {
              response: resp,
              encodedDataLength: params.encodedDataLength || 0
            })
          })
          harpoPromoteObservedRequests()
        } else {
          harpoState.pendingRequestExtras.delete(requestKey)
          harpoState.pendingResponses.delete(requestKey)
          harpoState.pendingCapturedResponseBodies.delete(requestKey)
          harpoState.pendingStreamBodies.delete(requestKey)
          harpoState.completedObservedRequests.delete(requestKey)
        }
      }
      break
    }

    case "Network.loadingFailed": {
      const requestKey = harpoBuildRequestKey(tabId, params.requestId)
      const req = harpoState.pendingRequests.get(requestKey)
      const resp = harpoState.pendingResponses.get(requestKey)
      if (req) {
        harpoFinalizeCapturedRequest(requestKey, {
          requestId: params.requestId,
          endTime: params.timestamp,
          bodyPromise: harpoCaptureObservedBody(req, debuggeeId, params.requestId, requestKey, {
            response: resp,
            failed: true,
            errorText: params.errorText || ""
          }),
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
            bodyPromise: harpoCaptureObservedBody(observedRequest, debuggeeId, params.requestId, requestKey, {
              response: resp,
              failed: true,
              errorText: params.errorText || ""
            }),
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
          harpoState.pendingCapturedResponseBodies.delete(requestKey)
          harpoState.pendingStreamBodies.delete(requestKey)
          harpoState.completedObservedRequests.delete(requestKey)
        }
      }
      break
    }

    case "Fetch.requestPaused": {
      void harpoHandleFetchRequestPaused(debuggeeId, params)
      break
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HARPO — Response body fetcher (concurrent pool, skip binary types)
// ═══════════════════════════════════════════════════════════════════════════════

function harpoFetchOneBody(tabId, requestId, contentType = "") {
  return (async () => {
    for (let attempt = 0; attempt <= HARPO_BODY_FETCH_RETRY_DELAYS_MS.length; attempt++) {
      const outcome = await new Promise((resolve) => {
        chrome.debugger.sendCommand({ tabId }, "Network.getResponseBody", { requestId }, (result) => {
          const lastErrorMessage = chrome.runtime.lastError?.message || ""
          if (lastErrorMessage) {
            resolve({
              ok: false,
              retryable: harpoShouldRetryBodyFetch(lastErrorMessage)
            })
            return
          }
          if (!result) {
            resolve({
              ok: false,
              retryable: false
            })
            return
          }
          resolve({
            ok: true,
            body: harpoNormalizeCapturedBodyResult({
              text: result.body || "",
              encoding: result.base64Encoded ? "base64" : "",
              comment: ""
            }, { contentType })
          })
        })
      })

      if (outcome.ok) {
        return outcome.body
      }
      if (!outcome.retryable || attempt >= HARPO_BODY_FETCH_RETRY_DELAYS_MS.length) {
        break
      }
      await harpoWait(HARPO_BODY_FETCH_RETRY_DELAYS_MS[attempt])
    }

    return harpoBuildEmptyBodyResult()
  })()
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
        const settled = await entry.bodyPromise.catch(() => harpoBuildEmptyBodyResult())
        bodyMap.set(entry.requestKey || harpoBuildRequestKey(entry.tabId, entry.requestId), settled)
        continue
      }
      const requestKey = entry.requestKey || harpoBuildRequestKey(entry.tabId, entry.requestId)
      const capturedBody = harpoState.capturedResponseBodies.get(requestKey)
      if (harpoHasBodyResult(capturedBody)) {
        bodyMap.set(requestKey, capturedBody)
        continue
      }
      const body = await Promise.race([
        harpoFetchOneBody(Number(entry.tabId || 0), entry.requestId),
        new Promise((resolve) => setTimeout(() => resolve(harpoBuildEmptyBodyResult()), 4000))
      ]).catch(() => harpoBuildEmptyBodyResult())
      bodyMap.set(requestKey, body)
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
  if (harpoState.pendingRequestPostData.size > 0) {
    await Promise.allSettled([...harpoState.pendingRequestPostData.values()])
  }
  const entries = [...harpoState.entries]
  const bodyMap = await harpoFetchAllBodies(entries)

  const harEntries = entries.map((entry) => {
    const req          = entry.req
    const resp         = entry.resp || {}
    const requestKey   = entry.requestKey || harpoBuildRequestKey(entry.tabId, entry.requestId)
    const startMs      = Math.round((req.startTime || 0) * 1000)
    const fallbackComment = harpoBuildMissingBodyComment(req, resp, {
      failed: Boolean(entry.failed),
      errorText: String(entry.errorText || ""),
      encodedDataLength: Number(resp.encodedDataLength || entry.encodedDataLength || 0)
    })
    const responseBodyCandidate = bodyMap.get(requestKey)
    const responseBody = harpoHasBodyResult(responseBodyCandidate)
      ? responseBodyCandidate
      : harpoBuildEmptyBodyResult(fallbackComment)
    const requestContentType = harpoResolveRequestContentType(req)
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
          ...(responseBody.comment ? { comment: responseBody.comment } : {})
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
  harpoState.pendingRequestPostData.clear()
  harpoState.capturedResponseBodies.clear()
  harpoState.pendingCapturedResponseBodies.clear()
  harpoState.fetchResponseBodies.clear()
  harpoState.pendingFetchResponseBodies.clear()
  harpoState.pendingStreamBodies.clear()
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
  const programmerName = harpoState.programmerName
  const requestorId = harpoState.requestorId
  const requestorName = harpoState.requestorName
  const programmerDomains = [...harpoState.programmerDomains]
  const safeDomains = [...harpoState.safeDomains]
  const captureSession = {
    ...harpoState.captureSession,
    programmerDomains: Array.isArray(harpoState.captureSession?.programmerDomains)
      ? [...harpoState.captureSession.programmerDomains]
      : [],
    safeDomains: Array.isArray(harpoState.captureSession?.safeDomains)
      ? [...harpoState.captureSession.safeDomains]
      : [],
    mvpdDomains: Array.isArray(harpoState.captureSession?.mvpdDomains)
      ? [...harpoState.captureSession.mvpdDomains]
      : [],
    returnDomains: Array.isArray(harpoState.captureSession?.returnDomains)
      ? [...harpoState.captureSession.returnDomains]
      : []
  }
  const startedAt = harpoState.startedAt || new Date().toISOString()

  harpoState.recording = false
  harpoState.stopRequested = false
  harpoClearAutoStopTimer()
  harpoStopKeepalive()

  // Build HAR while debugger is still attached (required for body fetching)
  let har        = null
  let buildError = null
  try {
    har = await harpoBuildHar(harpoState.captureSession)
  } catch (err) {
    buildError = err instanceof Error ? err.message : String(err)
  }

  await Promise.all(trackedTabIds.map((trackedTabId) =>
    harpoSendDebuggerCommand({ tabId: trackedTabId }, "Fetch.disable").catch(() => null)
  ))

  chrome.debugger.onEvent.removeListener(harpoOnDebuggerEvent)
  chrome.tabs.onCreated.removeListener(harpoHandleTrackedTabCreated)
  chrome.tabs.onRemoved.removeListener(harpoHandleTrackedTabRemoved)
  if (chrome.webNavigation?.onCreatedNavigationTarget) {
    chrome.webNavigation.onCreatedNavigationTarget.removeListener(harpoHandleCreatedNavigationTarget)
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
  harpoState.programmerName = ""
  harpoState.requestorId = ""
  harpoState.requestorName = ""
  harpoState.programmerDomains = []
  harpoState.safeDomains = []
  harpoState.startedAt = null
  harpoState.captureSession = createHarpoCaptureSession()
  harpoState.observedRequests.clear()
  harpoState.pendingRequestPostData.clear()
  harpoState.capturedResponseBodies.clear()
  harpoState.pendingCapturedResponseBodies.clear()
  harpoState.fetchResponseBodies.clear()
  harpoState.pendingFetchResponseBodies.clear()
  harpoState.pendingStreamBodies.clear()
  harpoState.pendingRequestExtras.clear()
  harpoState.pendingRequests.clear()
  harpoState.pendingResponses.clear()
  harpoState.completedObservedRequests.clear()

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
      programmerName,
      requestorId,
      requestorName,
      programmerDomains,
      safeDomains,
      mvpdDomains:     Array.isArray(captureSession?.mvpdDomains)
        ? captureSession.mvpdDomains
        : [],
      createdAt:       startedAt
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

  if (message?.type === LOGINBUTTON_FETCH_AVATAR_REQUEST_TYPE) {
    void fetchLoginButtonAvatarAsDataUrl(
      String(message?.url || ""),
      String(message?.accessToken || ""),
      String(message?.clientId || "")
    )
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: serializeBackgroundError(error) }))
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
