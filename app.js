import {
  FLOW_LABEL,
  IMS_CLIENT_ID,
  IMS_IDENTITY_SCOPE,
  IMS_RUNTIME_CONFIG_KEY,
  IMS_ORGS_URL,
  IMS_SCOPE,
  SESSION_KEY,
  buildAuthorizationCodeUrl,
  buildPkceCodeChallenge,
  buildPkceCodeVerifier,
  decodeJwtPayload,
  deriveInitials,
  exchangeAuthorizationCode,
  buildImsProfileHeaders,
  collectProfileAvatarCandidates,
  fetchImsOpenIdConfiguration,
  fetchImsOrganizations,
  fetchImsProfile,
  fetchImsUserInfo,
  firstNonEmptyString,
  flattenOrganizations,
  getDefaultImsRuntimeConfig,
  getDefaultImsOpenIdConfiguration,
  importImsRuntimeConfigFromText,
  isExpired,
  loadImsRuntimeConfig,
  mergeProfilePayloads,
  normalizeImsRuntimeConfig,
  normalizeAvatarCandidate,
  normalizeScopeList,
  parseAuthorizationCodeResponse,
  pickAvatarUrl,
  randomToken,
  redactSensitiveTokenValues,
  revokeImsToken,
  scopeIncludes,
  serializeError
} from "./shared.js";
import {
  DEFAULT_THEME,
  THEME_ACCENTS,
  THEME_STORAGE_KEY,
  getThemeAccentMeta,
  normalizeThemeAccent,
  normalizeThemePreference
} from "./theme-palette.js";

const BUILD_VERSION = chrome.runtime.getManifest().version;
const DEFAULT_CONFIG_STATUS_MESSAGE = "Drop key.";
const DEFAULT_DEBUG_TOGGLE_LABEL = "DEBUG INFO";
const DEFAULT_DEBUG_TOGGLE_META = "Click copies. Shift+click toggles details.";
const DEFAULT_DEBUG_COPY_STATUS = "Copied to clipboard";
const LOGINBUTTON_GET_UPDATE_STATE_REQUEST_TYPE = "loginbutton:getUpdateState";
const LOGINBUTTON_GET_LATEST_REQUEST_TYPE = "loginbutton:getLatest";
const THEME_RAMP_STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600];

const buildBadge = document.getElementById("buildBadge");
const themeControl = document.getElementById("themeControl");
const themePickerButton = document.getElementById("themePickerButton");
const themePickerButtonSwatch = document.getElementById("themePickerButtonSwatch");
const themePickerPopover = document.getElementById("themePickerPopover");
const themeSwatchGrid = document.getElementById("themeSwatchGrid");
const setupView = document.getElementById("setupView");
const zipKeyFileInput = document.getElementById("zipKeyFileInput");
const zipKeyBrowseButton = document.getElementById("zipKeyBrowseButton");
const zipKeyDropSurface = document.getElementById("zipKeyDropSurface");
const zipKeyStatus = document.getElementById("zipKeyStatus");
const zipKeyDropOverlay = document.getElementById("zipKeyDropOverlay");
const loginButtonLabel = document.getElementById("loginButtonLabel");
const loggedOutView = document.getElementById("loggedOutView");
const authenticatedView = document.getElementById("authenticatedView");
const loginButton = document.getElementById("loginButton");
const getLatestButton = document.getElementById("getLatestButton");
const getLatestButtonLabel = document.getElementById("getLatestButtonLabel");
const loadZipKeyButton = document.getElementById("loadZipKeyButton");
const logoutButton = document.getElementById("logoutButton");
const avatarMenuButton = document.getElementById("avatarMenuButton");
const avatarMenu = document.getElementById("avatarMenu");
const statusBanner = document.getElementById("statusBanner");
const avatarContainer = document.getElementById("avatarContainer");
const avatarImage = document.getElementById("avatarImage");
const avatarFallback = document.getElementById("avatarFallback");
const displayNameLink = document.getElementById("displayNameLink");
const displayEmail = document.getElementById("displayEmail");
const selectedOrganizationName = document.getElementById("selectedOrganizationName");
const selectedOrganizationMeta = document.getElementById("selectedOrganizationMeta");
const debugConsole = document.getElementById("debugConsole");
const debugConsoleBody = document.getElementById("debugConsoleBody");
const debugToggleButton = document.getElementById("debugToggleButton");
const debugToggleButtonLabel = document.getElementById("debugToggleButtonLabel");
const debugToggleButtonMeta = document.getElementById("debugToggleButtonMeta");
const debugToggleStatus = document.getElementById("debugToggleStatus");
const logOutput = document.getElementById("logOutput");

const DEFAULT_AUTH_CONFIGURATION = getDefaultImsOpenIdConfiguration();
const DEFAULT_RUNTIME_CONFIG = getDefaultImsRuntimeConfig();
const SILENT_AUTH_RETRY_INTERVAL_MS = 15 * 1000;
const INTERACTIVE_AUTH_TIMEOUT_MS = 3 * 60 * 1000;
const INTERACTIVE_AUTH_POPUP_WIDTH = 560;
const INTERACTIVE_AUTH_POPUP_HEIGHT = 760;
const COPY_DEBUG_RESET_DELAY_MS = 1600;

const state = {
  session: null,
  authConfiguration: DEFAULT_AUTH_CONFIGURATION,
  runtimeConfig: DEFAULT_RUNTIME_CONFIG,
  runtime: {
    extensionId: chrome.runtime?.id || "",
    appUrl: chrome.runtime.getURL("app.html"),
    redirectUri: getExtensionRedirectUri(),
    hasManifestKey: Boolean(chrome.runtime.getManifest().key)
  },
  theme: DEFAULT_THEME,
  interactivePopupSnapshot: {
    url: "",
    title: "",
    observedAt: ""
  },
  lastAuthAttempt: null,
  lastAuthOutcome: null,
  avatarAsset: {
    key: "",
    sourceUrl: "",
    displayUrl: "",
    objectUrl: "",
    mode: "fallback",
    loading: false,
    requestId: ""
  },
  ready: false,
  busy: false,
  silentAuthInFlight: false,
  interactiveAuthInFlight: false,
  avatarMenuOpen: false,
  themePickerOpen: false,
  debugConsoleCollapsed: true,
  debugCopyStatus: "",
  updateAvailable: false,
  updateCheckPending: false,
  getLatestPending: false,
  latestVersion: "",
  latestCommitSha: "",
  updateCheckError: "",
  updateCheckedAt: 0,
  lastSilentAuthAttemptAt: 0,
  dragActive: false,
  configStatus: {
    message: DEFAULT_CONFIG_STATUS_MESSAGE,
    tone: ""
  },
  logs: []
};
let dragDepth = 0;
let copyDebugResetTimer = 0;

applyThemePreferenceToDocument(state.theme);
initializeThemeSwatchGrid();

loginButton.addEventListener("click", async () => {
  await login();
});

themePickerButton.addEventListener("click", async (event) => {
  if (state.avatarMenuOpen) {
    state.avatarMenuOpen = false;
  }

  if (event.shiftKey) {
    setThemePickerOpen(false);
    await updateThemePreference({ stop: getNextThemeStop(state.theme?.stop) });
    return;
  }

  setThemePickerOpen(!state.themePickerOpen);
});

loadZipKeyButton.addEventListener("click", () => {
  setAvatarMenuOpen(false);
  zipKeyFileInput.click();
});

zipKeyDropSurface.addEventListener("click", () => {
  zipKeyFileInput.click();
});

zipKeyFileInput.addEventListener("change", async (event) => {
  await importZipKeyFiles(event.currentTarget?.files);
});

getLatestButton.addEventListener("click", async () => {
  await triggerGetLatestWorkflow();
});

logoutButton.addEventListener("click", async () => {
  setAvatarMenuOpen(false);
  await logout();
});

avatarMenuButton.addEventListener("click", () => {
  if (avatarMenuButton.disabled) {
    return;
  }

  if (state.themePickerOpen) {
    state.themePickerOpen = false;
  }
  const nextOpen = !state.avatarMenuOpen;
  setAvatarMenuOpen(nextOpen);
  if (nextOpen) {
    void loadLatestUpdateState(false);
  }
});

debugToggleButton.addEventListener("click", async (event) => {
  if (event.shiftKey) {
    setDebugConsoleCollapsed(!state.debugConsoleCollapsed);
    return;
  }

  await copyDebugConsoleToClipboard();
});

avatarImage.addEventListener("error", () => {
  if (state.avatarAsset.displayUrl && avatarImage.src === state.avatarAsset.displayUrl) {
    log(`Resolved Adobe avatar could not be displayed: ${state.avatarAsset.sourceUrl || "unknown source"}`);
  }
  avatarImage.hidden = true;
  avatarImage.removeAttribute("src");
  avatarFallback.hidden = false;
  avatarFallback.textContent = deriveInitials(displayNameLink.textContent, displayEmail.textContent);
});

document.addEventListener("dragenter", handleDocumentDragEnter);
document.addEventListener("dragover", handleDocumentDragOver);
document.addEventListener("dragleave", handleDocumentDragLeave);
document.addEventListener("drop", handleDocumentDrop);
document.addEventListener("click", handleDocumentClick);
document.addEventListener("keydown", handleDocumentKeydown);
window.addEventListener("focus", () => {
  void maybeResumeExistingAdobeSession("window-focus");
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void maybeResumeExistingAdobeSession("panel-visible");
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[SESSION_KEY]) {
    state.session = changes[SESSION_KEY].newValue || null;
  }

  if (changes[IMS_RUNTIME_CONFIG_KEY]) {
    state.runtimeConfig = normalizeImsRuntimeConfig(changes[IMS_RUNTIME_CONFIG_KEY].newValue || DEFAULT_RUNTIME_CONFIG);
  }

  if (changes[THEME_STORAGE_KEY]) {
    state.theme = normalizeThemePreference(changes[THEME_STORAGE_KEY].newValue || DEFAULT_THEME);
    applyThemePreferenceToDocument(state.theme);
  }

  state.ready = true;
  render();
});

void initialize();

