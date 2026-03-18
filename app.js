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
  fetchImsOpenIdConfiguration,
  fetchImsOrganizations,
  fetchImsProfile,
  fetchImsUserInfo,
  firstNonEmptyString,
  flattenOrganizations,
  formatDateTime,
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

const BUILD_VERSION = chrome.runtime.getManifest().version;
const DEFAULT_CONFIG_STATUS_MESSAGE = "Drop ZIP.KEY to load the Adobe IMS client.";

const buildBadge = document.getElementById("buildBadge");
const buildVersionInput = document.getElementById("buildVersionInput");
const setupView = document.getElementById("setupView");
const zipKeyFileInput = document.getElementById("zipKeyFileInput");
const zipKeyBrowseButton = document.getElementById("zipKeyBrowseButton");
const zipKeyDropSurface = document.getElementById("zipKeyDropSurface");
const zipKeyStatus = document.getElementById("zipKeyStatus");
const zipKeyDropOverlay = document.getElementById("zipKeyDropOverlay");
const loginButtonLabel = document.getElementById("loginButtonLabel");
const flowNameInput = document.getElementById("flowNameInput");
const authStrategyInput = document.getElementById("authStrategyInput");
const clientIdInput = document.getElementById("clientIdInput");
const scopeInput = document.getElementById("scopeInput");
const authorizeEndpointInput = document.getElementById("authorizeEndpointInput");
const tokenEndpointInput = document.getElementById("tokenEndpointInput");
const userInfoEndpointInput = document.getElementById("userInfoEndpointInput");
const organizationsEndpointInput = document.getElementById("organizationsEndpointInput");
const extensionRedirectUriInput = document.getElementById("extensionRedirectUriInput");
const appUrlInput = document.getElementById("appUrlInput");
const loggedOutView = document.getElementById("loggedOutView");
const authenticatedView = document.getElementById("authenticatedView");
const loginButton = document.getElementById("loginButton");
const loadZipKeyButton = document.getElementById("loadZipKeyButton");
const logoutButton = document.getElementById("logoutButton");
const statusBanner = document.getElementById("statusBanner");
const avatarContainer = document.getElementById("avatarContainer");
const avatarImage = document.getElementById("avatarImage");
const avatarFallback = document.getElementById("avatarFallback");
const displayName = document.getElementById("displayName");
const displayEmail = document.getElementById("displayEmail");
const displayNameInput = document.getElementById("displayNameInput");
const displayEmailInput = document.getElementById("displayEmailInput");
const accountTypeInput = document.getElementById("accountTypeInput");
const subjectInput = document.getElementById("subjectInput");
const countryInput = document.getElementById("countryInput");
const organizationCountInput = document.getElementById("organizationCountInput");
const tokenTypeInput = document.getElementById("tokenTypeInput");
const expiresInput = document.getElementById("expiresInput");
const hasRefreshTokenInput = document.getElementById("hasRefreshTokenInput");
const authIdInput = document.getElementById("authIdInput");
const sessionIdInput = document.getElementById("sessionIdInput");
const obtainedAtInput = document.getElementById("obtainedAtInput");
const requestStateInput = document.getElementById("requestStateInput");
const copyDebugButton = document.getElementById("copyDebugButton");
const profileJson = document.getElementById("profileJson");
const organizationsJson = document.getElementById("organizationsJson");
const accessClaimsJson = document.getElementById("accessClaimsJson");
const idClaimsJson = document.getElementById("idClaimsJson");
const sessionJson = document.getElementById("sessionJson");
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
  interactivePopupSnapshot: {
    url: "",
    title: "",
    observedAt: ""
  },
  ready: false,
  busy: false,
  silentAuthInFlight: false,
  interactiveAuthInFlight: false,
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

loginButton.addEventListener("click", async () => {
  await login();
});

loadZipKeyButton.addEventListener("click", () => {
  zipKeyFileInput.click();
});

zipKeyDropSurface.addEventListener("click", () => {
  zipKeyFileInput.click();
});

zipKeyFileInput.addEventListener("change", async (event) => {
  await importZipKeyFiles(event.currentTarget?.files);
});

logoutButton.addEventListener("click", async () => {
  await logout();
});

