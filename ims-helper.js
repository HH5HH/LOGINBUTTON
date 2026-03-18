import {
  HELPER_RESULT_MESSAGE_TYPE,
  IMS_ORGS_URL,
  IMS_PROFILE_URL,
  PROFILE_CLIENT_IDS,
  buildAuthorizeUrl,
  buildHelperResultKeys,
  buildImsProfileHeaders,
  decodeBase64Url,
  getResultStorageArea,
  normalizeProfileAvatarFields,
  parseAuthResponse,
  parseJsonText,
  randomToken,
  redactSensitiveTokenValues,
  scoreProfileAvatarPayload,
  serializeError
} from "./shared.js";

const HELPER_STATE_KEY = "loginButtonHelperStateV1";
const CLOSE_WINDOW_DELAY_MS = 1000;

const statusElement = document.getElementById("status");

void run();

function setStatus(text) {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = String(text || "");
}

async function fetchProfile(accessToken = "") {
  if (!accessToken) {
    return null;
  }

  const endpoints = [
    ...PROFILE_CLIENT_IDS.map((clientId) => ({
      url: `${IMS_PROFILE_URL}?client_id=${encodeURIComponent(clientId)}`,
      clientId
    })),
    {
      url: IMS_PROFILE_URL,
      clientId: ""
    }
  ];

  let bestPayload = null;
  let bestPayloadScore = Number.NEGATIVE_INFINITY;
  for (const endpoint of endpoints) {
    const attempts = [{ credentials: "omit" }, { credentials: "include" }];

    for (const attempt of attempts) {
      try {
        const response = await fetch(endpoint.url, {
          method: "GET",
          mode: "cors",
          credentials: attempt.credentials,
          headers: buildImsProfileHeaders(accessToken, endpoint.clientId)
        });
        if (!response.ok) {
          continue;
        }

        const text = await response.text().catch(() => "");
        const parsed = parseJsonText(text, null);
        if (parsed && typeof parsed === "object") {
          const normalizedPayload = normalizeProfileAvatarFields(parsed);
          const payloadScore = scoreProfileAvatarPayload(normalizedPayload);
          if (payloadScore > bestPayloadScore) {
            bestPayload = normalizedPayload;
            bestPayloadScore = payloadScore;
          }
          if (payloadScore >= 320) {
            return normalizedPayload;
          }
        }
      } catch {
        // Continue to the next variant.
      }
    }
  }

  return bestPayload;
}

async function fetchOrganizations(accessToken = "") {
  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(IMS_ORGS_URL, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*",
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) {
      return null;
    }

    return parseJsonText(await response.text().catch(() => ""), null);
  } catch {
    return null;
  }
}

function decodeExtraParams(rawValue) {
  const decoded = decodeBase64Url(rawValue);
  const parsed = parseJsonText(decoded, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return parsed;
}

function readHelperState() {
  try {
    const raw = sessionStorage.getItem(HELPER_STATE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeHelperState(nextState) {
  try {
    sessionStorage.setItem(HELPER_STATE_KEY, JSON.stringify(nextState || {}));
  } catch {
    // Ignore storage failures in the helper window.
  }
}

function clearHelperState() {
  try {
    sessionStorage.removeItem(HELPER_STATE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

async function cacheResultForApp(payload) {
  const requestId = String(payload?.requestId || "").trim();
  const storageArea = getResultStorageArea();
  if (!requestId || !storageArea?.set) {
    return;
  }

  const persistPayload = {};
  for (const key of buildHelperResultKeys(requestId)) {
    persistPayload[key] = payload;
  }

  try {
    await storageArea.set(persistPayload);
  } catch {
    // Ignore storage session failures.
  }
}

async function emitResult(payload) {
  const normalizedPayload = {
    ...payload,
    requestId: String(payload?.requestId || "").trim()
  };

  await cacheResultForApp(normalizedPayload);

  try {
    await chrome.runtime.sendMessage({
      type: HELPER_RESULT_MESSAGE_TYPE,
      message: normalizedPayload
    });
  } catch {
    // The opener may be gone; storage polling still covers this.
  }
}

function closeWindowSoon() {
  window.setTimeout(() => {
    window.close();
  }, CLOSE_WINDOW_DELAY_MS);
}

async function failLogin(requestId, error) {
  const message = redactSensitiveTokenValues(error instanceof Error ? error.message : String(error || "Login failed."));
  setStatus(message);
  await emitResult({
    ok: false,
    mode: "login",
    requestId,
    error: message
  });
  closeWindowSoon();
}

async function handleImsRedirect(query) {
  const stored = readHelperState();
  const requestId = String(stored?.requestId || query.get("requestId") || "").trim();
  const expectedState = String(stored?.requestState || query.get("state") || "").trim();

  try {
    setStatus("Finishing sign-in…");
    const authData = parseAuthResponse(window.location.href, expectedState);
    const profile = await fetchProfile(authData.accessToken);
    const organizations = await fetchOrganizations(authData.accessToken);
    clearHelperState();

    await emitResult({
      ok: true,
      mode: "login",
      requestId,
      accessToken: authData.accessToken,
      expiresAt: authData.expiresAt,
      tokenType: authData.tokenType || "bearer",
      scope: authData.scope || "",
      idToken: authData.idToken || "",
      refreshToken: authData.refreshToken || "",
      imsSession: authData.imsSession && typeof authData.imsSession === "object" ? authData.imsSession : null,
      profile,
      organizations
    });

    setStatus("Sign-in completed. Closing window…");
    closeWindowSoon();
  } catch (error) {
    clearHelperState();
    await failLogin(requestId, error);
  }
}

function beginLogin(query) {
  const requestId = String(query.get("requestId") || "").trim() || randomToken();
  const requestState = String(query.get("state") || "").trim() || randomToken();
  const extraParams = decodeExtraParams(query.get("extra"));
  const authUrl = buildAuthorizeUrl(requestState, extraParams);

  writeHelperState({
    requestId,
    requestState,
    createdAt: Date.now()
  });

  setStatus("Redirecting to Adobe IMS…");
  window.location.replace(authUrl);
}

async function beginLogout(query) {
  const requestId = String(query.get("requestId") || "").trim();

  clearHelperState();
  await emitResult({
    ok: true,
    mode: "logout",
    requestId
  });
  setStatus("Helper session cleared. Closing window…");
  closeWindowSoon();
}

async function run() {
  const query = new URLSearchParams(window.location.search);
  const mode = String(query.get("mode") || "login").toLowerCase() === "logout" ? "logout" : "login";
  const fromIms = String(query.get("from_ims") || "").toLowerCase() === "true";

  if (mode === "logout") {
    await beginLogout(query);
    return;
  }

  if (fromIms || window.location.href.includes("from_ims=true")) {
    await handleImsRedirect(query);
    return;
  }

  beginLogin(query);
}