async function initialize() {
  setBusy(true);
  render();

  try {
    const stored = await chrome.storage.local.get([SESSION_KEY, THEME_STORAGE_KEY]);
    state.session = stored[SESSION_KEY] || null;
    state.theme = normalizeThemePreference(stored[THEME_STORAGE_KEY] || DEFAULT_THEME);
    applyThemePreferenceToDocument(state.theme);
    await loadRuntimeConfig();
    await loadAuthConfiguration({ silent: true });

    if (!state.runtime.hasManifestKey) {
      log("Manifest has no stable key. The chromiumapp redirect URL may differ across machines until a manifest key is set.");
    } else {
      log(`Manifest key is present. Login Button now uses the stable Chrome extension ID ${state.runtime.extensionId}.`);
    }

    if (state.runtime.redirectUri) {
      log(`Current Chrome identity redirect URI: ${state.runtime.redirectUri}`);
    }

    if (state.runtimeConfig.clientId) {
      setConfigStatus(`ZIP.KEY loaded for Adobe IMS client ${state.runtimeConfig.clientId}.`, { ok: true });
      log(`ZIP.KEY client ${state.runtimeConfig.clientId} loaded from extension storage.`);
      if (Array.isArray(state.runtimeConfig.droppedScopes) && state.runtimeConfig.droppedScopes.length > 0) {
        log(
          `ZIP.KEY scope was clamped to the supported Adobe Console scope set. Dropped scopes: ${state.runtimeConfig.droppedScopes.join(", ")}`
        );
      }
      await maybeResumeExistingAdobeSession("startup");
    } else {
      setConfigStatus(DEFAULT_CONFIG_STATUS_MESSAGE);
      log("No ZIP.KEY is loaded yet. Drop ZIP.KEY before sign-in.");
    }

    log("Adobe IMS auth surface loaded.");
  } catch (error) {
    log(`Failed to initialize Adobe IMS auth: ${serializeError(error)}`);
  } finally {
    state.ready = true;
    setBusy(false);
    render();
    void loadLatestUpdateState(false);
  }
}

async function login() {
  if (state.busy) {
    return;
  }

  setBusy(true);
  render();
  log("Starting Adobe IMS sign-in with Chrome identity and PKCE.");

  try {
    if (!chrome.identity?.launchWebAuthFlow) {
      throw new Error("Chrome identity API is unavailable. Add the identity permission and reload the extension.");
    }

    const runtimeConfig = await loadRuntimeConfig();
    const clientId = requireConfiguredClientId(runtimeConfig);
    const configuredScope = normalizeScopeList(firstNonEmptyString([runtimeConfig.scope, IMS_SCOPE]), IMS_SCOPE);
    const authConfiguration = await loadAuthConfiguration();
    const redirectUri = state.runtime.redirectUri || getExtensionRedirectUri();
    if (!redirectUri) {
      throw new Error("Unable to generate the extension redirect URI.");
    }

    const silentlyResumed = await attemptSessionHydration({
      authConfiguration,
      clientId,
      redirectUri,
      requestedScope: configuredScope,
      reason: "login-click",
      interactive: false,
      prompt: "none",
      silent: true
    });
    if (silentlyResumed) {
      state.session = silentlyResumed;
      await chrome.storage.local.set({ [SESSION_KEY]: silentlyResumed });
      log("Experience Cloud session was already active. Login Button refreshed the Adobe profile without opening a full sign-in flow.");
      return;
    }

    let nextSession;
    try {
      nextSession = await attemptSessionHydration({
        authConfiguration,
        clientId,
        redirectUri,
        requestedScope: configuredScope,
        reason: "interactive-login",
        interactive: true
      });
    } catch (error) {
      if (!shouldRetryWithIdentityScope(error, configuredScope)) {
        throw error;
      }

      const fallbackScope = IMS_IDENTITY_SCOPE;
      log(
        `Adobe rejected the configured scope "${configuredScope}". Retrying with identity-only scope "${fallbackScope}".`
      );
      nextSession = await attemptSessionHydration({
        authConfiguration,
        clientId,
        redirectUri,
        requestedScope: fallbackScope,
        reason: "interactive-login-fallback",
        interactive: true
      });
      setConfigStatus(
        "Configured ZIP.KEY scope was rejected by Adobe. Signed in using the documented identity scope fallback.",
        { ok: true }
      );
    }

    await chrome.storage.local.set({ [SESSION_KEY]: nextSession });
    state.session = nextSession;
    log("Adobe IMS session captured and stored locally.");
  } catch (error) {
    const message = describeLoginError(error);
    log(`Adobe IMS login failed: ${summarizeErrorHeadline(error)}`);
    window.alert(message);
  } finally {
    setBusy(false);
    render();
  }
}

async function logout() {
  if (state.busy) {
    return;
  }

  setThemePickerOpen(false);
  setBusy(true);
  render();
  log("Revoking Adobe IMS tokens and clearing the local session.");

  try {
    const clientId = firstNonEmptyString([
      state.session?.flow?.clientId,
      state.runtimeConfig?.clientId,
      IMS_CLIENT_ID
    ]);
    const revocationEndpoint = firstNonEmptyString([
      state.session?.flow?.revocationEndpoint,
      state.authConfiguration?.revocation_endpoint,
      DEFAULT_AUTH_CONFIGURATION.revocation_endpoint
    ]);

    const revocationResults = await Promise.allSettled(
      [state.session?.accessToken, state.session?.refreshToken]
        .filter(Boolean)
        .map((token) =>
          revokeImsToken({
            revocationEndpoint,
            clientId,
            token
          })
        )
    );

    for (const result of revocationResults) {
      if (result.status === "rejected") {
        log(`Adobe token revocation failed: ${serializeError(result.reason)}`);
      }
    }
  } catch (error) {
    log(`Adobe token revocation setup failed: ${serializeError(error)}`);
  }

  try {
    await chrome.storage.local.remove(SESSION_KEY);
    state.session = null;
    log("Local Adobe IMS session cleared.");
  } catch (error) {
    log(`Unable to clear the stored session: ${serializeError(error)}`);
  } finally {
    setBusy(false);
    render();
  }
}

async function loadAuthConfiguration({ silent = false } = {}) {
  try {
    state.authConfiguration = await fetchImsOpenIdConfiguration();
  } catch (error) {
    state.authConfiguration = DEFAULT_AUTH_CONFIGURATION;
    if (!silent) {
      log(`Adobe IMS discovery unavailable, using documented defaults: ${serializeError(error)}`);
    }
  }

  return state.authConfiguration;
}

async function loadRuntimeConfig() {
  state.runtimeConfig = await loadImsRuntimeConfig();
  return state.runtimeConfig;
}

async function maybeResumeExistingAdobeSession(reason = "auto") {
  if (state.silentAuthInFlight || state.interactiveAuthInFlight || !state.runtimeConfig?.clientId) {
    return null;
  }

  const currentSession = state.session;
  const hasUsableSession =
    Boolean(currentSession?.accessToken) && !isExpired(currentSession?.expiresAtMs || currentSession?.expiresAt);
  if (hasUsableSession) {
    return currentSession;
  }

  const now = Date.now();
  if (now - Number(state.lastSilentAuthAttemptAt || 0) < SILENT_AUTH_RETRY_INTERVAL_MS) {
    return null;
  }

  state.lastSilentAuthAttemptAt = now;
  state.silentAuthInFlight = true;
  render();

  try {
    const authConfiguration = state.authConfiguration?.authorization_endpoint
      ? state.authConfiguration
      : await loadAuthConfiguration({ silent: true });
    const redirectUri = state.runtime.redirectUri || getExtensionRedirectUri();
    if (!redirectUri) {
      return null;
    }

    const silentlyResumed = await attemptSessionHydration({
      authConfiguration,
      clientId: requireConfiguredClientId(state.runtimeConfig),
      redirectUri,
      requestedScope: normalizeScopeList(firstNonEmptyString([state.runtimeConfig.scope, IMS_SCOPE]), IMS_SCOPE),
      reason,
      interactive: false,
      prompt: "none",
      silent: true
    });

    if (silentlyResumed) {
      await chrome.storage.local.set({ [SESSION_KEY]: silentlyResumed });
      state.session = silentlyResumed;
      setConfigStatus("Adobe Experience Cloud session detected. Login Button auto-refreshed the logged-in profile.", {
        ok: true
      });
      log(`Auto-resumed Adobe Experience Cloud session (${reason}).`);
      return silentlyResumed;
    }

    return null;
  } catch (error) {
    log(`Silent Adobe session probe failed: ${summarizeErrorHeadline(error)}`);
    return null;
  } finally {
    state.silentAuthInFlight = false;
    render();
  }
}