copyDebugButton.addEventListener("click", async () => {
  await copyDebugConsoleToClipboard();
});

avatarImage.addEventListener("error", () => {
  avatarImage.hidden = true;
  avatarImage.removeAttribute("src");
  avatarFallback.hidden = false;
  avatarFallback.textContent = deriveInitials(displayName.textContent, displayEmail.textContent);
});

document.addEventListener("dragenter", handleDocumentDragEnter);
document.addEventListener("dragover", handleDocumentDragOver);
document.addEventListener("dragleave", handleDocumentDragLeave);
document.addEventListener("drop", handleDocumentDrop);
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

  state.ready = true;
  render();
});

void initialize();

async function initialize() {
  setBusy(true);
  render();

  try {
    const stored = await chrome.storage.local.get(SESSION_KEY);
    state.session = stored[SESSION_KEY] || null;
    await loadRuntimeConfig();
    await loadAuthConfiguration({ silent: true });

    if (!state.runtime.hasManifestKey) {
      log("Manifest has no stable key. The chromiumapp redirect URL may differ across machines until a manifest key is set.");
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
    log(`Adobe IMS login failed: ${message}`);
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
    log(`Silent Adobe session probe failed: ${serializeError(error)}`);
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
    transport: interactive ? "browser-popup-monitor" : "chrome.identity.launchWebAuthFlow",
    interactive,
    prompt,
    reason
  };
  const requestState = randomToken();
  const codeVerifier = buildPkceCodeVerifier();
  const codeChallenge = await buildPkceCodeChallenge(codeVerifier);
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
      callbackUrl = await launchInteractiveAuthPopup({
        authorizeUrl,
        redirectUri,
        timeoutMs: INTERACTIVE_AUTH_TIMEOUT_MS
      });
    } else {
      const launchDetails = {
        url: authorizeUrl,
        interactive
      };
      launchDetails.abortOnLoadForNonInteractive = false;
      launchDetails.timeoutMsForNonInteractive = 10000;
      callbackUrl = await chrome.identity.launchWebAuthFlow(launchDetails);
    }
  } catch (error) {
    if (silent && isExpectedSilentAuthMiss(error)) {
      log(`No reusable Adobe Experience Cloud session was found (${reason}).`);
      return null;
    }
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
      log(`Silent Adobe auth returned no reusable session (${reason}).`);
      return null;
    }
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

  return buildSessionRecord({
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
  const initials = deriveInitials(name, email);
  const flow = session?.flow && typeof session.flow === "object" ? session.flow : {};

  buildBadge.textContent = BUILD_VERSION;
  buildVersionInput.value = BUILD_VERSION;
  flowNameInput.value = FLOW_LABEL;
  authStrategyInput.value = firstNonEmptyString([flow.strategy, "chrome.identity + authorization_code + PKCE"]);
  clientIdInput.value = firstNonEmptyString([flow.clientId, state.runtimeConfig?.clientId, IMS_CLIENT_ID]) || "Not configured";
  scopeInput.value = firstNonEmptyString([session?.scope, flow.scope, state.runtimeConfig?.scope, IMS_SCOPE]);
  authorizeEndpointInput.value = firstNonEmptyString([
    flow.authorizationEndpoint,
    state.authConfiguration?.authorization_endpoint,
    DEFAULT_AUTH_CONFIGURATION.authorization_endpoint
  ]);
  tokenEndpointInput.value = firstNonEmptyString([
    flow.tokenEndpoint,
    state.authConfiguration?.token_endpoint,
    DEFAULT_AUTH_CONFIGURATION.token_endpoint
  ]);
  userInfoEndpointInput.value = firstNonEmptyString([
    flow.userInfoEndpoint,
    state.authConfiguration?.userinfo_endpoint,
    DEFAULT_AUTH_CONFIGURATION.userinfo_endpoint
  ]);
  organizationsEndpointInput.value = firstNonEmptyString([flow.organizationsEndpoint, IMS_ORGS_URL]);
  extensionRedirectUriInput.value = firstNonEmptyString([flow.redirectUri, state.runtime.redirectUri]);
  appUrlInput.value = firstNonEmptyString([flow.appUrl, state.runtime.appUrl]);
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
      ? "Refreshing Adobe Session…"
      : "Signing In…"
    : "Sign In With Adobe";
  loadZipKeyButton.disabled = state.busy;
  logoutButton.disabled = state.busy || !hasSession;

  displayName.textContent = name;
  displayEmail.textContent = email;
  displayNameInput.value = name;
  displayEmailInput.value = email;
  accountTypeInput.value =
    firstNonEmptyString([profile?.account_type, profile?.additional_info?.account_type]) || "Not available";
  subjectInput.value =
    firstNonEmptyString([profile?.sub, idClaims?.sub, accessClaims?.sub, accessClaims?.user_id]) || "Not available";
  countryInput.value =
    firstNonEmptyString([profile?.address?.country, profile?.country, profile?.additional_info?.country]) || "Not available";
  organizationCountInput.value = String(organizations.length || 0);
  tokenTypeInput.value = session?.tokenType || "Not available";
  expiresInput.value = session?.expiresAt
    ? `${formatDateTime(session.expiresAt)}${expired ? " (expired)" : ""}`
    : "Not available";
  hasRefreshTokenInput.value = session?.refreshToken ? "Yes" : "No";
  authIdInput.value =
    firstNonEmptyString([
      session?.imsSession?.authId,
      accessClaims?.aa_id,
      accessClaims?.authId,
      idClaims?.aa_id,
      profile?.authId,
      profile?.additional_info?.authId
    ]) || "Not available";
  sessionIdInput.value =
    firstNonEmptyString([session?.imsSession?.sessionId, idClaims?.sid, accessClaims?.sid]) || "Not available";
  obtainedAtInput.value = session?.obtainedAt ? formatDateTime(session.obtainedAt) : "Not available";
  requestStateInput.value = session?.requestState || "Not available";

  if (avatarUrl) {
    avatarImage.src = avatarUrl;
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

  setTextOutput(profileJson, safeJson(profile, "No profile loaded."));
  setTextOutput(organizationsJson, safeJson(session?.organizations, "No organizations loaded."));
  setTextOutput(accessClaimsJson, safeJson(accessClaims, "No access token claims loaded."));
  setTextOutput(idClaimsJson, safeJson(idClaims, "No ID token claims loaded."));
  setTextOutput(sessionJson, safeJson(redactSessionForDisplay(session), "No session stored."));
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

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  state.logs.unshift(`[${timestamp}] ${redactSensitiveTokenValues(message)}`);
  state.logs = state.logs.slice(0, 120);
  render();
}

function setBusy(busy) {
  state.busy = busy;
}

function redactSessionForDisplay(session) {
  if (!session || typeof session !== "object") {
    return null;
  }

  return {
    ...session,
    accessToken: session.accessToken ? "<redacted>" : "",
    idToken: session.idToken ? "<redacted>" : "",
    refreshToken: session.refreshToken ? "<redacted>" : ""
  };
}

function safeJson(value, fallbackText) {
  if (value === undefined || value === null) {
    return fallbackText;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallbackText;
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

function composeDebugConsoleOutput({ ready, hasSession, flow, expired }) {
  const lines = [];
  const currentView = !ready
    ? "loading"
    : hasSession
      ? "authenticated"
      : state.runtimeConfig?.clientId
        ? "unauthenticated"
        : "zip-key-gate";

  lines.push("Login Button Debug Console");
  lines.push(`generated_at=${new Date().toISOString()}`);
  lines.push(`build=${BUILD_VERSION}`);
  lines.push(`view=${currentView}`);
  lines.push(`busy=${state.busy ? "yes" : "no"}`);
  lines.push(`silent_auth_in_flight=${state.silentAuthInFlight ? "yes" : "no"}`);
  lines.push(`last_silent_auth_attempt_at=${state.lastSilentAuthAttemptAt ? new Date(state.lastSilentAuthAttemptAt).toISOString() : "never"}`);
  lines.push(`extension_id=${firstNonEmptyString([state.runtime.extensionId, "unavailable"])}`);
  lines.push(`manifest_key_present=${state.runtime.hasManifestKey ? "yes" : "no"}`);
  lines.push(`app_url=${firstNonEmptyString([state.runtime.appUrl, "unavailable"])}`);
  lines.push(`redirect_uri=${firstNonEmptyString([state.runtime.redirectUri, "unavailable"])}`);
  lines.push(`interactive_popup_last_url=${firstNonEmptyString([state.interactivePopupSnapshot?.url, "n/a"])}`);
  lines.push(`interactive_popup_last_title=${firstNonEmptyString([state.interactivePopupSnapshot?.title, "n/a"])}`);
  lines.push(`interactive_popup_last_seen_at=${firstNonEmptyString([state.interactivePopupSnapshot?.observedAt, "n/a"])}`);
  lines.push(`zip_key_client_id=${firstNonEmptyString([state.runtimeConfig?.clientId, "not-loaded"])}`);
  lines.push(`zip_key_scope=${firstNonEmptyString([state.runtimeConfig?.scope, IMS_SCOPE])}`);
  lines.push(`zip_key_raw_scope=${firstNonEmptyString([state.runtimeConfig?.rawScope, "n/a"])}`);
  lines.push(
    `zip_key_dropped_scopes=${Array.isArray(state.runtimeConfig?.droppedScopes) && state.runtimeConfig.droppedScopes.length > 0
      ? state.runtimeConfig.droppedScopes.join(" ")
      : "none"}`
  );
  lines.push(`zip_key_source=${firstNonEmptyString([state.runtimeConfig?.source, "defaults"])}`);
  lines.push(`zip_key_imported_at=${firstNonEmptyString([state.runtimeConfig?.importedAt, "not-imported"])}`);
  lines.push(`status=${redactSensitiveTokenValues(getStatusLabel(hasSession, expired, flow))}`);
  lines.push(`config_status=${redactSensitiveTokenValues(state.configStatus.message || DEFAULT_CONFIG_STATUS_MESSAGE)}`);
  lines.push(`session_present=${hasSession ? "yes" : "no"}`);
  lines.push(`session_expired=${expired ? "yes" : "no"}`);
  lines.push(`session_obtained_at=${firstNonEmptyString([state.session?.obtainedAt, "n/a"])}`);
  lines.push(`session_expires_at=${firstNonEmptyString([state.session?.expiresAt, "n/a"])}`);
  lines.push(`profile_email=${firstNonEmptyString([
    state.session?.profile?.email,
    state.session?.profile?.user_email,
    state.session?.idTokenClaims?.email,
    "n/a"
  ])}`);
  lines.push(`flow_strategy=${firstNonEmptyString([flow?.strategy, "n/a"])}`);
  lines.push(`flow_client_id=${firstNonEmptyString([flow?.clientId, "n/a"])}`);
  lines.push(`flow_scope=${firstNonEmptyString([state.session?.scope, flow?.scope, "n/a"])}`);
  lines.push(`authorize_endpoint=${firstNonEmptyString([flow?.authorizationEndpoint, state.authConfiguration?.authorization_endpoint, "n/a"])}`);
  lines.push(`token_endpoint=${firstNonEmptyString([flow?.tokenEndpoint, state.authConfiguration?.token_endpoint, "n/a"])}`);
  lines.push(`userinfo_endpoint=${firstNonEmptyString([flow?.userInfoEndpoint, state.authConfiguration?.userinfo_endpoint, "n/a"])}`);
  lines.push(`organizations_endpoint=${firstNonEmptyString([flow?.organizationsEndpoint, IMS_ORGS_URL])}`);
  lines.push("");
  lines.push("Recent Activity:");

  if (state.logs.length === 0) {
    lines.push("Waiting for actions…");
  } else {
    lines.push(...state.logs);
  }

  return lines.join("\n");
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
    if (copyDebugButton) {
      copyDebugButton.disabled = true;
      copyDebugButton.textContent = "COPIED";
    }
    log("Copied Login Button debug console to clipboard.");
  } catch (error) {
    log(`Unable to copy Login Button debug console: ${serializeError(error)}`);
    window.alert("Login Button could not copy the debug console to the clipboard.");
  } finally {
    window.clearTimeout(copyDebugResetTimer);
    copyDebugResetTimer = window.setTimeout(() => {
      if (!copyDebugButton) {
        return;
      }
      copyDebugButton.disabled = false;
      copyDebugButton.textContent = "COPY DEBUG";
    }, COPY_DEBUG_RESET_DELAY_MS);
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
