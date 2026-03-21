import {
  clearLoginButtonVault,
  deleteProgrammerVaultRecord,
  exportLoginButtonVaultSnapshot,
  getLoginButtonVaultStats,
  importLoginButtonVaultSnapshot,
  readProgrammerVaultRecord
} from "./vault.js"

const LOGINBUTTON_VAULT_REQUEST_TYPE = "loginbutton:vault"
const LOGINBUTTON_GET_UPDATE_STATE_REQUEST_TYPE = "loginbutton:getUpdateState"
const LOGINBUTTON_GET_LATEST_REQUEST_TYPE = "loginbutton:getLatest"
const LOGINBUTTON_GITHUB_OWNER = "HH5HH"
const LOGINBUTTON_GITHUB_REPO = "LOGINBUTTON"
const LOGINBUTTON_LATEST_REF_API_URL =
  `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/git/ref/heads/main`
const LOGINBUTTON_LATEST_COMMIT_API_URL =
  `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/commits/main`
const LOGINBUTTON_PACKAGE_METADATA_PATH = "loginbutton_distro.version.json"
const LOGINBUTTON_LATEST_PACKAGE_METADATA_URL =
  `https://raw.githubusercontent.com/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/main/${LOGINBUTTON_PACKAGE_METADATA_PATH}`
const LOGINBUTTON_LATEST_PACKAGE_METADATA_API_URL =
  `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/contents/${LOGINBUTTON_PACKAGE_METADATA_PATH}?ref=main`
const LOGINBUTTON_LATEST_PACKAGE_URL =
  `https://raw.githubusercontent.com/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/main/loginbutton_distro.zip`
const LOGINBUTTON_LOCAL_PACKAGE_PATH = "loginbutton_distro.zip"
const CHROME_EXTENSIONS_URL = "chrome://extensions"
const UPDATE_CHECK_TTL_MS = 10 * 60 * 1000

const updateState = {
  currentVersion: "",
  latestVersion: "",
  latestCommitSha: "",
  updateAvailable: false,
  lastCheckedAt: 0,
  checkError: "",
  inFlight: null
}

async function syncSidePanelBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return
  }

  try {
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true
    })
  } catch {
    // Ignore unsupported environments.
  }
}

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
  for (let index = 0; index < length; index += 1) {
    const aPart = parseVersionPart(aParts[index])
    const bPart = parseVersionPart(bParts[index])
    if (aPart > bPart) {
      return 1
    }
    if (aPart < bPart) {
      return -1
    }
  }
  return 0
}

function extractVersionFromManifestObject(manifest) {
  const version = manifest?.version ? String(manifest.version).trim() : ""
  if (!version) {
    throw new Error("Latest version unavailable")
  }
  return version
}

function buildLatestLoginButtonPackageMetadataRawUrl(ref = "") {
  const normalizedRef = String(ref || "").trim().toLowerCase()
  const metadataRef = /^[a-f0-9]{40}$/.test(normalizedRef) ? normalizedRef : ""
  return metadataRef
    ? `https://raw.githubusercontent.com/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/${metadataRef}/${LOGINBUTTON_PACKAGE_METADATA_PATH}`
    : LOGINBUTTON_LATEST_PACKAGE_METADATA_URL
}

function buildLatestLoginButtonPackageMetadataApiUrl(ref = "") {
  const normalizedRef = String(ref || "").trim().toLowerCase()
  const metadataRef = /^[a-f0-9]{40}$/.test(normalizedRef) ? normalizedRef : ""
  return metadataRef
    ? `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/contents/${LOGINBUTTON_PACKAGE_METADATA_PATH}?ref=${metadataRef}`
    : LOGINBUTTON_LATEST_PACKAGE_METADATA_API_URL
}