async function attemptSessionHydration({
  authConfiguration,
  clientId,
  redirectUri,
  requestedScope,
  reason = "",
  interactive = true,
  prompt = "",
  silent = false
}) {
  const authContext = {
    clientId,
    requestedScope,
    redirectUri,
    authorizationEndpoint: firstNonEmptyString([
      authConfiguration?.authorization_endpoint,
      DEFAULT_AUTH_CONFIGURATION.authorization_endpoint
    ]),
    tokenEndpoint: firstNonEmptyString([authConfiguration?.token_endpoint, DEFAULT_AUTH_CONFIGURATION.token_endpoint]),
    extensionId: state.runtime.extensionId,
    hasManifestKey: state.runtime.hasManifestKey,
    transport: "chrome.identity.launchWebAuthFlow",
    interactive,
    prompt,
    reason
  };
  const requestState = randomToken();
  const codeVerifier = buildPkceCodeVerifier();
  const codeChallenge = await buildPkceCodeChallenge(codeVerifier);
  recordAuthAttempt(authContext);
  log(
    `Adobe auth request: mode=${interactive ? "interactive" : "silent"} reason=${reason || "n/a"} client_id=${authContext.clientId} scope="${authContext.requestedScope}" authorize=${authContext.authorizationEndpoint} redirect=${authContext.redirectUri}${prompt ? ` prompt=${prompt}` : ""}`
  );
  const authorizeUrl = buildAuthorizationCodeUrl({
    authorizationEndpoint: authContext.authorizationEndpoint,
    clientId,
    redirectUri,
    scope: requestedScope,
    state: requestState,
    codeChallenge,
    prompt
  });

  const launchStartedAt = Date.now();
  let callbackUrl = "";
  try {
    if (interactive) {
      state.interactiveAuthInFlight = true;
      render();
    }

    const launchDetails = {
      url: authorizeUrl,
      interactive
    };
    if (!interactive) {
      launchDetails.abortOnLoadForNonInteractive = false;
      launchDetails.timeoutMsForNonInteractive = 10000;
    }
    callbackUrl = await chrome.identity.launchWebAuthFlow(launchDetails);
  } catch (error) {
    if (silent && isExpectedSilentAuthMiss(error)) {
      recordAuthOutcome({
        status: "no-session",
        phase: "launch",
        elapsedMs: Date.now() - launchStartedAt,
        error
      });
      log(`No reusable Adobe Experience Cloud session was found (${reason}).`);
      return null;
    }
    recordAuthOutcome({
      status: "failed",
      phase: "launch",
      elapsedMs: Date.now() - launchStartedAt,
      error
    });
    throw buildDetailedAuthError(error, authContext, Date.now() - launchStartedAt, "launch");
  } finally {
    if (interactive) {
      state.interactiveAuthInFlight = false;
      render();
    }
  }

  let authResponse;
  try {
    authResponse = parseAuthorizationCodeResponse(callbackUrl, requestState);
  } catch (error) {
    if (silent && isExpectedSilentAuthMiss(error)) {
      recordAuthOutcome({
        status: "no-session",
        phase: "callback",
        elapsedMs: Date.now() - launchStartedAt,
        error
      });
      log(`Silent Adobe auth returned no reusable session (${reason}).`);
      return null;
    }
    recordAuthOutcome({
      status: "failed",
      phase: "callback",
      elapsedMs: Date.now() - launchStartedAt,
      error
    });
    throw buildDetailedAuthError(error, authContext, Date.now() - launchStartedAt, "callback");
  }

  let tokenPayload;
  try {
    tokenPayload = await exchangeAuthorizationCode({
      tokenEndpoint: authContext.tokenEndpoint,
      clientId,
      code: authResponse.code,
      codeVerifier
    });
  } catch (error) {
    recordAuthOutcome({
      status: "failed",
      phase: "token",
      elapsedMs: Date.now() - launchStartedAt,
      error
    });
    throw buildDetailedAuthError(error, authContext, Date.now() - launchStartedAt, "token");
  }

  const shouldLoadOrganizations = scopeIncludes(requestedScope, "read_organizations");
  const [profileResult, imsProfileResult, organizationsResult] = await Promise.all([
    settle(() =>
      fetchImsUserInfo({
        userInfoEndpoint: authConfiguration.userinfo_endpoint,
        accessToken: tokenPayload.access_token,
        clientId
      })
    ),
    settle(() =>
      fetchImsProfile({
        accessToken: tokenPayload.access_token,
        clientId
      })
    ),
    shouldLoadOrganizations
      ? settle(() =>
          fetchImsOrganizations({
            organizationsEndpoint: IMS_ORGS_URL,
            accessToken: tokenPayload.access_token
          })
        )
      : Promise.resolve({ ok: true, value: null })
  ]);

  if (!profileResult.ok) {
    log(`Adobe user info fetch failed: ${serializeError(profileResult.error)}`);
  }
  if (!imsProfileResult.ok) {
    log(`Adobe IMS profile enrichment fetch failed: ${serializeError(imsProfileResult.error)}`);
  }
  if (!organizationsResult.ok) {
    log(`Adobe organizations fetch failed: ${serializeError(organizationsResult.error)}`);
  }

  const resolvedProfile = mergeProfilePayloads([
    profileResult.ok ? profileResult.value : null,
    imsProfileResult.ok ? imsProfileResult.value : null
  ]);
  if (resolvedProfile && pickAvatarUrl(resolvedProfile)) {
    log("Resolved Adobe avatar from merged IMS profile payloads.");
  }

  const sessionRecord = buildSessionRecord({
    authConfiguration,
    clientId,
    redirectUri,
    requestState,
    requestedScope,
    authTransport: authContext.transport,
    tokenPayload,
    profile: resolvedProfile,
    organizations: organizationsResult.ok ? organizationsResult.value : null
  });

  recordAuthOutcome({
    status: "success",
    phase: "token",
    elapsedMs: Date.now() - launchStartedAt
  });

  return sessionRecord;
}

function requireConfiguredClientId(runtimeConfig) {
  const clientId = firstNonEmptyString([runtimeConfig?.clientId, IMS_CLIENT_ID]);
  if (clientId) {
    return clientId;
  }

  throw new Error("Adobe IMS client ID is not configured. Drop ZIP.KEY first, then run sign-in.");
}

function buildSessionRecord({
  authConfiguration,
  clientId,
  redirectUri,
  requestState,
  requestedScope,
  authTransport = "chrome.identity.launchWebAuthFlow",
  tokenPayload,
  profile,
  organizations
}) {
  const accessToken = String(tokenPayload?.access_token || "").trim();
  const idToken = String(tokenPayload?.id_token || "").trim();
  const refreshToken = String(tokenPayload?.refresh_token || "").trim();
  const accessTokenClaims = decodeJwtPayload(accessToken);
  const idTokenClaims = decodeJwtPayload(idToken);
  const expiresAtMs = resolveSessionExpiry(tokenPayload?.expires_in, accessTokenClaims, idTokenClaims);
  const expiresAt = expiresAtMs > 0 ? new Date(expiresAtMs).toISOString() : "";
  const tokenType = String(tokenPayload?.token_type || "bearer").trim() || "bearer";
  const returnedScope = String(tokenPayload?.scope || requestedScope || IMS_SCOPE).trim() || IMS_SCOPE;
  const avatarUrl = normalizeAvatarCandidate(
    firstNonEmptyString([
      pickAvatarUrl(profile || {}, idTokenClaims || {}),
      idTokenClaims?.picture,
      idTokenClaims?.avatar
    ])
  );

  return {
    flow: {
      label: FLOW_LABEL,
      strategy: `${authTransport} + authorization_code + PKCE`,
      clientId: firstNonEmptyString([clientId, IMS_CLIENT_ID]),
      scope: firstNonEmptyString([requestedScope, IMS_SCOPE]),
      issuer: firstNonEmptyString([authConfiguration?.issuer, DEFAULT_AUTH_CONFIGURATION.issuer]),
      authorizationEndpoint: firstNonEmptyString([
        authConfiguration?.authorization_endpoint,
        DEFAULT_AUTH_CONFIGURATION.authorization_endpoint
      ]),
      tokenEndpoint: firstNonEmptyString([authConfiguration?.token_endpoint, DEFAULT_AUTH_CONFIGURATION.token_endpoint]),
      userInfoEndpoint: firstNonEmptyString([
        authConfiguration?.userinfo_endpoint,
        DEFAULT_AUTH_CONFIGURATION.userinfo_endpoint
      ]),
      revocationEndpoint: firstNonEmptyString([
        authConfiguration?.revocation_endpoint,
        DEFAULT_AUTH_CONFIGURATION.revocation_endpoint
      ]),
      organizationsEndpoint: IMS_ORGS_URL,
      redirectUri,
      appUrl: chrome.runtime.getURL("app.html")
    },
    accessToken,
    accessTokenClaims,
    idToken,
    idTokenClaims,
    refreshToken,
    tokenType,
    scope: returnedScope,
    expiresAtMs,
    expiresAt,
    obtainedAt: new Date().toISOString(),
    requestState: String(requestState || "").trim(),
    imsSession: buildImsSession(
      accessTokenClaims,
      idTokenClaims,
      expiresAtMs,
      returnedScope,
      tokenType,
      firstNonEmptyString([clientId, IMS_CLIENT_ID])
    ),
    profile,
    organizations,
    avatarUrl
  };
}

function buildImsSession(accessClaims, idClaims, expiresAtMs, scope, tokenType, clientId) {
  const session = {
    sessionId: firstNonEmptyString([idClaims?.sid, accessClaims?.sid]),
    authId: firstNonEmptyString([accessClaims?.aa_id, accessClaims?.authId, idClaims?.aa_id, idClaims?.authId]),
    userId: firstNonEmptyString([accessClaims?.user_id, accessClaims?.sub, idClaims?.sub]),
    clientId: firstNonEmptyString([accessClaims?.client_id, clientId, IMS_CLIENT_ID]),
    tokenType,
    scope,
    issuedAt: coerceClaimTime(firstNonEmptyString([accessClaims?.iat, idClaims?.iat])),
    expiresAt: expiresAtMs
  };

  const filtered = Object.fromEntries(
    Object.entries(session).filter(([, value]) => value !== "" && value !== 0 && value !== null && value !== undefined)
  );
  return Object.keys(filtered).length > 0 ? filtered : null;
}

function render() {
  const session = state.session;
  const ready = state.ready === true;
  const activeTheme = normalizeThemePreference(state.theme);
  const activeAccent = getThemeAccentMeta(activeTheme.accent);
  const hasRuntimeConfig = Boolean(firstNonEmptyString([state.runtimeConfig?.clientId]));
  const hasSession = Boolean(session?.accessToken);
  const profile = session?.profile && typeof session.profile === "object" ? session.profile : null;
  const accessClaims = session?.accessTokenClaims || null;
  const idClaims = session?.idTokenClaims || null;
  const organizations = flattenOrganizations(session?.organizations);
  const expired = isExpired(session?.expiresAtMs || session?.expiresAt);
  const name =
    firstNonEmptyString([
      profile?.name,
      profile?.displayName,
      profile?.given_name && profile?.family_name ? `${profile.given_name} ${profile.family_name}` : "",
      idClaims?.name
    ]) || "Not signed in";
  const email =
    firstNonEmptyString([
      profile?.email,
      profile?.user_email,
      profile?.emailAddress,
      profile?.additional_info?.email,
      idClaims?.email
    ]) || "Run the Adobe sign-in flow to inspect the returned account.";
  const avatarUrl = normalizeAvatarCandidate(
    firstNonEmptyString([
      session?.avatarUrl,
      pickAvatarUrl(profile, idClaims || {}),
      idClaims?.picture,
      idClaims?.avatar
    ])
  );
  const activeOrganization = resolveActiveOrganization({
    profile,
    accessClaims,
    idClaims,
    organizations
  });
  const nextThemeStop = getNextThemeStop(activeTheme.stop);
  const isThemeProcessing = isThemeActivityActive();
  const initials = deriveInitials(name, email);
  const flow = session?.flow && typeof session.flow === "object" ? session.flow : {};
  const isAvatarMenuVisible = hasSession && state.avatarMenuOpen;

  buildBadge.textContent = BUILD_VERSION;
  themePickerButton.setAttribute(
    "aria-label",
    `Theme picker. Active theme ${activeTheme.stop} x ${activeAccent.label}. Click for colors. Shift-click switches to ${nextThemeStop}.`
  );
  themePickerButton.title = `Click for colors. Shift+click switches to ${nextThemeStop}.`;
  themePickerButton.setAttribute("aria-expanded", state.themePickerOpen ? "true" : "false");
  themePickerButton.setAttribute("aria-busy", isThemeProcessing ? "true" : "false");
  themePickerButton.classList.toggle("is-open", state.themePickerOpen);
  themePickerButton.classList.toggle("is-processing", isThemeProcessing);
  themePickerButtonSwatch.style.setProperty("--login-button-theme-swatch", `var(--spectrum-${activeAccent.tokenFamily}-visual-color)`);
  themePickerPopover.hidden = !state.themePickerOpen;
  syncThemeSwatchSelection(activeTheme);
  setupView.hidden = !ready || hasRuntimeConfig;
  loggedOutView.hidden = !ready || !hasRuntimeConfig || hasSession;
  authenticatedView.hidden = !ready || !hasRuntimeConfig || !hasSession;
  zipKeyDropSurface.classList.toggle("is-drag-active", state.dragActive);
  zipKeyDropOverlay.hidden = !state.dragActive;

  statusBanner.textContent = getStatusLabel(hasSession, expired, flow);
  zipKeyStatus.textContent = state.configStatus.message || DEFAULT_CONFIG_STATUS_MESSAGE;
  zipKeyStatus.classList.toggle("is-error", state.configStatus.tone === "error");
  zipKeyStatus.classList.toggle("is-ok", state.configStatus.tone === "ok");

  loginButton.disabled = state.busy || !hasRuntimeConfig;
  loginButtonLabel.textContent = state.busy
    ? state.silentAuthInFlight
      ? "REFRESHING…"
      : "SIGNING IN…"
    : "SIGN IN";
  avatarMenuButton.disabled = !hasSession;
  avatarMenuButton.setAttribute("aria-expanded", isAvatarMenuVisible ? "true" : "false");
  avatarMenu.hidden = !isAvatarMenuVisible;
  getLatestButton.disabled = state.updateCheckPending || state.getLatestPending;
  getLatestButtonLabel.textContent = state.getLatestPending
    ? "GETTING…"
    : state.updateCheckPending
      ? "CHECKING…"
      : "GET LATEST";
  const getLatestActionTitle = buildGetLatestActionTitle();
  getLatestButton.title = getLatestActionTitle;
  getLatestButton.setAttribute("aria-label", getLatestActionTitle);
  loadZipKeyButton.disabled = state.busy;
  logoutButton.disabled = state.busy || !hasSession;
  debugConsole.classList.toggle("is-collapsed", state.debugConsoleCollapsed);
  debugConsoleBody.hidden = state.debugConsoleCollapsed;
  debugToggleButton.setAttribute("aria-expanded", state.debugConsoleCollapsed ? "false" : "true");
  debugToggleButton.setAttribute(
    "aria-label",
    state.debugConsoleCollapsed
      ? "DEBUG INFO. Click to copy debug info. Shift-click to expand."
      : "DEBUG INFO. Click to copy debug info. Shift-click to collapse."
  );
  debugToggleButton.title = state.debugConsoleCollapsed
    ? "Click to copy debug info. Shift+click to expand."
    : "Click to copy debug info. Shift+click to collapse.";
  debugToggleButtonLabel.textContent = DEFAULT_DEBUG_TOGGLE_LABEL;
  debugToggleButtonMeta.textContent = DEFAULT_DEBUG_TOGGLE_META;
  debugToggleStatus.hidden = !state.debugCopyStatus;
  debugToggleStatus.textContent = state.debugCopyStatus || DEFAULT_DEBUG_COPY_STATUS;

  displayNameLink.textContent = name;
  displayNameLink.href = buildExperienceOrgUrl(activeOrganization);
  displayNameLink.title = buildExperienceOrgTitle(activeOrganization);
  displayEmail.textContent = email;
  selectedOrganizationName.textContent = activeOrganization.name;
  selectedOrganizationMeta.textContent = activeOrganization.meta;

  syncResolvedAvatar({ session, profile, idClaims });
  const displayAvatarUrl = firstNonEmptyString([
    state.avatarAsset.displayUrl,
    state.avatarAsset.loading ? "" : avatarUrl
  ]);

  if (displayAvatarUrl) {
    avatarImage.src = displayAvatarUrl;
    avatarImage.alt = `Avatar for ${name}`;
    avatarImage.hidden = false;
    avatarFallback.hidden = true;
    avatarContainer.setAttribute("data-has-avatar", "true");
  } else {
    avatarImage.removeAttribute("src");
    avatarImage.alt = "Adobe avatar";
    avatarImage.hidden = true;
    avatarFallback.hidden = false;
    avatarFallback.textContent = initials;
    avatarContainer.removeAttribute("data-has-avatar");
  }

  setTextOutput(logOutput, composeDebugConsoleOutput({ ready, hasSession, flow, expired }));
}

function getStatusLabel(hasSession, expired, flow) {
  if (state.busy) {
    return state.silentAuthInFlight
      ? "Checking for an existing Adobe Experience Cloud session…"
      : "Running Adobe IMS sign-in…";
  }

  if (expired) {
    return "Captured session has expired. Run the Adobe sign-in flow again.";
  }

  if (hasSession) {
    return `Adobe IMS session captured via ${firstNonEmptyString([flow?.strategy, "PKCE"]).replace(/\s+/g, " ")}.`;
  }

  return "No Adobe IMS session captured yet.";
}

function buildGetLatestActionTitle() {
  const currentVersion = String(BUILD_VERSION || "").trim();
  const latestVersion = String(state.latestVersion || "").trim();
  if (state.getLatestPending) {
    return "Starting latest Login Button download and opening chrome://extensions.";
  }
  if (state.updateCheckPending) {
    return "Checking for the latest Login Button build.";
  }
  if (state.updateAvailable) {
    return `Open Login Button ${latestVersion ? `v${latestVersion}` : "latest"} from GitHub and chrome://extensions${currentVersion ? ` (current v${currentVersion})` : ""}`;
  }
  return `Download the latest Login Button package and open chrome://extensions${currentVersion ? ` (current v${currentVersion})` : ""}`;
}

function applyLatestUpdateState(updateInfo = null) {
  const info = updateInfo && typeof updateInfo === "object" ? updateInfo : null;
  if (!info) {
    return;
  }

  state.updateAvailable = info?.updateAvailable === true;
  state.latestVersion = String(info?.latestVersion || "").trim();
  state.latestCommitSha = String(info?.latestCommitSha || "").trim();
  state.updateCheckError = String(info?.checkError || "").trim();
  state.updateCheckedAt = Number(info?.checkedAt || 0);
  render();
}

async function sendRuntimeMessageSafe(payload) {
  if (!chrome.runtime?.sendMessage) {
    throw new Error("Chrome runtime messaging unavailable.");
  }

  return await new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        const runtimeError = chrome.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || "Chrome runtime messaging failed."));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error || "Chrome runtime messaging failed.")));
    }
  });
}

async function loadLatestUpdateState(force = false) {
  if (state.updateCheckPending || state.getLatestPending) {
    return null;
  }

  state.updateCheckPending = true;
  render();
  try {
    const response = await sendRuntimeMessageSafe({
      type: LOGINBUTTON_GET_UPDATE_STATE_REQUEST_TYPE,
      force: force === true
    });
    applyLatestUpdateState(response || null);
    return response || null;
  } catch (error) {
    state.updateCheckError = error instanceof Error ? error.message : String(error || "");
    render();
    return null;
  } finally {
    state.updateCheckPending = false;
    render();
  }
}

async function triggerGetLatestWorkflow() {
  if (state.updateCheckPending || state.getLatestPending) {
    return;
  }

  setAvatarMenuOpen(false);
  state.getLatestPending = true;
  log("Starting latest Login Button download and opening chrome://extensions.");
  render();

  try {
    const response = await sendRuntimeMessageSafe({
      type: LOGINBUTTON_GET_LATEST_REQUEST_TYPE
    });
    if (response?.ok === false) {
      throw new Error(response.error || "Unknown error");
    }

    applyLatestUpdateState(response || null);

    const downloadLabel = String(response?.downloadFileName || "").trim() || "latest Login Button package";
    if (response?.downloadStarted === true && response?.extensionsOpened === true) {
      log(`Started ${downloadLabel} download and opened chrome://extensions.`);
      return;
    }
    if (response?.downloadStarted === true) {
      log(`Started ${downloadLabel} download. Open chrome://extensions to finish the update.`);
      return;
    }
    if (response?.downloadTabOpened === true && response?.extensionsOpened === true) {
      log("Opened latest Login Button package tab and chrome://extensions.");
      return;
    }
    if (response?.downloadTabOpened === true) {
      log("Opened latest Login Button package tab. Open chrome://extensions to finish the update.");
      return;
    }
    if (response?.extensionsOpened === true) {
      log("Opened chrome://extensions. Start the latest Login Button download to finish the update.");
      return;
    }
    log("Starting latest Login Button download and opening chrome://extensions.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown error");
    log(`Get Latest failed: ${message}`);
    window.alert(`Get Latest failed: ${message}`);
  } finally {
    state.getLatestPending = false;
    render();
  }
}

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  state.logs.unshift(`[${timestamp}] ${redactSensitiveTokenValues(message)}`);
  state.logs = state.logs.slice(0, 120);
  render();
}

function setBusy(busy) {
  state.busy = busy;
}

function setAvatarMenuOpen(open) {
  const nextValue = open === true;
  if (state.avatarMenuOpen === nextValue) {
    return;
  }

  state.avatarMenuOpen = nextValue;
  render();
}

function setThemePickerOpen(open) {
  const nextValue = open === true;
  if (state.themePickerOpen === nextValue) {
    return;
  }

  state.themePickerOpen = nextValue;
  render();
}

function getNextThemeStop(currentStop) {
  return String(currentStop || "").toLowerCase() === "dark" ? "light" : "dark";
}

function isThemeActivityActive() {
  return Boolean(
    state.busy ||
      state.silentAuthInFlight ||
      state.interactiveAuthInFlight ||
      state.avatarAsset.loading
  );
}

function setDebugConsoleCollapsed(collapsed) {
  const nextValue = collapsed === true;
  if (state.debugConsoleCollapsed === nextValue) {
    return;
  }

  state.debugConsoleCollapsed = nextValue;
  render();
}

function setDebugCopyStatus(message = "") {
  const nextValue = String(message || "").trim();
  state.debugCopyStatus = nextValue;
  render();

  window.clearTimeout(copyDebugResetTimer);
  if (!nextValue) {
    return;
  }

  copyDebugResetTimer = window.setTimeout(() => {
    state.debugCopyStatus = "";
    render();
  }, COPY_DEBUG_RESET_DELAY_MS);
}

function handleDocumentClick(event) {
  const target = event.target;
  if (state.avatarMenuOpen && !avatarMenu?.contains(target) && !avatarMenuButton?.contains(target)) {
    setAvatarMenuOpen(false);
  }

  if (state.themePickerOpen && !themeControl?.contains(target)) {
    setThemePickerOpen(false);
  }
}

function handleDocumentKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (state.avatarMenuOpen) {
    setAvatarMenuOpen(false);
  }
  if (state.themePickerOpen) {
    setThemePickerOpen(false);
  }
}

function setTextOutput(element, value) {
  if (!element) {
    return;
  }

  const nextValue = String(value ?? "");
  if ("value" in element) {
    element.value = nextValue;
    element.scrollTop = 0;
    return;
  }

  element.textContent = nextValue;
}