async function fetchLatestLoginButtonVersionFromRaw(ref = "") {
  const response = await fetch(buildLatestLoginButtonPackageMetadataRawUrl(ref), { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const manifest = await response.json()
  return extractVersionFromManifestObject(manifest)
}

async function fetchLatestLoginButtonVersionFromGithubApi(ref = "") {
  const response = await fetch(buildLatestLoginButtonPackageMetadataApiUrl(ref), { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const payload = await response.json()
  const encoded = payload?.content ? String(payload.content).replace(/\s+/g, "") : ""
  if (!encoded) {
    throw new Error("GitHub API content unavailable")
  }
  let decoded = ""
  try {
    decoded = atob(encoded)
  } catch {
    throw new Error("GitHub API manifest decode failed")
  }
  return extractVersionFromManifestObject(JSON.parse(decoded))
}

async function fetchLatestLoginButtonVersion(ref = "") {
  const normalizedRef = normalizeCommitSha(ref)
  const resolvers = normalizedRef
    ? [
        () => fetchLatestLoginButtonVersionFromRaw(normalizedRef),
        () => fetchLatestLoginButtonVersionFromGithubApi(normalizedRef),
        () => fetchLatestLoginButtonVersionFromGithubApi(),
        () => fetchLatestLoginButtonVersionFromRaw()
      ]
    : [fetchLatestLoginButtonVersionFromGithubApi, fetchLatestLoginButtonVersionFromRaw]
  let lastError = null
  for (const resolver of resolvers) {
    try {
      return await resolver()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error("Latest version unavailable")
}

function normalizeCommitSha(value) {
  const sha = String(value || "").trim().toLowerCase()
  return /^[a-f0-9]{40}$/.test(sha) ? sha : ""
}

function extractCommitShaFromRefPayload(payload) {
  return normalizeCommitSha(payload?.object?.sha)
}

function extractCommitShaFromCommitPayload(payload) {
  return normalizeCommitSha(payload?.sha)
}

async function fetchLatestLoginButtonCommitShaFromRefApi() {
  const response = await fetch(LOGINBUTTON_LATEST_REF_API_URL, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const payload = await response.json()
  const sha = extractCommitShaFromRefPayload(payload)
  if (!sha) {
    throw new Error("Git ref API commit SHA unavailable")
  }
  return sha
}

async function fetchLatestLoginButtonCommitShaFromCommitApi() {
  const response = await fetch(LOGINBUTTON_LATEST_COMMIT_API_URL, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const payload = await response.json()
  const sha = extractCommitShaFromCommitPayload(payload)
  if (!sha) {
    throw new Error("Commit API SHA unavailable")
  }
  return sha
}

async function fetchLatestLoginButtonCommitSha() {
  let lastError = null
  for (const resolver of [fetchLatestLoginButtonCommitShaFromRefApi, fetchLatestLoginButtonCommitShaFromCommitApi]) {
    try {
      return await resolver()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error("Latest commit SHA unavailable")
}

function withCacheBust(url) {
  const text = String(url || "").trim()
  if (!text) {
    return ""
  }
  const value = `cacheBust=${Date.now()}`
  return text.includes("?") ? `${text}&${value}` : `${text}?${value}`
}

function buildLatestLoginButtonPackageUrl(commitSha = "") {
  const normalizedSha = normalizeCommitSha(commitSha)
  const baseUrl = normalizedSha
    ? `https://raw.githubusercontent.com/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/${normalizedSha}/loginbutton_distro.zip`
    : LOGINBUTTON_LATEST_PACKAGE_URL
  return withCacheBust(baseUrl)
}

function buildLocalLoginButtonPackageUrl() {
  try {
    const runtimeUrl = chrome.runtime?.getURL ? chrome.runtime.getURL(LOGINBUTTON_LOCAL_PACKAGE_PATH) : ""
    return withCacheBust(runtimeUrl)
  } catch {
    return ""
  }
}

function shouldPreferLocalLoginButtonPackage(currentVersion = "", latestVersion = "") {
  const normalizedCurrent = String(currentVersion || "").trim()
  const normalizedLatest = String(latestVersion || "").trim()
  if (!normalizedCurrent || !normalizedLatest) {
    return false
  }
  return compareVersions(normalizedCurrent, normalizedLatest) > 0
}

function sanitizeLatestPackageFileSegment(value = "", fallback = "latest") {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || fallback
}

function buildLatestLoginButtonPackageFileName(latestVersion = "", commitSha = "") {
  const versionSegment = sanitizeLatestPackageFileSegment(latestVersion, "latest")
  const shaSegment = normalizeCommitSha(commitSha).slice(0, 7)
  return shaSegment
    ? `LoginButton-v${versionSegment}-${shaSegment}.zip`
    : `LoginButton-v${versionSegment}.zip`
}

function startLatestPackageDownload(downloadOptions = {}) {
  if (!chrome.downloads || typeof chrome.downloads.download !== "function") {
    return Promise.reject(new Error("Chrome downloads API unavailable"))
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finishResolve = (value) => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    const finishReject = (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    }

    try {
      const maybePromise = chrome.downloads.download(downloadOptions, (downloadId) => {
        const runtimeError = chrome.runtime?.lastError
        if (runtimeError) {
          finishReject(new Error(runtimeError.message || "Chrome downloads API failed"))
          return
        }
        finishResolve(downloadId)
      })
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(finishResolve, finishReject)
      }
    } catch (error) {
      finishReject(error instanceof Error ? error : new Error(String(error || "Chrome downloads API failed")))
    }
  })
}

function getUpdateStatePayload() {
  return {
    currentVersion: updateState.currentVersion || getLoginButtonBuildVersion(),
    latestVersion: updateState.latestVersion || "",
    latestCommitSha: updateState.latestCommitSha || "",
    updateAvailable: updateState.updateAvailable === true,
    checkedAt: Number(updateState.lastCheckedAt || 0),
    checkError: updateState.checkError || ""
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

  if (updateState.inFlight) {
    return updateState.inFlight
  }

  updateState.inFlight = (async () => {
    const previous = {
      latestVersion: updateState.latestVersion,
      latestCommitSha: updateState.latestCommitSha,
      updateAvailable: updateState.updateAvailable === true,
      checkError: updateState.checkError
    }
    try {
      const latestCommitSha = await fetchLatestLoginButtonCommitSha().catch(() => "")
      const latestVersion = await fetchLatestLoginButtonVersion(latestCommitSha)
      updateState.latestVersion = latestVersion
      updateState.latestCommitSha = normalizeCommitSha(latestCommitSha)
      updateState.updateAvailable = compareVersions(currentVersion, latestVersion) < 0
      updateState.checkError = ""
    } catch (error) {
      updateState.latestVersion = previous.latestVersion || ""
      updateState.latestCommitSha = previous.latestCommitSha || ""
      updateState.updateAvailable = previous.updateAvailable === true
      updateState.checkError = error instanceof Error ? error.message : "Version check failed"
    } finally {
      updateState.lastCheckedAt = Date.now()
      updateState.inFlight = null
    }
    const payload = getUpdateStatePayload()
    const changed =
      previous.latestVersion !== updateState.latestVersion ||
      previous.latestCommitSha !== updateState.latestCommitSha ||
      previous.updateAvailable !== (updateState.updateAvailable === true) ||
      previous.checkError !== updateState.checkError
    return { ...payload, changed }
  })()

  return updateState.inFlight
}

async function openLoginButtonGetLatestFlow() {
  await refreshUpdateState({ force: true }).catch(() => {})
  const currentVersion = getLoginButtonBuildVersion()
  const useFreshLatestMetadata = !updateState.checkError
  const latestVersion = useFreshLatestMetadata ? updateState.latestVersion || "" : ""
  const latestCommitSha = useFreshLatestMetadata ? updateState.latestCommitSha || "" : ""
  const preferLocalPackage = shouldPreferLocalLoginButtonPackage(currentVersion, latestVersion)
  const downloadUrl = preferLocalPackage
    ? buildLocalLoginButtonPackageUrl()
    : buildLatestLoginButtonPackageUrl(latestCommitSha)
  const downloadFileName = preferLocalPackage
    ? buildLatestLoginButtonPackageFileName(currentVersion, "")
    : buildLatestLoginButtonPackageFileName(latestVersion, latestCommitSha)
  const result = {
    ok: false,
    downloadUrl,
    downloadFileName,
    currentVersion,
    latestVersion,
    latestCommitSha,
    updateAvailable: updateState.updateAvailable === true,
    checkError: updateState.checkError || "",
    downloadSource: preferLocalPackage ? "local-runtime" : "github-remote",
    downloadId: 0,
    downloadStarted: false,
    downloadTabOpened: false,
    extensionsOpened: false
  }
  try {
    if (!downloadUrl) {
      throw new Error("No LoginButton package URL available")
    }
    const createdDownloadId = await startLatestPackageDownload({
      url: downloadUrl,
      filename: downloadFileName,
      conflictAction: "uniquify",
      saveAs: false
    })
    result.downloadId = Number(createdDownloadId || 0)
    result.downloadStarted = true
  } catch {
    try {
      await chrome.tabs.create({ url: downloadUrl })
      result.downloadTabOpened = true
    } catch {
      // Continue so Chrome extensions can still open.
    }
  }
  try {
    await chrome.tabs.create({ url: CHROME_EXTENSIONS_URL })
    result.extensionsOpened = true
  } catch {
    // Ignore tab creation failures here too.
  }
  result.ok = result.downloadStarted || result.downloadTabOpened
  if (!result.ok) {
    result.error = preferLocalPackage
      ? `Loaded LoginButton v${currentVersion || "current"} is newer than GitHub latest v${latestVersion || "remote"}, but the local ${LOGINBUTTON_LOCAL_PACKAGE_PATH} package could not be opened.`
      : "Unable to open update links"
  }
  return result
}

void syncSidePanelBehavior()
void refreshUpdateState({ force: true }).catch(() => {})

chrome.runtime.onInstalled.addListener(() => {
  void syncSidePanelBehavior()
  void refreshUpdateState({ force: true }).catch(() => {})
})

if (chrome.runtime.onStartup?.addListener) {
  chrome.runtime.onStartup.addListener(() => {
    void refreshUpdateState({ force: true }).catch(() => {})
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === LOGINBUTTON_VAULT_REQUEST_TYPE) {
    void (async () => {
      try {
        const result = await handleVaultMessage(message)
        sendResponse({
          ok: true,
          result
        })
      } catch (error) {
        sendResponse({
          ok: false,
          error: serializeBackgroundError(error),
          senderUrl: String(sender?.url || "").trim()
        })
      }
    })()

    return true
  }

  if (message?.type === LOGINBUTTON_GET_UPDATE_STATE_REQUEST_TYPE) {
    void refreshUpdateState({ force: message?.force === true })
      .then((info) => {
        sendResponse(info && typeof info === "object" ? info : getUpdateStatePayload())
      })
      .catch(() => {
        sendResponse(getUpdateStatePayload())
      })

    return true
  }

  if (message?.type === LOGINBUTTON_GET_LATEST_REQUEST_TYPE) {
    void openLoginButtonGetLatestFlow()
      .then((result) => {
        sendResponse(result && typeof result === "object" ? result : { ok: false, error: "Unknown error" })
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
      })

    return true
  }

  return undefined
})

async function handleVaultMessage(message = {}) {
  const action = String(message?.action || "").trim()
  switch (action) {
    case "stats":
      return getLoginButtonVaultStats()
    case "export":
      return exportLoginButtonVaultSnapshot()
    case "import":
      return importLoginButtonVaultSnapshot(message?.payload || null, {
        replaceExisting: message?.replaceExisting === true
      })
    case "clear":
      return clearLoginButtonVault()
    case "get-programmer-record":
      return readProgrammerVaultRecord({
        environmentId: message?.environmentId,
        programmerId: message?.programmerId
      })
    case "delete-programmer-record":
      return deleteProgrammerVaultRecord({
        environmentId: message?.environmentId,
        programmerId: message?.programmerId
      })
    default:
      throw new Error(`Unsupported LoginButton VAULT action: ${action || "unknown"}`)
  }
}

function serializeBackgroundError(error) {
  if (error instanceof Error) {
    return error.message || "Unknown error"
  }

  return String(error || "Unknown error")
}