function initializeThemeSwatchGrid() {
  if (!themeSwatchGrid) {
    return;
  }

  themeSwatchGrid.innerHTML = "";
  THEME_ACCENTS.forEach((accent) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-swatchButton";
    button.dataset.themeAccent = accent.id;
    button.setAttribute("role", "option");
    button.setAttribute("aria-label", accent.label);
    button.title = accent.label;

    const circle = document.createElement("span");
    circle.className = "theme-swatchCircle";
    circle.setAttribute("aria-hidden", "true");
    circle.style.setProperty("--theme-swatch-color", `var(--spectrum-${accent.tokenFamily}-visual-color)`);

    button.appendChild(circle);
    button.addEventListener("click", async () => {
      await updateThemePreference({ accent: accent.id });
      setThemePickerOpen(false);
    });
    themeSwatchGrid.appendChild(button);
  });
}

function syncThemeSwatchSelection(themePreference) {
  if (!themeSwatchGrid) {
    return;
  }

  const activeTheme = normalizeThemePreference(themePreference);
  const activeAccent = normalizeThemeAccent(activeTheme.accent);
  Array.from(themeSwatchGrid.querySelectorAll(".theme-swatchButton")).forEach((button) => {
    const isSelected = String(button.dataset.themeAccent || "") === activeAccent;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
}

async function updateThemePreference(nextPartial) {
  const merged = normalizeThemePreference({
    ...state.theme,
    ...(nextPartial && typeof nextPartial === "object" ? nextPartial : {})
  });
  state.theme = merged;
  applyThemePreferenceToDocument(merged);
  render();

  try {
    await chrome.storage.local.set({ [THEME_STORAGE_KEY]: merged });
  } catch (error) {
    log(`Unable to persist Login Button theme: ${serializeError(error)}`);
  }
}

function applyThemePreferenceToDocument(themePreference) {
  const theme = normalizeThemePreference(themePreference);
  const accentMeta = getThemeAccentMeta(theme.accent);
  const tokenFamily = String(accentMeta?.tokenFamily || DEFAULT_THEME.accent).trim().toLowerCase();
  const body = document.body;

  if (!body || !tokenFamily) {
    return;
  }

  body.classList.toggle("spectrum--light", theme.stop === "light");
  body.classList.toggle("spectrum--dark", theme.stop === "dark");
  body.dataset.themeStop = theme.stop;
  body.dataset.themeAccent = accentMeta.id;
  body.style.colorScheme = theme.stop;

  THEME_RAMP_STEPS.forEach((step) => {
    body.style.setProperty(`--spectrum-accent-color-${step}`, `var(--spectrum-${tokenFamily}-${step})`);
  });
  body.style.setProperty("--spectrum-accent-visual-color", `var(--spectrum-${tokenFamily}-visual-color)`);
  body.style.setProperty("--spectrum-focus-indicator-color", `var(--spectrum-${tokenFamily}-visual-color)`);
  body.style.setProperty("--login-button-theme-swatch", `var(--spectrum-${tokenFamily}-visual-color)`);
  body.style.setProperty(
    "--login-button-theme-ring",
    theme.stop === "light"
      ? "color-mix(in srgb, var(--spectrum-gray-400) 55%, white)"
      : "color-mix(in srgb, var(--spectrum-gray-700) 70%, black)"
  );
  body.style.setProperty(
    "--login-button-theme-shell",
    theme.stop === "light" ? "var(--spectrum-white)" : "var(--spectrum-gray-50)"
  );
}

function composeDebugConsoleOutput({ ready, hasSession, flow, expired }) {
  const lines = [];
  const session = state.session;
  const activeTheme = normalizeThemePreference(state.theme);
  const activeAccent = getThemeAccentMeta(activeTheme.accent);
  const hasRuntimeConfig = Boolean(firstNonEmptyString([state.runtimeConfig?.clientId]));
  const currentView = getCurrentView({ ready, hasSession, hasRuntimeConfig });
  const profile = session?.profile && typeof session.profile === "object" ? session.profile : null;
  const accessClaims = session?.accessTokenClaims || null;
  const idClaims = session?.idTokenClaims || null;
  const organizations = flattenOrganizations(session?.organizations);
  const activeOrganization = resolveActiveOrganization({
    profile,
    accessClaims,
    idClaims,
    organizations
  });
  const name =
    firstNonEmptyString([
      profile?.name,
      profile?.displayName,
      profile?.given_name && profile?.family_name ? `${profile.given_name} ${profile.family_name}` : "",
      idClaims?.name
    ]) || "n/a";
  const email =
    firstNonEmptyString([
      profile?.email,
      profile?.user_email,
      profile?.emailAddress,
      profile?.additional_info?.email,
      idClaims?.email,
      "n/a"
    ]);
  const imsSession = session?.imsSession && typeof session.imsSession === "object" ? session.imsSession : {};
  const lastAuthAttempt = state.lastAuthAttempt && typeof state.lastAuthAttempt === "object" ? state.lastAuthAttempt : null;
  const lastAuthOutcome = state.lastAuthOutcome && typeof state.lastAuthOutcome === "object" ? state.lastAuthOutcome : null;
  const currentStatus = redactSensitiveTokenValues(getStatusLabel(hasSession, expired, flow));
  const currentConfigStatus = redactSensitiveTokenValues(state.configStatus.message || DEFAULT_CONFIG_STATUS_MESSAGE);
  const zipKeyScope = firstNonEmptyString([state.runtimeConfig?.scope, IMS_SCOPE]);
  const droppedScopes =
    Array.isArray(state.runtimeConfig?.droppedScopes) && state.runtimeConfig.droppedScopes.length > 0
      ? state.runtimeConfig.droppedScopes.join(" ")
      : "none";

  lines.push("Login Button DEBUG INFO");
  lines.push(`captured_at=${new Date().toISOString()}`);
  lines.push(
    `summary=${buildDebugSummaryLine({
      currentView,
      activeTheme,
      activeAccent,
      hasRuntimeConfig,
      hasSession,
      expired,
      lastAuthOutcome
    })}`
  );
  lines.push("");

  pushDebugSection(lines, "app", [
    `build=${BUILD_VERSION}`,
    `view=${currentView}`,
    `busy=${state.busy ? "yes" : "no"}`,
    `status=${currentStatus}`,
    `config_status=${currentConfigStatus}`,
    `theme_stop=${activeTheme.stop}`,
    `theme_accent=${activeAccent.id}`,
    `theme_label=${activeTheme.stop} x ${activeAccent.label}`,
    `debug_panel=${state.debugConsoleCollapsed ? "collapsed" : "expanded"}`
  ]);

  pushDebugSection(lines, "identity", [
    `display_name=${name}`,
    `profile_email=${email}`,
    `resolved_org_name=${firstNonEmptyString([activeOrganization.name, "n/a"])}`,
    `resolved_org_id=${firstNonEmptyString([activeOrganization.id, "n/a"])}`,
    `resolved_org_source=${firstNonEmptyString([activeOrganization.source, "n/a"])}`,
    `experience_cloud_url=${buildExperienceOrgUrl(activeOrganization)}`,
    `avatar_mode=${firstNonEmptyString([state.avatarAsset?.mode, "fallback"])}`,
    `avatar_source_url=${firstNonEmptyString([state.avatarAsset?.sourceUrl, session?.avatarUrl, "n/a"])}`
  ]);

  pushDebugSection(lines, "session", [
    `session_present=${hasSession ? "yes" : "no"}`,
    `session_expired=${expired ? "yes" : "no"}`,
    `session_obtained_at=${firstNonEmptyString([session?.obtainedAt, "n/a"])}`,
    `session_expires_at=${firstNonEmptyString([session?.expiresAt, "n/a"])}`,
    `flow_strategy=${firstNonEmptyString([flow?.strategy, "n/a"])}`,
    `flow_client_id=${firstNonEmptyString([flow?.clientId, "n/a"])}`,
    `flow_scope=${firstNonEmptyString([session?.scope, flow?.scope, "n/a"])}`,
    `ims_user_id=${firstNonEmptyString([imsSession?.userId, "n/a"])}`,
    `ims_session_id=${firstNonEmptyString([imsSession?.sessionId, "n/a"])}`,
    `ims_auth_id=${firstNonEmptyString([imsSession?.authId, "n/a"])}`
  ]);

  pushDebugSection(lines, "auth", [
    `last_silent_auth_attempt_at=${state.lastSilentAuthAttemptAt ? new Date(state.lastSilentAuthAttemptAt).toISOString() : "never"}`,
    `last_auth_started_at=${firstNonEmptyString([lastAuthAttempt?.startedAt, "n/a"])}`,
    `last_auth_mode=${firstNonEmptyString([lastAuthAttempt?.mode, "n/a"])}`,
    `last_auth_reason=${firstNonEmptyString([lastAuthAttempt?.reason, "n/a"])}`,
    `last_auth_transport=${firstNonEmptyString([lastAuthAttempt?.transport, "n/a"])}`,
    `last_auth_prompt=${firstNonEmptyString([lastAuthAttempt?.prompt, "n/a"])}`,
    `last_auth_client_id=${firstNonEmptyString([lastAuthAttempt?.clientId, "n/a"])}`,
    `last_auth_scope=${firstNonEmptyString([lastAuthAttempt?.requestedScope, "n/a"])}`,
    `last_auth_authorize_endpoint=${firstNonEmptyString([lastAuthAttempt?.authorizationEndpoint, "n/a"])}`,
    `last_auth_token_endpoint=${firstNonEmptyString([lastAuthAttempt?.tokenEndpoint, "n/a"])}`,
    `last_auth_redirect_uri=${firstNonEmptyString([lastAuthAttempt?.redirectUri, "n/a"])}`,
    `last_auth_result=${firstNonEmptyString([lastAuthOutcome?.status, "n/a"])}`,
    `last_auth_phase=${firstNonEmptyString([lastAuthOutcome?.phase, "n/a"])}`,
    `last_auth_occurred_at=${firstNonEmptyString([lastAuthOutcome?.occurredAt, "n/a"])}`,
    `last_auth_popup_lifetime=${firstNonEmptyString([lastAuthOutcome?.popupLifetime, "n/a"])}`,
    `last_auth_error=${firstNonEmptyString([lastAuthOutcome?.error, "n/a"])}`,
    `last_auth_hint=${firstNonEmptyString([lastAuthOutcome?.hint, "n/a"])}`,
    `interactive_popup_last_title=${firstNonEmptyString([state.interactivePopupSnapshot?.title, "n/a"])}`,
    `interactive_popup_last_url=${firstNonEmptyString([state.interactivePopupSnapshot?.url, "n/a"])}`,
    `interactive_popup_last_seen_at=${firstNonEmptyString([state.interactivePopupSnapshot?.observedAt, "n/a"])}`
  ]);

  pushDebugSection(lines, "runtime", [
    `extension_id=${firstNonEmptyString([state.runtime.extensionId, "unavailable"])}`,
    `manifest_key_present=${state.runtime.hasManifestKey ? "yes" : "no"}`,
    `app_url=${firstNonEmptyString([state.runtime.appUrl, "unavailable"])}`,
    `redirect_uri=${firstNonEmptyString([state.runtime.redirectUri, "unavailable"])}`,
    `browser_language=${firstNonEmptyString([navigator.language, "unavailable"])}`,
    `browser_timezone=${firstNonEmptyString([Intl.DateTimeFormat().resolvedOptions().timeZone, "unavailable"])}`
  ]);

  pushDebugSection(lines, "credential", [
    `zip_key_loaded=${hasRuntimeConfig ? "yes" : "no"}`,
    `zip_key_client_id=${firstNonEmptyString([state.runtimeConfig?.clientId, "not-loaded"])}`,
    `zip_key_scope=${zipKeyScope}`,
    `zip_key_raw_scope=${firstNonEmptyString([state.runtimeConfig?.rawScope, "n/a"])}`,
    `zip_key_dropped_scopes=${droppedScopes}`,
    `zip_key_source=${firstNonEmptyString([state.runtimeConfig?.source, "defaults"])}`,
    `zip_key_imported_at=${firstNonEmptyString([state.runtimeConfig?.importedAt, "not-imported"])}`
  ]);

  pushDebugSection(lines, "updates", [
    `current_version=${BUILD_VERSION}`,
    `latest_version=${firstNonEmptyString([state.latestVersion, "n/a"])}`,
    `latest_commit_sha=${firstNonEmptyString([state.latestCommitSha, "n/a"])}`,
    `update_available=${state.updateAvailable ? "yes" : "no"}`,
    `update_check_pending=${state.updateCheckPending ? "yes" : "no"}`,
    `get_latest_pending=${state.getLatestPending ? "yes" : "no"}`,
    `update_checked_at=${state.updateCheckedAt ? new Date(state.updateCheckedAt).toISOString() : "never"}`,
    `update_check_error=${firstNonEmptyString([state.updateCheckError, "none"])}`
  ]);

  pushDebugSection(lines, "endpoints", [
    `authorize_endpoint=${firstNonEmptyString([flow?.authorizationEndpoint, state.authConfiguration?.authorization_endpoint, "n/a"])}`,
    `token_endpoint=${firstNonEmptyString([flow?.tokenEndpoint, state.authConfiguration?.token_endpoint, "n/a"])}`,
    `userinfo_endpoint=${firstNonEmptyString([flow?.userInfoEndpoint, state.authConfiguration?.userinfo_endpoint, "n/a"])}`,
    `organizations_endpoint=${firstNonEmptyString([flow?.organizationsEndpoint, IMS_ORGS_URL])}`
  ]);

  const recentActivityEntries = compactRecentActivityEntries(state.logs, 10);
  pushDebugSection(
    lines,
    "recent_activity",
    recentActivityEntries.length > 0
      ? recentActivityEntries.map((entry, index) => `event_${String(index + 1).padStart(2, "0")}=${entry}`)
      : ["event_01=Waiting for activity."]
  );

  return lines.join("\n");
}

function getCurrentView({ ready, hasSession, hasRuntimeConfig }) {
  if (!ready) {
    return "loading";
  }
  if (hasSession) {
    return "authenticated";
  }
  if (hasRuntimeConfig) {
    return "unauthenticated";
  }
  return "zip-key-gate";
}

function buildDebugSummaryLine({ currentView, activeTheme, activeAccent, hasRuntimeConfig, hasSession, expired, lastAuthOutcome }) {
  const parts = [
    currentView,
    state.busy ? "busy" : "idle",
    `theme ${activeTheme.stop} x ${activeAccent.id}`,
    hasRuntimeConfig ? "key loaded" : "key missing",
    hasSession ? (expired ? "session expired" : "session active") : "no session"
  ];

  if (lastAuthOutcome?.status === "failed") {
    parts.push("last auth failed");
  } else if (lastAuthOutcome?.status === "success") {
    parts.push("last auth succeeded");
  } else if (lastAuthOutcome?.status === "no-session") {
    parts.push("no reusable Adobe session");
  }

  return parts.join(" | ");
}

function pushDebugSection(lines, label, entries) {
  lines.push(`[${label}]`);
  lines.push(...entries);
  lines.push("");
}

function compactRecentActivityEntries(entries, limit = 10) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  return entries.slice(0, limit).map((entry) => {
    const compact = String(entry || "")
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" | ");
    return compact.length > 420 ? `${compact.slice(0, 417)}...` : compact;
  });
}

function resolveSessionExpiry(expiresInValue, accessClaims, idClaims) {
  const claimsExpiry = Math.max(
    coerceClaimTime(firstNonEmptyString([accessClaims?.exp, idClaims?.exp])),
    0
  );
  if (claimsExpiry > 0) {
    return claimsExpiry;
  }

  const expiresIn = Number(expiresInValue || 0);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return Date.now() + expiresIn * 1000;
  }

  return 0;
}

function coerceClaimTime(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return numeric < 1000000000000 ? numeric * 1000 : numeric;
}

function getExtensionRedirectUri() {
  try {
    return chrome.identity?.getRedirectURL ? chrome.identity.getRedirectURL("ims") : "";
  } catch {
    return "";
  }
}

function summarizeErrorHeadline(error) {
  const message = redactSensitiveTokenValues(serializeError(error));
  const headline = message
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  return headline || "Unknown error";
}

function buildAuthHintFromContext(errorMessage) {
  const message = String(errorMessage || "").toLowerCase();
  const popupTitle = String(state.interactivePopupSnapshot?.title || "").toLowerCase();
  const popupUrl = String(state.interactivePopupSnapshot?.url || "").toLowerCase();

  if (
    /gain access|application developer|not entitled/.test(message) ||
    /enterprise id/.test(popupTitle) ||
    /\/ims\/fromsusi/.test(popupUrl)
  ) {
    return "Adobe stopped in the Enterprise ID / org-access path before callback. Check org choice, Beta users, or Production status.";
  }
  if (/invalid_scope/.test(message)) {
    return "Adobe rejected the requested scope set. Match the ZIP.KEY scope to the Adobe Console credential.";
  }
  if (/authorization page could not be loaded/.test(message)) {
    return "Chrome never received the final callback. Check Adobe-side validation, project access, or redirect handling.";
  }
  if (/popup was closed before login button received the redirect|popup window was closed/.test(message)) {
    return "The auth popup closed before callback. If Adobe pages were still visible, the block happened on Adobe's side.";
  }
  if (/login_required|interaction_required|consent_required/.test(message)) {
    return "No reusable Adobe session was available. The user still needs a successful interactive sign-in.";
  }
  if (/access_denied/.test(message)) {
    return "Adobe denied the auth request. Check project access, org membership, or consent restrictions.";
  }
  if (/unsupported_response_type|code_challenge|pkce/.test(message)) {
    return "The Adobe credential may not be configured for authorization-code PKCE.";
  }

  return "";
}

function recordAuthAttempt(authContext) {
  state.lastAuthAttempt = {
    startedAt: new Date().toISOString(),
    mode: authContext?.interactive ? "interactive" : "silent",
    reason: firstNonEmptyString([authContext?.reason, "n/a"]),
    transport: firstNonEmptyString([authContext?.transport, "n/a"]),
    prompt: firstNonEmptyString([authContext?.prompt, authContext?.interactive ? "default" : "none"]),
    clientId: firstNonEmptyString([authContext?.clientId, "n/a"]),
    requestedScope: firstNonEmptyString([authContext?.requestedScope, "n/a"]),
    authorizationEndpoint: firstNonEmptyString([authContext?.authorizationEndpoint, "n/a"]),
    tokenEndpoint: firstNonEmptyString([authContext?.tokenEndpoint, "n/a"]),
    redirectUri: firstNonEmptyString([authContext?.redirectUri, "n/a"])
  };
  state.lastAuthOutcome = {
    status: "pending",
    phase: "launch",
    occurredAt: "",
    popupLifetime: "0.0s",
    error: "",
    hint: ""
  };
  render();
}

function recordAuthOutcome({ status, phase, elapsedMs, error, hint }) {
  const headline = error ? summarizeErrorHeadline(error) : "";
  state.lastAuthOutcome = {
    status: firstNonEmptyString([status, "unknown"]),
    phase: firstNonEmptyString([phase, "unknown"]),
    occurredAt: new Date().toISOString(),
    popupLifetime: formatPopupLifetime(elapsedMs),
    error: firstNonEmptyString([headline, "n/a"]),
    hint: firstNonEmptyString([hint, buildAuthHintFromContext(headline), "n/a"])
  };
  render();
}

function describeLoginError(error) {
  const message = redactSensitiveTokenValues(serializeError(error));
  if (/ZIP\.KEY|client ID is not configured/i.test(message)) {
    return message;
  }

  const notes = [];

  if (/popup was closed before Login Button received the redirect/i.test(message)) {
    notes.push(
      "Adobe never redirected back to the extension before the popup closed. That means the block happened on Adobe's side, not in the PKCE callback handler."
    );
    if (state.interactivePopupSnapshot?.title) {
      notes.push(`Last observed popup title: ${state.interactivePopupSnapshot.title}`);
    }
    if (state.interactivePopupSnapshot?.url) {
      notes.push(`Last observed popup URL: ${state.interactivePopupSnapshot.url}`);
    }
    if (
      /enterprise id/i.test(String(state.interactivePopupSnapshot?.title || "")) ||
      /\/ims\/fromSusi/i.test(String(state.interactivePopupSnapshot?.url || ""))
    ) {
      notes.push(
        "Adobe routed this user through the Enterprise ID / federated sign-in path and stopped there. That usually means the user is not entitled to this Adobe project in the current org, or they authenticated into the wrong Adobe org."
      );
    }
    notes.push(
      "Most common fixes are: add the user's exact email address to the project's Beta users list while the credential is In Development, move the credential to Production, or have the user choose the correct Adobe organization during sign-in if they belong to multiple orgs."
    );
  } else if (/authorization page could not be loaded/i.test(message)) {
    notes.push(
      `Login Button requested this Chrome identity redirect URI: ${state.runtime.redirectUri || "unavailable"}.`
    );
    notes.push(
      "If Adobe Console is already registered with that exact URI and pattern, this error does not prove the redirect is wrong. It means Chrome never received the final callback it was waiting for."
    );
    notes.push(
      "Common causes are an Adobe-side error page after sign-in, a credential/user access restriction, or another validation failure that prevented Adobe from redirecting back to the extension."
    );
  } else if (/redirect|invalid_request/i.test(message)) {
    notes.push(`Verify this redirect URI is allowed in Adobe Developer Console: ${state.runtime.redirectUri || "unavailable"}.`);
  }

  if (/unsupported_response_type|code_challenge|pkce/i.test(message)) {
    notes.push("The Adobe credential may still be configured for an older flow. Use an authorization-code PKCE-compatible credential.");
  }

  if (!state.runtime.hasManifestKey) {
    notes.push(
      "This unpacked extension still has no manifest key, so its extension ID and chromiumapp redirect URI are not guaranteed to stay stable across installs."
    );
  }

  notes.push(
    "If some teammates can sign in and others cannot, verify the Adobe credential is in Production or that their email addresses are listed as beta users."
  );

  return [message, ...notes].filter(Boolean).join("\n\n");
}

function shouldRetryWithIdentityScope(error, configuredScope) {
  const message = String(serializeError(error) || "");
  return /invalid_scope/i.test(message) && normalizeScopeList(configuredScope, IMS_SCOPE) !== IMS_IDENTITY_SCOPE;
}

function buildDetailedAuthError(error, authContext, elapsedMs, phase) {
  const baseMessage = redactSensitiveTokenValues(serializeError(error));
  const lines = [baseMessage, "", "Login Button auth diagnostics:"];
  lines.push(`phase=${String(phase || "unknown")}`);
  lines.push(`mode=${authContext?.interactive ? "interactive" : "silent"}`);
  lines.push(`transport=${firstNonEmptyString([authContext?.transport, "unknown"])}`);
  lines.push(`reason=${firstNonEmptyString([authContext?.reason, "n/a"])}`);
  lines.push(`popup_lifetime=${formatPopupLifetime(elapsedMs)}`);
  lines.push(`client_id=${firstNonEmptyString([authContext?.clientId, "unavailable"])}`);
  lines.push(`scope=${firstNonEmptyString([authContext?.requestedScope, "unavailable"])}`);
  lines.push(`authorize_endpoint=${firstNonEmptyString([authContext?.authorizationEndpoint, "unavailable"])}`);
  lines.push(`token_endpoint=${firstNonEmptyString([authContext?.tokenEndpoint, "unavailable"])}`);
  lines.push(`redirect_uri=${firstNonEmptyString([authContext?.redirectUri, "unavailable"])}`);
  lines.push(`expected_redirect_pattern=${buildRedirectUriPattern(authContext?.redirectUri) || "unavailable"}`);
  lines.push(`extension_id=${firstNonEmptyString([authContext?.extensionId, "unavailable"])}`);
  lines.push(`manifest_key_present=${authContext?.hasManifestKey ? "yes" : "no"}`);

  if (elapsedMs > 0 && elapsedMs < 3000) {
    lines.push(
      "diagnostic_hint=The auth window died almost immediately. That usually means Adobe or Chrome rejected the request before a usable login screen loaded."
    );
  }

  return new Error(lines.join("\n"));
}

function isExpectedSilentAuthMiss(error) {
  const message = String(serializeError(error) || "").toLowerCase();
  return [
    "authorization page could not be loaded",
    "login_required",
    "interaction_required",
    "consent_required",
    "access_denied"
  ].some((token) => message.includes(token));
}

function formatPopupLifetime(elapsedMs) {
  const normalized = Number(elapsedMs || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return "0.0s";
  }

  return `${(normalized / 1000).toFixed(1)}s`;
}

function buildRedirectUriPattern(redirectUri) {
  const normalized = String(redirectUri || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function syncResolvedAvatar({ session, profile, idClaims }) {
  const candidates = collectResolvedAvatarCandidates({ session, profile, idClaims });
  const clientId = firstNonEmptyString([session?.flow?.clientId, state.runtimeConfig?.clientId, IMS_CLIENT_ID]);
  const accessToken = firstNonEmptyString([session?.accessToken]);
  const key = hasUsableAvatarContext({ accessToken, candidates }) ? `${accessToken.slice(0, 24)}|${candidates.join("|")}` : "";

  if (!key) {
    resetAvatarAsset();
    return;
  }

  if (state.avatarAsset.key === key || state.avatarAsset.loading) {
    return;
  }

  const requestId = randomToken();
  if (state.avatarAsset.objectUrl) {
    URL.revokeObjectURL(state.avatarAsset.objectUrl);
  }
  state.avatarAsset = {
    key,
    sourceUrl: candidates[0] || "",
    displayUrl: "",
    objectUrl: "",
    mode: "loading",
    loading: true,
    requestId
  };

  void resolveAvatarAsset({
    requestId,
    accessToken,
    clientId,
    candidates
  });
}

async function resolveAvatarAsset({ requestId, accessToken, clientId, candidates }) {
  const resolved = await resolveAvatarDisplayUrl({
    accessToken,
    clientId,
    candidates
  });

  if (state.avatarAsset.requestId !== requestId) {
    if (resolved.objectUrl) {
      URL.revokeObjectURL(resolved.objectUrl);
    }
    return;
  }

  state.avatarAsset = {
    key: state.avatarAsset.key,
    sourceUrl: resolved.sourceUrl,
    displayUrl: resolved.displayUrl,
    objectUrl: resolved.objectUrl,
    mode: resolved.mode,
    loading: false,
    requestId
  };
  if (resolved.displayUrl) {
    log(`Resolved Adobe avatar using ${resolved.mode} source.`);
  }
  render();
}

async function resolveAvatarDisplayUrl({ accessToken, clientId, candidates }) {
  let directFallbackUrl = "";

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (/^(data:image\/|blob:)/i.test(candidate)) {
      return {
        sourceUrl: candidate,
        displayUrl: candidate,
        objectUrl: "",
        mode: "direct"
      };
    }

    const blobUrl = await fetchProtectedAvatarBlobUrl({
      url: candidate,
      accessToken,
      clientId
    });
    if (blobUrl) {
      return {
        sourceUrl: candidate,
        displayUrl: blobUrl,
        objectUrl: blobUrl,
        mode: "blob"
      };
    }

    if (!directFallbackUrl) {
      directFallbackUrl = candidate;
    }
  }

  if (directFallbackUrl) {
    return {
      sourceUrl: directFallbackUrl,
      displayUrl: directFallbackUrl,
      objectUrl: "",
      mode: "direct"
    };
  }

  return {
    sourceUrl: "",
    displayUrl: "",
    objectUrl: "",
    mode: "fallback"
  };
}

async function fetchProtectedAvatarBlobUrl({ url, accessToken, clientId }) {
  try {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: {
        ...buildImsProfileHeaders(accessToken, clientId),
        Accept: "image/*,*/*;q=0.8"
      }
    });
    if (!response.ok) {
      return "";
    }

    const blob = await response.blob();
    if (!blob || !String(blob.type || "").startsWith("image/")) {
      return "";
    }

    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

function collectResolvedAvatarCandidates({ session, profile, idClaims }) {
  const candidates = [
    state.avatarAsset.sourceUrl,
    session?.avatarUrl,
    pickAvatarUrl(profile, idClaims || {}),
    ...(profile ? collectProfileAvatarCandidates(profile) : []),
    idClaims?.picture,
    idClaims?.avatar,
    idClaims?.avatarUrl
  ]
    .map((value) => normalizeAvatarCandidate(value))
    .filter(Boolean);

  return [...new Set(candidates)];
}

function hasUsableAvatarContext({ accessToken, candidates }) {
  return Boolean(String(accessToken || "").trim()) && Array.isArray(candidates) && candidates.length > 0;
}

function resetAvatarAsset() {
  if (state.avatarAsset.objectUrl) {
    URL.revokeObjectURL(state.avatarAsset.objectUrl);
  }
  state.avatarAsset = {
    key: "",
    sourceUrl: "",
    displayUrl: "",
    objectUrl: "",
    mode: "fallback",
    loading: false,
    requestId: ""
  };
}

function resolveActiveOrganization({ profile, accessClaims, idClaims, organizations = [] }) {
  const candidates = [];
  const orgIdHints = [];

  const pushCandidate = (value, source) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const id = extractOrganizationId(value);
    const name = extractOrganizationName(value);
    if (!id && !name) {
      return;
    }

    const signature = JSON.stringify({ id, name, source });
    if (candidates.some((candidate) => candidate.signature === signature)) {
      return;
    }

    candidates.push({
      value,
      id,
      name,
      source,
      signature
    });
  };

  const pushOrgIdHints = (value) => {
    collectOrganizationObjects(value).forEach((entry) => {
      const id = extractOrganizationId(entry.value);
      if (id) {
        orgIdHints.push(id);
      }
      pushCandidate(entry.value, entry.source);
    });
  };

  organizations.forEach((organization, index) => pushCandidate(organization, `organizations[${index}]`));
  pushOrgIdHints(profile);
  pushOrgIdHints(profile?.additional_info);
  pushOrgIdHints(profile?.projectedProductContext);
  pushOrgIdHints(profile?.additional_info?.projectedProductContext);
  pushOrgIdHints(accessClaims);
  pushOrgIdHints(idClaims);

  const uniqueOrgIdHints = [...new Set(orgIdHints.map(normalizeOrganizationIdentifier).filter(Boolean))];
  const matchedCandidate = uniqueOrgIdHints
    .map((orgId) => candidates.find((candidate) => normalizeOrganizationIdentifier(candidate.id) === orgId))
    .find(Boolean) || candidates[0];

  const resolvedId = firstNonEmptyString([
    matchedCandidate?.id,
    uniqueOrgIdHints[0]
  ]);
  const resolvedName = firstNonEmptyString([
    matchedCandidate?.name,
    resolvedId ? `Adobe IMS Org ${resolvedId}` : ""
  ]) || "Adobe organization unavailable";
  const resolvedSource = firstNonEmptyString([matchedCandidate?.source, uniqueOrgIdHints[0] ? "token-or-profile" : "not-resolved"]);
  const metaParts = [];
  if (resolvedId) {
    metaParts.push(`Org ID ${resolvedId}`);
  }
  metaParts.push(
    resolvedSource === "not-resolved"
      ? "Login Button could not resolve the selected Adobe org from the returned payloads."
      : `Resolved from ${resolvedSource}.`
  );

  return {
    name: resolvedName,
    id: resolvedId,
    source: resolvedSource,
    meta: metaParts.join(" | ")
  };
}

function buildExperienceOrgUrl(activeOrganization) {
  const orgSlug = normalizeExperienceOrgSlug(activeOrganization);
  return orgSlug ? `https://experience.adobe.com/#/@${orgSlug}` : "https://experience.adobe.com";
}

function buildExperienceOrgTitle(activeOrganization) {
  const orgSlug = normalizeExperienceOrgSlug(activeOrganization);
  return orgSlug ? `Open Experience Cloud for ${orgSlug}` : "Open Experience Cloud";
}

function normalizeExperienceOrgSlug(activeOrganization) {
  const directId = String(activeOrganization?.id || "").trim();
  if (directId) {
    return encodeURIComponent(directId);
  }

  const normalizedName = String(activeOrganization?.name || "")
    .replace(/^Adobe\s+IMS\s+Org\s+/i, "")
    .trim();
  if (!normalizedName) {
    return "";
  }

  return encodeURIComponent(normalizedName.replace(/\s+/g, "-"));
}

function collectOrganizationObjects(value, path = "payload", results = [], seen = new WeakSet()) {
  if (!value || typeof value !== "object") {
    return results;
  }
  if (seen.has(value)) {
    return results;
  }
  seen.add(value);

  if (looksLikeOrganizationObject(value, path)) {
    results.push({ value, source: path });
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectOrganizationObjects(entry, `${path}[${index}]`, results, seen);
    });
    return results;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (entry && typeof entry === "object") {
      collectOrganizationObjects(entry, `${path}.${key}`, results, seen);
    }
  }

  return results;
}

function looksLikeOrganizationObject(value, path = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  if (/(projectedproductcontext|organization|org|tenant|company)/i.test(path)) {
    return true;
  }

  return Boolean(
    extractStrongOrganizationId(value) ||
      firstNonEmptyString([
        value.organizationName,
        value.organization_name,
        value.orgName,
        value.org_name,
        value.imsOrgName,
        value.ims_org_name,
        value.companyName,
        value.tenantName
      ])
  );
}

function extractOrganizationId(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  return firstNonEmptyString([
    extractStrongOrganizationId(value),
    looksLikeOrganizationObject(value) ? firstNonEmptyString([value.id, value.code]) : ""
  ]);
}

function extractStrongOrganizationId(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  return firstNonEmptyString([
    value.organizationId,
    value.organizationID,
    value.organization_id,
    value.orgId,
    value.orgID,
    value.org_id,
    value.imsOrgId,
    value.ims_org_id,
    value.tenantId,
    value.tenant_id,
    value.companyId,
    value.company_id
  ]);
}

function extractOrganizationName(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  return firstNonEmptyString([
    value.organizationName,
    value.organization_name,
    value.orgName,
    value.org_name,
    value.imsOrgName,
    value.ims_org_name,
    value.companyName,
    value.company_name,
    value.tenantName,
    value.tenant_name,
    looksLikeOrganizationObject(value) ? firstNonEmptyString([value.displayName, value.name, value.title]) : ""
  ]);
}

function normalizeOrganizationIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

async function launchInteractiveAuthPopup({ authorizeUrl, redirectUri, timeoutMs = INTERACTIVE_AUTH_TIMEOUT_MS }) {
  if (!chrome.windows?.create || !chrome.tabs?.query || !chrome.tabs?.onUpdated) {
    throw new Error("Chrome popup tab monitoring is unavailable. Add the tabs permission and reload the extension.");
  }

  const popupWindow = await chrome.windows.create({
    url: authorizeUrl,
    type: "popup",
    focused: true,
    width: INTERACTIVE_AUTH_POPUP_WIDTH,
    height: INTERACTIVE_AUTH_POPUP_HEIGHT
  });
  const popupWindowId = Number(popupWindow?.id || 0);
  if (!popupWindowId) {
    throw new Error("Unable to open the Adobe sign-in popup.");
  }

  const popupTabs = await chrome.tabs.query({
    windowId: popupWindowId
  });
  const popupTabId = Number(popupTabs.find((tab) => Number.isFinite(tab?.id))?.id || 0);
  if (!popupTabId) {
    await closeInteractiveAuthPopup(popupWindowId);
    throw new Error("Unable to monitor the Adobe sign-in popup tab.");
  }

  log(`Opened Adobe sign-in browser popup window ${popupWindowId}.`);

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      void fail(new Error("Adobe sign-in popup timed out before Login Button received the redirect."));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved.removeListener(handleTabRemoved);
      chrome.windows.onRemoved.removeListener(handleWindowRemoved);
    };

    const succeed = async (callbackUrl) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      await closeInteractiveAuthPopup(popupWindowId);
      resolve(callbackUrl);
    };

    const fail = async (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      await closeInteractiveAuthPopup(popupWindowId);
      reject(error);
    };

    const maybeCaptureRedirect = (candidateUrl) => {
      const normalizedCandidate = String(candidateUrl || "").trim();
      if (!normalizedCandidate || !normalizedCandidate.startsWith(redirectUri)) {
        return false;
      }

      void succeed(normalizedCandidate);
      return true;
    };

    const rememberPopupSnapshot = (tab) => {
      const nextUrl = firstNonEmptyString([tab?.pendingUrl, tab?.url]);
      const nextTitle = firstNonEmptyString([tab?.title]);
      if (!nextUrl && !nextTitle) {
        return;
      }

      state.interactivePopupSnapshot = {
        url: nextUrl,
        title: nextTitle,
        observedAt: new Date().toISOString()
      };
      render();
    };

    const handleUpdated = (tabId, changeInfo, tab) => {
      if (tabId !== popupTabId) {
        return;
      }

      rememberPopupSnapshot({
        ...tab,
        pendingUrl: firstNonEmptyString([changeInfo?.url, tab?.pendingUrl]),
        url: firstNonEmptyString([tab?.url, changeInfo?.url]),
        title: firstNonEmptyString([tab?.title, changeInfo?.title])
      });
      maybeCaptureRedirect(
        firstNonEmptyString([
          changeInfo?.url,
          tab?.pendingUrl,
          tab?.url
        ])
      );
    };

    const handleTabRemoved = (tabId) => {
      if (tabId !== popupTabId) {
        return;
      }

      void fail(new Error("Adobe sign-in popup was closed before Login Button received the redirect."));
    };

    const handleWindowRemoved = (windowId) => {
      if (windowId !== popupWindowId) {
        return;
      }

      void fail(new Error("Adobe sign-in popup window was closed before Login Button received the redirect."));
    };

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
    chrome.windows.onRemoved.addListener(handleWindowRemoved);

    void chrome.tabs
      .get(popupTabId)
      .then((tab) => {
        rememberPopupSnapshot(tab);
        maybeCaptureRedirect(firstNonEmptyString([tab?.pendingUrl, tab?.url]));
      })
      .catch(() => {});
  });
}

async function closeInteractiveAuthPopup(windowId) {
  if (!chrome.windows?.remove || !Number.isFinite(Number(windowId)) || Number(windowId) <= 0) {
    return;
  }

  try {
    await chrome.windows.remove(Number(windowId));
  } catch {
    // Ignore already-closed popup windows.
  }
}

async function copyDebugConsoleToClipboard() {
  const snapshot = String(logOutput?.value || "").trim();
  if (!snapshot) {
    return;
  }

  try {
    await navigator.clipboard.writeText(snapshot);
    setDebugCopyStatus(DEFAULT_DEBUG_COPY_STATUS);
  } catch (error) {
    log(`Unable to copy Login Button debug console: ${serializeError(error)}`);
    window.alert("Login Button could not copy the debug console to the clipboard.");
    setDebugCopyStatus("");
  } finally {
    if (!state.debugCopyStatus) {
      window.clearTimeout(copyDebugResetTimer);
    }
  }
}

async function settle(fn) {
  try {
    return {
      ok: true,
      value: await fn()
    };
  } catch (error) {
    return {
      ok: false,
      error
    };
  }
}

function setConfigStatus(message, { error = false, ok = false } = {}) {
  state.configStatus = {
    message: String(message || "").trim() || DEFAULT_CONFIG_STATUS_MESSAGE,
    tone: error ? "error" : ok ? "ok" : ""
  };
}

async function importZipKeyFiles(fileList) {
  const file = fileList?.[0];
  if (!file || state.busy) {
    return;
  }

  setBusy(true);
  render();

  try {
    const previousClientId = firstNonEmptyString([state.runtimeConfig?.clientId]);
    const rawText = await file.text();
    const importedConfig = await importImsRuntimeConfigFromText(rawText);
    state.runtimeConfig = importedConfig;
    setConfigStatus(`ZIP.KEY loaded for Adobe IMS client ${importedConfig.clientId}.`, { ok: true });
    if (Array.isArray(importedConfig.droppedScopes) && importedConfig.droppedScopes.length > 0) {
      log(
        `ZIP.KEY scope was clamped to the supported Adobe Console scope set. Dropped scopes: ${importedConfig.droppedScopes.join(", ")}`
      );
    }

    const clientChanged = previousClientId && previousClientId !== importedConfig.clientId;
    if (clientChanged && state.session?.accessToken) {
      await chrome.storage.local.remove(SESSION_KEY);
      state.session = null;
      log(`ZIP.KEY switched Adobe IMS client from ${previousClientId} to ${importedConfig.clientId}. Cleared the stored session.`);
    } else {
      log(`ZIP.KEY loaded for Adobe IMS client ${importedConfig.clientId}.`);
    }
  } catch (error) {
    const message = `Unable to import ZIP.KEY: ${serializeError(error)}`;
    setConfigStatus(message, { error: true });
    log(message);
    window.alert(message);
  } finally {
    if (zipKeyFileInput) {
      zipKeyFileInput.value = "";
    }
    setBusy(false);
    render();
  }
}

function dragEventHasFiles(event) {
  return Array.from(event?.dataTransfer?.types || []).includes("Files");
}

function handleDocumentDragEnter(event) {
  if (!dragEventHasFiles(event)) {
    return;
  }

  event.preventDefault();
  dragDepth += 1;
  if (!state.dragActive) {
    state.dragActive = true;
    render();
  }
}

function handleDocumentDragOver(event) {
  if (!dragEventHasFiles(event)) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  if (!state.dragActive) {
    state.dragActive = true;
    render();
  }
}

function handleDocumentDragLeave(event) {
  if (!dragEventHasFiles(event)) {
    return;
  }

  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0 && state.dragActive) {
    state.dragActive = false;
    render();
  }
}

async function handleDocumentDrop(event) {
  if (!dragEventHasFiles(event)) {
    return;
  }

  event.preventDefault();
  dragDepth = 0;
  state.dragActive = false;
  render();
  await importZipKeyFiles(event.dataTransfer?.files);
}
