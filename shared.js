export const FLOW_LABEL = "Login Button";
export const HELPER_PAGE_PATH = "ims-helper.html";
export const HELPER_RESULT_MESSAGE_TYPE = "loginbutton:loginHelperResult";
export const SESSION_KEY = "loginButtonUnderparFlowSession";
export const IMS_RUNTIME_CONFIG_KEY = "loginButtonImsRuntimeConfig";
export const IMS_CLIENT_ID = "";
export const IMS_IDENTITY_SCOPE = "openid profile";
export const IMS_LEGACY_DEFAULT_SCOPE = "openid profile offline_access additional_info.projectedProductContext";
export const IMS_CONSOLE_DEFAULT_SCOPE = "openid profile offline_access additional_info.projectedProductContext";
export const IMS_ANALYTICS_SCOPE =
  "openid AdobeID read_organizations additional_info.projectedProductContext additional_info.job_function";
export const IMS_SCOPE = IMS_CONSOLE_DEFAULT_SCOPE;
export const IMS_CONSOLE_ALLOWED_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "additional_info.projectedProductContext"
];
export const IMS_LEGACY_SCOPE_MIGRATION_TOKENS = [
  "AdobeID",
  "avatar",
  "session",
  "read_organizations",
  "additional_info.job_function",
  "additional_info.account_type",
  "additional_info.roles",
  "additional_info.user_image_url",
  "analytics_services"
];
export const IMS_ISSUER_URL = "https://ims-na1.adobelogin.com";
export const IMS_OPENID_CONFIGURATION_URL = `${IMS_ISSUER_URL}/ims/.well-known/openid-configuration`;
export const IMS_DEFAULT_AUTHORIZATION_ENDPOINT = `${IMS_ISSUER_URL}/ims/authorize/v2`;
export const IMS_DEFAULT_TOKEN_ENDPOINT = `${IMS_ISSUER_URL}/ims/token/v3`;
export const IMS_DEFAULT_USERINFO_ENDPOINT = `${IMS_ISSUER_URL}/ims/userinfo/v2`;
export const IMS_DEFAULT_REVOCATION_ENDPOINT = `${IMS_ISSUER_URL}/ims/revoke`;
export const IMS_AUTHORIZE_URL = "https://ims-na1.adobelogin.com/ims/authorize/v1";
export const IMS_BASE_URL = IMS_ISSUER_URL;
export const IMS_PROFILE_URL = "https://ims-na1.adobelogin.com/ims/profile/v1";
export const IMS_ORGS_URL = "https://ims-na1.adobelogin.com/ims/organizations/v5";
export const IMS_LEGACY_REDIRECT_URI = "https://login.aepdebugger.adobe.com";
export const PPS_PROFILE_BASE_URL = "https://pps.services.adobe.com";
export const PROFILE_CLIENT_IDS = [IMS_CLIENT_ID, "AdobePass1"].filter(Boolean);
export const CONSOLE_LEGACY_DEFAULT_ENVIRONMENT = "release-staging";
export const CONSOLE_DEFAULT_ENVIRONMENT = "release-production";
export const CONSOLE_ENVIRONMENT_CONFIGS = Object.freeze({
  "release-production": {
    label: "Release Production",
    baseUrl: "https://console.auth.adobe.com/rest/api",
    imsEnvironment: "prod"
  },
  "release-staging": {
    label: "Release Staging",
    baseUrl: "https://console.auth-staging.adobe.com/rest/api",
    imsEnvironment: "prod"
  },
  "prequal-production": {
    label: "Prequal Production",
    baseUrl: "https://console-prequal.auth.adobe.com/rest/api",
    imsEnvironment: "prod"
  },
  "prequal-production-secondary": {
    label: "Prequal Production Secondary",
    baseUrl: "https://console-prequal-secondary.auth.adobe.com/rest/api",
    imsEnvironment: "stage"
  },
  "prequal-staging": {
    label: "Prequal Staging",
    baseUrl: "https://console-prequal.auth-staging.adobe.com/rest/api",
    imsEnvironment: "prod"
  },
  "prequal-staging-secondary": {
    label: "Prequal Staging Secondary",
    baseUrl: "https://console-prequal-secondary.auth-staging.adobe.com/rest/api",
    imsEnvironment: "prod"
  },
  preprod: {
    label: "Preprod",
    baseUrl: "https://console-preprod.auth.adobe.com/rest/api",
    imsEnvironment: "prod"
  },
  dev: {
    label: "Dev",
    baseUrl: "https://console-dev.auth.adobe.com/rest/api",
    imsEnvironment: "stage"
  }
});
export const CONSOLE_USER_EXTENDED_PROFILE_PATH = "/user/extendedProfile";
export const CONSOLE_LATEST_CONFIGURATION_VERSION_PATH = "/config/latestActivatedConsoleConfigurationVersion";
export const CONSOLE_PROGRAMMERS_PATH = "/entity/Programmer";

const HELPER_RESULT_PREFIX = "loginButtonHelperResultV1:";
const ZIP_KEY_FILE_PREFIX = "ZIPKEY1:";
const PKCE_VERIFIER_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
const JWT_VALUE_REDACTION_PATTERN = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_TOKEN_REDACTION_PATTERN = /\bBearer\s+[A-Za-z0-9._~-]{20,}\b/gi;
const NAMED_TOKEN_VALUE_REDACTION_PATTERN =
  /\b(access[_\s-]?token|id[_\s-]?token|refresh[_\s-]?token)\b\s*([:=])\s*([A-Za-z0-9._~-]{16,})/gi;

export function buildAuthorizeUrl(requestState, extraParams = {}) {
  const params = new URLSearchParams({
    client_id: IMS_CLIENT_ID,
    response_type: "token",
    scope: IMS_SCOPE,
    state: requestState,
    locale: "en_US",
    redirect_uri: IMS_LEGACY_REDIRECT_URI
  });

  for (const [key, value] of Object.entries(extraParams || {})) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  return `${IMS_AUTHORIZE_URL}?${params.toString()}`;
}

export function buildHelperResultKeys(requestId) {
  const normalized = String(requestId || "").trim();
  if (!normalized) {
    return [];
  }

  return [`${HELPER_RESULT_PREFIX}${normalized}`];
}

export function buildImsProfileHeaders(accessToken = "", clientId = "") {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json;charset=utf-8"
  };

  const normalizedClientId = String(clientId || "").trim();
  if (normalizedClientId) {
    headers["X-IMS-ClientId"] = normalizedClientId;
    headers["x-api-key"] = normalizedClientId;
    headers.client_id = normalizedClientId;
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

export function getResultStorageArea() {
  return chrome.storage?.session || chrome.storage?.local || null;
}

export function getDefaultImsRuntimeConfig() {
  const consoleEnvironment = normalizeConsoleEnvironment(CONSOLE_DEFAULT_ENVIRONMENT);
  return {
    clientId: String(IMS_CLIENT_ID || "").trim(),
    scope: normalizeScopeList(IMS_SCOPE),
    rawScope: "",
    droppedScopes: [],
    hasExplicitScope: false,
    consoleEnvironment,
    consoleBaseUrl: resolveConsoleBaseUrl({ consoleEnvironment }),
    hasExplicitConsoleTarget: false,
    organizations: [],
    source: "defaults",
    importedAt: ""
  };
}

export async function loadImsRuntimeConfig() {
  const baseConfig = getDefaultImsRuntimeConfig();
  if (!chrome.storage?.local?.get) {
    return baseConfig;
  }

  try {
    const stored = await chrome.storage.local.get(IMS_RUNTIME_CONFIG_KEY);
    return normalizeImsRuntimeConfig(stored?.[IMS_RUNTIME_CONFIG_KEY]);
  } catch {
    return baseConfig;
  }
}

export async function importImsRuntimeConfigFromText(rawText = "") {
  const parsedPayload = parseZipKeyPayload(rawText);
  const normalized = normalizeImsRuntimeConfig(parsedPayload);
  if (!normalized.clientId) {
    throw new Error("Parsed ZIP.KEY is missing required Adobe IMS value: adobe.ims.client_id.");
  }

  if (!chrome.storage?.local?.set) {
    throw new Error("Chrome local storage is unavailable.");
  }

  const storedConfig = {
    ...normalized,
    source: "ZIP.KEY",
    importedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ [IMS_RUNTIME_CONFIG_KEY]: storedConfig });
  return storedConfig;
}

export async function clearImsRuntimeConfig() {
  if (chrome.storage?.local?.remove) {
    await chrome.storage.local.remove(IMS_RUNTIME_CONFIG_KEY);
  }

  return getDefaultImsRuntimeConfig();
}

export function normalizeImsRuntimeConfig(payload) {
  const sourcePayload = payload && typeof payload === "object" ? payload : {};
  const clientId = readZipKeyValue(sourcePayload, [
    "services.adobe.ims.client_id",
    "services.adobe.ims.clientId",
    "adobe.ims.client_id",
    "adobe.ims.clientId",
    "ims.client_id",
    "ims.clientId",
    "client_id",
    "clientId",
    "flow.clientId"
  ]);
  const rawScope = firstNonEmptyString([
    readZipKeyValue(sourcePayload, [
      "services.adobe.ims.scope",
      "adobe.ims.scope",
      "ims.scope",
      "scope",
      "flow.scope"
    ]),
    firstNonEmptyString([sourcePayload.rawScope])
  ]);
  const hasExplicitScope = sourcePayload.hasExplicitScope === true
    || hasAnyConfiguredValue(sourcePayload, [
      "services.adobe.ims.scope",
      "adobe.ims.scope",
      "ims.scope",
      "scope",
      "flow.scope"
    ]);
  const shouldUpgradeLegacyDefaultScope =
    normalizeScopeList(firstNonEmptyString([rawScope, sourcePayload.scope]), IMS_SCOPE) === IMS_LEGACY_DEFAULT_SCOPE;
  const effectiveRawScope = shouldUpgradeLegacyDefaultScope ? "" : rawScope;
  const sanitizedScope = sanitizeImsScopeForCredential(effectiveRawScope || IMS_SCOPE);
  const configuredConsoleEnvironment = normalizeConsoleEnvironment(
    readZipKeyValue(sourcePayload, [
      "services.adobe.console.environment",
      "services.adobe.console.env",
      "adobepass.console.environment",
      "adobepass.console.env",
      "adobe.console.environment",
      "adobe.console.env",
      "console.environment",
      "console.env",
      "consoleEnvironment",
      "flow.consoleEnvironment"
    ]),
    CONSOLE_DEFAULT_ENVIRONMENT
  );
  const hasExplicitConsoleTarget = sourcePayload.hasExplicitConsoleTarget === true
    || hasAnyConfiguredValue(sourcePayload, [
      "services.adobe.console.environment",
      "services.adobe.console.env",
      "adobepass.console.environment",
      "adobepass.console.env",
      "adobe.console.environment",
      "adobe.console.env",
      "console.environment",
      "console.env",
      "consoleEnvironment",
      "flow.consoleEnvironment",
      "services.adobe.console.base_url",
      "services.adobe.console.baseUrl",
      "services.adobe.console.url",
      "adobepass.console.base_url",
      "adobepass.console.baseUrl",
      "adobepass.console.url",
      "adobe.console.base_url",
      "adobe.console.baseUrl",
      "adobe.console.url",
      "console.base_url",
      "console.baseUrl",
      "console.url",
      "consoleUrl",
      "flow.consoleUrl"
    ]);
  const configuredConsoleBaseUrl = readZipKeyValue(sourcePayload, [
    "services.adobe.console.base_url",
    "services.adobe.console.baseUrl",
    "services.adobe.console.url",
    "adobepass.console.base_url",
    "adobepass.console.baseUrl",
    "adobepass.console.url",
    "adobe.console.base_url",
    "adobe.console.baseUrl",
    "adobe.console.url",
    "console.base_url",
    "console.baseUrl",
    "console.url",
    "consoleUrl",
    "flow.consoleUrl"
  ]);
  const shouldUpgradeLegacyDefaultConsoleTarget =
    !hasExplicitConsoleTarget &&
    normalizeConsoleEnvironment(firstNonEmptyString([sourcePayload.consoleEnvironment, configuredConsoleEnvironment]), CONSOLE_DEFAULT_ENVIRONMENT) === CONSOLE_LEGACY_DEFAULT_ENVIRONMENT &&
    normalizeConsoleBaseUrl(firstNonEmptyString([sourcePayload.consoleBaseUrl, configuredConsoleBaseUrl])) === normalizeConsoleBaseUrl(
      CONSOLE_ENVIRONMENT_CONFIGS[CONSOLE_LEGACY_DEFAULT_ENVIRONMENT]?.baseUrl
    );
  const consoleEnvironment = shouldUpgradeLegacyDefaultConsoleTarget
    ? CONSOLE_DEFAULT_ENVIRONMENT
    : configuredConsoleEnvironment;
  const effectiveConsoleBaseUrl = shouldUpgradeLegacyDefaultConsoleTarget ? "" : configuredConsoleBaseUrl;
  const organizations = normalizeConfiguredOrganizations(
    readZipKeyRawValue(sourcePayload, [
      "services.adobe.ims.organizations",
      "services.adobe.ims.orgs",
      "adobe.ims.organizations",
      "adobe.ims.orgs",
      "ims.organizations",
      "ims.orgs",
      "organizations",
      "orgs"
    ]),
    collectConfiguredOrganizationEntriesByPrefix(sourcePayload)
  );
  const source = firstNonEmptyString([sourcePayload.source, clientId ? "ZIP.KEY" : "defaults"]);
  const importedAt = firstNonEmptyString([sourcePayload.importedAt]);

  return {
    clientId,
    scope: sanitizedScope.scope,
    rawScope: effectiveRawScope,
    droppedScopes: sanitizedScope.droppedScopes,
    hasExplicitScope,
    consoleEnvironment,
    consoleBaseUrl: resolveConsoleBaseUrl({
      consoleEnvironment,
      consoleBaseUrl: effectiveConsoleBaseUrl
    }),
    hasExplicitConsoleTarget,
    organizations,
    source,
    importedAt
  };
}

export function normalizeConsoleEnvironment(value = "", fallbackEnvironment = CONSOLE_DEFAULT_ENVIRONMENT) {
  const fallback = String(fallbackEnvironment || CONSOLE_DEFAULT_ENVIRONMENT).trim().toLowerCase();
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized && CONSOLE_ENVIRONMENT_CONFIGS[normalized]) {
    return normalized;
  }

  return CONSOLE_ENVIRONMENT_CONFIGS[fallback] ? fallback : CONSOLE_DEFAULT_ENVIRONMENT;
}

export function normalizeConsoleBaseUrl(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return "";
    }
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    parsed.hash = "";
    parsed.search = "";

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function getConsoleEnvironmentMeta(environment = CONSOLE_DEFAULT_ENVIRONMENT) {
  const normalizedEnvironment = normalizeConsoleEnvironment(environment, CONSOLE_DEFAULT_ENVIRONMENT);
  const meta = CONSOLE_ENVIRONMENT_CONFIGS[normalizedEnvironment] || CONSOLE_ENVIRONMENT_CONFIGS[CONSOLE_DEFAULT_ENVIRONMENT];

  return {
    id: normalizedEnvironment,
    label: meta?.label || CONSOLE_DEFAULT_ENVIRONMENT,
    baseUrl: meta?.baseUrl || "",
    imsEnvironment: meta?.imsEnvironment || "prod"
  };
}

export function resolveConsoleBaseUrl({ consoleEnvironment = CONSOLE_DEFAULT_ENVIRONMENT, consoleBaseUrl = "" } = {}) {
  const normalizedBaseUrl = normalizeConsoleBaseUrl(consoleBaseUrl);
  if (normalizedBaseUrl) {
    return normalizedBaseUrl;
  }

  return getConsoleEnvironmentMeta(consoleEnvironment).baseUrl;
}

export function randomToken() {
  try {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

export function encodeBase64UrlUtf8(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  return base64UrlEncode(bytes);
}

export function parseJsonText(text, fallback = null) {
  if (!text || typeof text !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function normalizeScopeList(scopeValue = "", fallbackScope = IMS_SCOPE) {
  const fallback = String(fallbackScope || IMS_SCOPE).trim();
  const tokens = String(scopeValue || "")
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return fallback;
  }

  return Array.from(new Set(tokens)).join(" ");
}

export function sanitizeImsScopeForCredential(scopeValue = "", fallbackScope = IMS_SCOPE) {
  const normalized = normalizeScopeList(scopeValue, fallbackScope);
  const requestedTokens = normalized.split(/\s+/).filter(Boolean);
  const allowed = new Set(IMS_CONSOLE_ALLOWED_SCOPES);
  const shouldMigrateLegacyScopeBundle = requestedTokens.some((token) => IMS_LEGACY_SCOPE_MIGRATION_TOKENS.includes(token));
  const supportedTokens = [];
  const droppedScopes = [];

  for (const token of requestedTokens) {
    if (allowed.has(token)) {
      supportedTokens.push(token);
    } else {
      droppedScopes.push(token);
    }
  }

  const effectiveScope = shouldMigrateLegacyScopeBundle
    ? IMS_CONSOLE_DEFAULT_SCOPE
    : supportedTokens.length > 0
      ? IMS_CONSOLE_ALLOWED_SCOPES.filter((token) => supportedTokens.includes(token)).join(" ")
      : normalizeScopeList(fallbackScope, IMS_SCOPE);

  return {
    scope: effectiveScope,
    droppedScopes
  };
}

export function scopeIncludes(scopeValue = "", requiredScope = "") {
  const required = String(requiredScope || "").trim();
  if (!required) {
    return false;
  }

  return normalizeScopeList(scopeValue)
    .split(/\s+/)
    .includes(required);
}

export function decodeBase64Url(value) {
  if (!value) {
    return "";
  }

  let normalized = String(value).trim().replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  if (remainder) {
    normalized += "=".repeat(4 - remainder);
  }

  try {
    return atob(normalized);
  } catch {
    return "";
  }
}

export function decodeJwtPayload(token) {
  const raw = String(token || "").trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split(".");
  if (parts.length < 2) {
    return null;
  }

  const parsed = parseJsonText(decodeBase64Url(parts[1]), null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function parseKeyValueText(rawText) {
  const payload = {};
  const rows = String(rawText || "").split(/\r?\n/);

  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = row.match(/^\s*([^=:\s]+)\s*[:=]\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }

    payload[String(match[1] || "").trim()] = String(match[2] || "").trim();
  }

  return payload;
}

function parseZipKeyPayload(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) {
    return {};
  }

  let payloadText = raw;
  if (raw.slice(0, ZIP_KEY_FILE_PREFIX.length).toUpperCase() === ZIP_KEY_FILE_PREFIX) {
    payloadText = raw.slice(ZIP_KEY_FILE_PREFIX.length).trim();
  }

  if (!payloadText) {
    return {};
  }

  if (payloadText.startsWith("{")) {
    const parsedJson = parseJsonText(payloadText, null);
    if (!parsedJson || typeof parsedJson !== "object") {
      throw new Error("ZIP.KEY JSON payload could not be parsed.");
    }
    return parsedJson;
  }

  const decodedJson = parseJsonText(decodeBase64Text(payloadText), null);
  if (decodedJson && typeof decodedJson === "object") {
    return decodedJson;
  }

  const keyValuePayload = parseKeyValueText(payloadText);
  if (Object.keys(keyValuePayload).length > 0) {
    return keyValuePayload;
  }

  throw new Error("Unknown ZIP.KEY format. Use ZIPKEY1 base64 JSON, raw JSON, or KEY=VALUE lines.");
}

function normalizeConfigValue(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function readObjectPathValue(source, path) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath || !source || typeof source !== "object") {
    return "";
  }

  const directValue = normalizeConfigValue(source[normalizedPath]);
  if (directValue) {
    return directValue;
  }

  const parts = normalizedPath.split(".");
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return "";
    }
    current = current[part];
  }

  return normalizeConfigValue(current);
}

function readRawObjectPathValue(source, path) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath || !source || typeof source !== "object") {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(source, normalizedPath)) {
    return source[normalizedPath];
  }

  const parts = normalizedPath.split(".");
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function readZipKeyValue(payload, candidatePaths = []) {
  for (const candidatePath of candidatePaths) {
    const value = readObjectPathValue(payload, candidatePath);
    if (value) {
      return value;
    }
  }

  return "";
}

function readZipKeyRawValue(payload, candidatePaths = []) {
  for (const candidatePath of candidatePaths) {
    const value = readRawObjectPathValue(payload, candidatePath);
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === "string" && !value.trim()) {
      continue;
    }
    return value;
  }

  return undefined;
}

function hasAnyConfiguredValue(payload, candidatePaths = []) {
  for (const candidatePath of candidatePaths) {
    const value = readRawObjectPathValue(payload, candidatePath);
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === "string" && !value.trim()) {
      continue;
    }
    return true;
  }

  return false;
}

function decodeBase64Text(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  try {
    return atob(normalized);
  } catch {
    return "";
  }
}

function normalizeConfiguredOrganizations(value, additionalEntries = []) {
  const sourceValue = normalizeConfiguredOrganizationsSource(value);
  if (!sourceValue) {
    if (!Array.isArray(additionalEntries) || additionalEntries.length === 0) {
      return [];
    }
  }

  const rawEntries = [
    ...(Array.isArray(sourceValue)
      ? sourceValue
      : sourceValue && typeof sourceValue === "object"
        ? Object.entries(sourceValue).map(([id, label]) => ({ id, label }))
        : []),
    ...(Array.isArray(additionalEntries) ? additionalEntries : [])
  ];
  const organizations = [];
  const seen = new Set();

  rawEntries.forEach((entry, index) => {
    const normalized = normalizeConfiguredOrganizationEntry(entry, index);
    if (!normalized || seen.has(normalized.key)) {
      return;
    }
    seen.add(normalized.key);
    organizations.push(normalized);
  });

  return organizations;
}

function normalizeConfiguredOrganizationsSource(value) {
  if (Array.isArray(value) || (value && typeof value === "object")) {
    return value;
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith("[") || raw.startsWith("{")) {
    const parsed = parseJsonText(raw, null);
    if (Array.isArray(parsed) || (parsed && typeof parsed === "object")) {
      return parsed;
    }
  }

  const entries = raw
    .split(/[;\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorMatch = entry.match(/^([^|:=]+)\s*(?:\||:|=)\s*(.+)$/);
      if (separatorMatch) {
        return {
          id: separatorMatch[1],
          label: separatorMatch[2]
        };
      }

      return {
        id: entry,
        label: entry
      };
    });

  return entries;
}

function collectConfiguredOrganizationEntriesByPrefix(sourcePayload = {}) {
  if (!sourcePayload || typeof sourcePayload !== "object") {
    return [];
  }

  const candidatePrefixes = [
    "services.adobe.ims.organizations.",
    "services.adobe.ims.organization.",
    "services.adobe.ims.orgs.",
    "services.adobe.ims.org.",
    "adobe.ims.organizations.",
    "adobe.ims.organization.",
    "adobe.ims.orgs.",
    "adobe.ims.org.",
    "ims.organizations.",
    "ims.organization.",
    "ims.orgs.",
    "ims.org.",
    "organizations.",
    "organization.",
    "orgs.",
    "org."
  ];
  const entries = [];

  for (const [key, value] of Object.entries(sourcePayload)) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      continue;
    }

    const matchedPrefix = candidatePrefixes.find((prefix) => normalizedKey.startsWith(prefix));
    if (!matchedPrefix) {
      continue;
    }

    const organizationId = normalizedKey.slice(matchedPrefix.length).trim();
    const organizationLabel = String(value ?? "").trim();
    if (!organizationId || !organizationLabel) {
      continue;
    }

    entries.push({
      id: organizationId,
      label: organizationLabel
    });
  }

  return entries;
}

function normalizeConfiguredOrganizationEntry(entry, index = 0) {
  const payload =
    typeof entry === "string"
      ? {
          id: entry,
          label: entry
        }
      : entry && typeof entry === "object"
        ? entry
        : null;
  if (!payload) {
    return null;
  }

  const id = firstNonEmptyString([
    payload.id,
    payload.orgId,
    payload.orgID,
    payload.org_id,
    payload.organizationId,
    payload.organizationID,
    payload.organization_id,
    payload.customerOrgId,
    payload.customer_org_id,
    payload.value
  ]);
  const label = firstNonEmptyString([
    payload.label,
    payload.name,
    payload.title,
    payload.displayName,
    payload.organizationName,
    payload.organization_name,
    id
  ]);
  if (!id || !label) {
    return null;
  }

  return {
    key: `target-org:${String(id).trim().toLowerCase() || index}`,
    id: String(id).trim(),
    label: String(label).trim()
  };
}

export function redactSensitiveTokenValues(value) {
  const raw = String(value || "");
  if (!raw) {
    return "";
  }

  return raw
    .replace(BEARER_TOKEN_REDACTION_PATTERN, "Bearer <redacted>")
    .replace(NAMED_TOKEN_VALUE_REDACTION_PATTERN, (_match, tokenName, operator) => `${tokenName}${operator}<redacted>`)
    .replace(JWT_VALUE_REDACTION_PATTERN, "<redacted-jwt>");
}

export function firstNonEmptyString(values = []) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function normalizeAvatarCandidate(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim().replace(/^['"]+|['"]+$/g, "");
  if (!trimmed) {
    return "";
  }

  if (/^data:image\//i.test(trimmed) || /^blob:/i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (/^\/?api\/profile\/[^/]+\/image(\/|$)/i.test(trimmed)) {
    const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `${PPS_PROFILE_BASE_URL}${normalizedPath}`;
  }

  if (/^ims\/avatar\/download\//i.test(trimmed)) {
    return `${IMS_BASE_URL}/${trimmed}`;
  }

  if (/^avatar\/download\//i.test(trimmed)) {
    return `${IMS_BASE_URL}/ims/${trimmed}`;
  }

  if (/^\/ims\/avatar\/download\//i.test(trimmed)) {
    return `${IMS_BASE_URL}${trimmed}`;
  }

  if (trimmed.startsWith("/")) {
    return `${IMS_BASE_URL}${trimmed}`;
  }

  if (!trimmed.includes("://") && /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    if (parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

export function toImsAvatarDownloadUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const normalized = normalizeAvatarCandidate(raw);
  if (normalized) {
    return normalized;
  }

  return `${IMS_BASE_URL}/ims/avatar/download/${encodeURIComponent(raw)}`;
}

export function collectProfileAvatarCandidates(profilePayload) {
  if (!profilePayload || typeof profilePayload !== "object") {
    return [];
  }

  const candidates = new Set();
  const pushCandidate = (value) => {
    const normalized = normalizeAvatarCandidate(value);
    if (normalized) {
      candidates.add(normalized);
    }
  };

  const explicitValues = [
    profilePayload?.user_image_url,
    profilePayload?.userImageUrl,
    profilePayload?.avatar,
    profilePayload?.avatarUrl,
    profilePayload?.avatar_url,
    profilePayload?.additional_info?.user_image_url,
    profilePayload?.additional_info?.userImageUrl,
    profilePayload?.additional_info?.avatar,
    profilePayload?.additional_info?.avatarUrl,
    profilePayload?.additional_info?.avatar_url,
    profilePayload?.picture,
    profilePayload?.photo,
    profilePayload?.imageUrl,
    profilePayload?.images?.avatar?.url,
    profilePayload?.images?.avatar?.href,
    profilePayload?.images?.profile?.url,
    profilePayload?.images?.profile?.href
  ];

  for (const value of explicitValues) {
    pushCandidate(value);
  }

  pushCandidate(
    toImsAvatarDownloadUrl(
      firstNonEmptyString([
        profilePayload?.userId,
        profilePayload?.user_id,
        profilePayload?.sub,
        profilePayload?.id
      ])
    )
  );

  const seen = new WeakSet();
  const queue = [profilePayload];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (const entry of current) {
        if (entry && typeof entry === "object") {
          queue.push(entry);
        } else if (typeof entry === "string") {
          pushCandidate(entry);
        }
      }
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (value && typeof value === "object") {
        queue.push(value);
        continue;
      }
      if (typeof value !== "string") {
        continue;
      }

      if (/avatar|photo|picture|image|thumbnail|icon/i.test(key) || /\/api\/profile\/[^/]+\/image\//i.test(value)) {
        pushCandidate(value);
      }
    }
  }

  return [...candidates];
}

export function scoreProfileAvatarPayload(profilePayload) {
  if (!profilePayload || typeof profilePayload !== "object") {
    return Number.NEGATIVE_INFINITY;
  }

  const candidates = collectProfileAvatarCandidates(profilePayload).filter(
    (candidate) => !isSyntheticIdentityAvatarCandidate(profilePayload, candidate)
  );
  if (candidates.length === 0) {
    return -100;
  }

  let bestScore = -100;
  for (const candidate of candidates.slice(0, 10)) {
    let score = 0;
    if (candidate.startsWith("data:image/")) {
      score += 420;
    } else if (isPpsProfileImageUrl(candidate)) {
      score += 340;
    } else if (isImsAvatarDownloadUrl(candidate)) {
      score += 260;
    } else if (/\/ims\/avatar\//i.test(candidate)) {
      score += 220;
    } else {
      score += 140;
    }

    if (/avatar|profile|picture|photo|image/i.test(candidate)) {
      score += 16;
    }
    bestScore = Math.max(bestScore, score);
  }

  return bestScore + Math.min(candidates.length, 10) * 3;
}

export function pickAvatarUrl(profilePayload = {}, claims = {}) {
  const profileCandidates = collectProfileAvatarCandidates(profilePayload).filter(
    (candidate) => !isSyntheticIdentityAvatarCandidate(profilePayload, candidate)
  );
  if (profileCandidates.length > 0) {
    return profileCandidates[0];
  }

  const fallbackProfileCandidates = collectProfileAvatarCandidates(profilePayload);
  if (fallbackProfileCandidates.length > 0) {
    return fallbackProfileCandidates[0];
  }

  const claimCandidates = [
    claims?.picture,
    claims?.avatar,
    claims?.avatarUrl,
    claims?.avatar_url,
    claims?.image,
    toImsAvatarDownloadUrl(
      firstNonEmptyString([
        claims?.user_id,
        claims?.sub,
        claims?.id
      ])
    )
  ]
    .map((value) => normalizeAvatarCandidate(value))
    .filter(Boolean);

  return claimCandidates[0] || "";
}

export function normalizeProfileAvatarFields(profilePayload) {
  if (!profilePayload || typeof profilePayload !== "object") {
    return profilePayload;
  }

  const avatar = pickAvatarUrl(profilePayload);
  if (!avatar) {
    return profilePayload;
  }

  if (!profilePayload.user_image_url) {
    profilePayload.user_image_url = avatar;
  }
  if (!profilePayload.userImageUrl) {
    profilePayload.userImageUrl = avatar;
  }
  if (!profilePayload.avatar && !profilePayload.avatarUrl && !profilePayload.avatar_url) {
    profilePayload.avatarUrl = avatar;
  }

  return profilePayload;
}

export function parseAuthResponse(responseUrl, expectedState = "") {
  const authParams = extractAuthParams(responseUrl);
  const authError = authParams.get("error");
  if (authError) {
    const description = authParams.get("error_description");
    throw new Error(redactSensitiveTokenValues(description ? `${authError}: ${description}` : authError));
  }

  const returnedState = String(authParams.get("state") || "");
  const normalizedExpectedState = String(expectedState || "");
  if (normalizedExpectedState && returnedState && returnedState !== normalizedExpectedState) {
    throw new Error("State validation failed.");
  }

  const accessToken = String(authParams.get("access_token") || "").trim();
  if (!accessToken) {
    throw new Error("No access token returned from IMS.");
  }

  const expiry = resolveAuthResponseExpiry(accessToken, authParams.get("expires_in"));
  const expiresAt = coercePositiveNumber(expiry.expiresAt);
  const tokenType = String(authParams.get("token_type") || "bearer").trim();
  const scope = String(authParams.get("scope") || "").trim();
  const idToken = String(authParams.get("id_token") || "").trim();
  const refreshToken = String(authParams.get("refresh_token") || "").trim();
  const statePayload = parseImsStatePayload(String(authParams.get("state") || ""));

  const callbackSession = mergeImsSessionSnapshots(null, {
    tokenId: authParams.get("id"),
    sessionId: authParams.get("sid"),
    sessionUrl: firstNonEmptyString([authParams.get("session"), statePayload?.session]),
    userId: firstNonEmptyString([authParams.get("user_id"), authParams.get("userId")]),
    authId: firstNonEmptyString([authParams.get("aa_id"), authParams.get("authId"), authParams.get("auth_id")]),
    clientId: authParams.get("client_id"),
    tokenType,
    scope,
    as: authParams.get("as"),
    fg: authParams.get("fg"),
    moi: authParams.get("moi"),
    pba: authParams.get("pba"),
    keyAlias: authParams.get("key_alias"),
    stateNonce: statePayload?.nonce,
    stateJslibVersion: firstNonEmptyString([statePayload?.jslibver, statePayload?.jslibVersion]),
    expiresAt
  });

  const imsSession = mergeImsSessionSnapshots(expiry.tokenSnapshot, callbackSession);
  if (imsSession && (!Number.isFinite(Number(imsSession.expiresAt)) || Number(imsSession.expiresAt) <= 0)) {
    imsSession.expiresAt = expiresAt;
  }

  return {
    accessToken,
    expiresAt,
    tokenType: tokenType || "bearer",
    scope,
    idToken,
    refreshToken,
    imsSession
  };
}

export function flattenOrganizations(payload) {
  if (!payload) {
    return [];
  }

  const objects = collectObjects(payload, []);
  const seen = new Set();
  const flattened = [];

  for (const org of objects) {
    const key = JSON.stringify(org);
    if (!seen.has(key)) {
      seen.add(key);
      flattened.push(org);
    }
  }

  return flattened;
}

export function deriveInitials(name, email = "") {
  const source = String(name || email || "?").trim();
  if (!source) {
    return "?";
  }

  const parts = source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

export function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Not available";
  }

  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "Not available";
  }
}

export function isExpired(expiresAt) {
  if (!expiresAt) {
    return false;
  }

  const value = typeof expiresAt === "number" ? expiresAt : new Date(expiresAt).getTime();
  return Number.isFinite(value) && Date.now() >= value;
}

export function serializeError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || "Unknown error");
}

export function getDefaultImsOpenIdConfiguration() {
  return {
    issuer: IMS_ISSUER_URL,
    authorization_endpoint: IMS_DEFAULT_AUTHORIZATION_ENDPOINT,
    token_endpoint: IMS_DEFAULT_TOKEN_ENDPOINT,
    userinfo_endpoint: IMS_DEFAULT_USERINFO_ENDPOINT,
    revocation_endpoint: IMS_DEFAULT_REVOCATION_ENDPOINT
  };
}

export async function fetchImsOpenIdConfiguration() {
  let response;
  try {
    response = await fetch(IMS_OPENID_CONFIGURATION_URL, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: {
        Accept: "application/json"
      }
    });
  } catch (error) {
    throw new Error(`Unable to reach Adobe IMS discovery: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = parseJsonText(text, null);
  if (!response.ok) {
    throw new Error(extractOAuthError(parsed, text, "Adobe IMS discovery failed."));
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Adobe IMS discovery returned an invalid response.");
  }

  return {
    ...getDefaultImsOpenIdConfiguration(),
    ...parsed
  };
}

export function buildPkceCodeVerifier(length = 64) {
  const normalizedLength = Number.isFinite(Number(length)) ? Math.max(43, Math.min(128, Number(length))) : 64;
  const bytes = new Uint8Array(normalizedLength);
  crypto.getRandomValues(bytes);

  let output = "";
  for (const byte of bytes) {
    output += PKCE_VERIFIER_CHARSET[byte % PKCE_VERIFIER_CHARSET.length];
  }

  return output;
}

export async function buildPkceCodeChallenge(codeVerifier = "") {
  const verifier = String(codeVerifier || "").trim();
  if (verifier.length < 43) {
    throw new Error("PKCE code verifier is too short.");
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function buildAuthorizationCodeUrl({
  authorizationEndpoint = IMS_DEFAULT_AUTHORIZATION_ENDPOINT,
  clientId = IMS_CLIENT_ID,
  redirectUri = "",
  scope = IMS_SCOPE,
  state = "",
  codeChallenge = "",
  prompt = "",
  extraParams = {}
} = {}) {
  const endpoint = String(authorizationEndpoint || "").trim() || IMS_DEFAULT_AUTHORIZATION_ENDPOINT;
  const params = new URLSearchParams({
    client_id: String(clientId || IMS_CLIENT_ID),
    redirect_uri: String(redirectUri || ""),
    response_type: "code",
    scope: normalizeScopeList(scope, IMS_SCOPE),
    state: String(state || ""),
    code_challenge_method: "S256",
    code_challenge: String(codeChallenge || ""),
    response_mode: "query"
  });

  if (prompt) {
    params.set("prompt", String(prompt));
  }

  for (const [key, value] of Object.entries(extraParams || {})) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  return `${endpoint}?${params.toString()}`;
}

export function parseAuthorizationCodeResponse(responseUrl, expectedState = "") {
  const authParams = extractAuthParams(responseUrl);
  const authError = authParams.get("error");
  if (authError) {
    const description = authParams.get("error_description");
    throw new Error(redactSensitiveTokenValues(description ? `${authError}: ${description}` : authError));
  }

  const returnedState = String(authParams.get("state") || "").trim();
  const normalizedExpectedState = String(expectedState || "").trim();
  if (normalizedExpectedState && returnedState !== normalizedExpectedState) {
    throw new Error("State validation failed.");
  }

  const code = String(authParams.get("code") || "").trim();
  if (!code) {
    throw new Error("No authorization code returned from Adobe IMS.");
  }

  return {
    code,
    state: returnedState
  };
}

export async function exchangeAuthorizationCode({
  tokenEndpoint = IMS_DEFAULT_TOKEN_ENDPOINT,
  clientId = IMS_CLIENT_ID,
  code = "",
  codeVerifier = ""
} = {}) {
  const endpoint = new URL(String(tokenEndpoint || IMS_DEFAULT_TOKEN_ENDPOINT));
  endpoint.searchParams.set("client_id", String(clientId || IMS_CLIENT_ID));

  let response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code: String(code || ""),
        grant_type: "authorization_code",
        code_verifier: String(codeVerifier || "")
      })
    });
  } catch (error) {
    throw new Error(`Unable to exchange Adobe authorization code: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = parseJsonText(text, null);
  if (!response.ok) {
    throw new Error(extractOAuthError(parsed, text, "Adobe token exchange failed."));
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Adobe token exchange returned an invalid response.");
  }

  return parsed;
}

export async function fetchImsUserInfo({
  userInfoEndpoint = IMS_DEFAULT_USERINFO_ENDPOINT,
  accessToken = "",
  clientId = IMS_CLIENT_ID
} = {}) {
  if (!accessToken) {
    return null;
  }

  const endpoint = new URL(String(userInfoEndpoint || IMS_DEFAULT_USERINFO_ENDPOINT));
  if (clientId) {
    endpoint.searchParams.set("client_id", String(clientId));
  }

  let response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    });
  } catch (error) {
    throw new Error(`Unable to fetch Adobe user info: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = normalizeProfileAvatarFields(parseJsonText(text, null));
  if (!response.ok) {
    throw new Error(extractOAuthError(parsed, text, "Adobe user info request failed."));
  }

  return parsed && typeof parsed === "object" ? parsed : null;
}

export async function fetchImsProfile({
  profileEndpoint = IMS_PROFILE_URL,
  accessToken = "",
  clientId = IMS_CLIENT_ID
} = {}) {
  if (!accessToken) {
    return null;
  }

  const endpoint = new URL(String(profileEndpoint || IMS_PROFILE_URL));
  if (clientId) {
    endpoint.searchParams.set("client_id", String(clientId));
  }

  let response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: buildImsProfileHeaders(accessToken, clientId)
    });
  } catch (error) {
    throw new Error(`Unable to fetch Adobe IMS profile: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = normalizeProfileAvatarFields(parseJsonText(text, null));
  if (!response.ok) {
    throw new Error(extractOAuthError(parsed, text, "Adobe IMS profile request failed."));
  }

  return parsed && typeof parsed === "object" ? parsed : null;
}

export function mergeProfilePayloads(profilePayloads = []) {
  const profiles = profilePayloads
    .filter((payload) => payload && typeof payload === "object")
    .map((payload) => normalizeProfileAvatarFields(structuredCloneProfilePayload(payload)))
    .filter(Boolean);

  if (profiles.length === 0) {
    return null;
  }

  const merged = profiles.reduce((accumulator, profile) => mergeMissingProfileFields(accumulator, profile), {});
  const bestAvatarProfile = profiles.reduce((bestProfile, profile) => {
    return scoreProfileAvatarPayload(profile) > scoreProfileAvatarPayload(bestProfile) ? profile : bestProfile;
  }, profiles[0]);
  const bestAvatarUrl = pickAvatarUrl(bestAvatarProfile);

  if (bestAvatarUrl) {
    merged.user_image_url = merged.user_image_url || bestAvatarUrl;
    merged.userImageUrl = merged.userImageUrl || bestAvatarUrl;
    if (!merged.avatar && !merged.avatarUrl && !merged.avatar_url) {
      merged.avatarUrl = bestAvatarUrl;
    }
  }

  return normalizeProfileAvatarFields(merged);
}

export async function fetchImsOrganizations({
  organizationsEndpoint = IMS_ORGS_URL,
  accessToken = "",
  clientId = IMS_CLIENT_ID
} = {}) {
  if (!accessToken) {
    return null;
  }

  const endpoint = new URL(String(organizationsEndpoint || IMS_ORGS_URL));
  if (clientId) {
    endpoint.searchParams.set("client_id", String(clientId));
  }

  let response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: buildImsProfileHeaders(accessToken, clientId)
    });
  } catch (error) {
    throw new Error(`Unable to fetch Adobe organizations: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = parseJsonText(text, null);
  if (!response.ok) {
    throw new Error(extractOAuthError(parsed, text, "Adobe organizations request failed."));
  }

  return parsed && typeof parsed === "object" ? parsed : null;
}

export async function revokeImsToken({
  revocationEndpoint = IMS_DEFAULT_REVOCATION_ENDPOINT,
  clientId = IMS_CLIENT_ID,
  token = ""
} = {}) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return;
  }

  const endpoint = new URL(String(revocationEndpoint || IMS_DEFAULT_REVOCATION_ENDPOINT));
  endpoint.searchParams.set("client_id", String(clientId || IMS_CLIENT_ID));

  let response;
  try {
    response = await fetch(endpoint.toString(), {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        token: normalizedToken
      })
    });
  } catch (error) {
    throw new Error(`Unable to revoke Adobe token: ${serializeError(error)}`);
  }

  if (response.ok) {
    return;
  }

  const text = await response.text().catch(() => "");
  const parsed = parseJsonText(text, null);
  throw new Error(extractOAuthError(parsed, text, "Adobe token revocation failed."));
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isImsAvatarDownloadUrl(url) {
  if (!url || url.startsWith("data:image/") || url.startsWith("blob:")) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return /(^|\.)adobelogin\.com$/i.test(parsed.hostname) && /\/ims\/avatar\/download\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isPpsProfileImageUrl(url) {
  if (!url || url.startsWith("data:image/") || url.startsWith("blob:")) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return /(^|\.)pps\.services\.adobe\.com$/i.test(parsed.hostname) && /\/api\/profile\/[^/]+\/image(\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function structuredCloneProfilePayload(profilePayload) {
  if (!profilePayload || typeof profilePayload !== "object") {
    return null;
  }

  try {
    return structuredClone(profilePayload);
  } catch {
    return parseJsonText(JSON.stringify(profilePayload), null);
  }
}

function mergeMissingProfileFields(baseValue, incomingValue) {
  if (Array.isArray(baseValue) || Array.isArray(incomingValue)) {
    return Array.isArray(baseValue) && baseValue.length > 0 ? baseValue : incomingValue;
  }

  if (baseValue && typeof baseValue === "object" && incomingValue && typeof incomingValue === "object") {
    const merged = { ...incomingValue, ...baseValue };
    for (const key of new Set([...Object.keys(incomingValue), ...Object.keys(baseValue)])) {
      merged[key] = mergeMissingProfileFields(baseValue[key], incomingValue[key]);
    }
    return merged;
  }

  if (baseValue === undefined || baseValue === null || baseValue === "") {
    return incomingValue;
  }

  return baseValue;
}

function getProfileIdentityValue(profilePayload) {
  if (!profilePayload || typeof profilePayload !== "object") {
    return "";
  }

  return firstNonEmptyString([
    profilePayload?.userId,
    profilePayload?.user_id,
    profilePayload?.sub,
    profilePayload?.id
  ]);
}

function isSyntheticIdentityAvatarCandidate(profilePayload, candidate) {
  const identity = getProfileIdentityValue(profilePayload);
  const normalized = normalizeAvatarCandidate(candidate);
  if (!identity || !normalized || !isImsAvatarDownloadUrl(normalized)) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/\/ims\/avatar\/download\/([^/?#]+)/i);
    if (!match) {
      return false;
    }

    const decodedIdentity = decodeURIComponent(String(match[1] || "")).trim();
    return decodedIdentity === identity;
  } catch {
    return false;
  }
}

function extractAuthParams(responseUrl) {
  const response = new URL(responseUrl);
  const params = new URLSearchParams(response.search);

  let hash = response.hash.startsWith("#") ? response.hash.slice(1) : response.hash;
  if (hash) {
    hash = hash.replace(/from_ims=true\?/gi, "from_ims=true&").replace(/#/g, "&");
    const hashParams = new URLSearchParams(hash);
    for (const [key, value] of hashParams.entries()) {
      if (!params.has(key)) {
        params.set(key, value);
      }
    }
  }

  return params;
}

function mergeImsSessionSnapshots(baseSession, incomingSession) {
  const base = baseSession && typeof baseSession === "object" ? baseSession : {};
  const incoming = incomingSession && typeof incomingSession === "object" ? incomingSession : {};
  const merged = {
    tokenId: firstNonEmptyString([incoming.tokenId, incoming.id, base.tokenId, base.id]),
    sessionId: firstNonEmptyString([incoming.sessionId, incoming.sid, base.sessionId, base.sid]),
    sessionUrl: firstNonEmptyString([incoming.sessionUrl, incoming.session, base.sessionUrl, base.session]),
    userId: firstNonEmptyString([incoming.userId, incoming.user_id, base.userId, base.user_id]),
    authId: firstNonEmptyString([incoming.authId, incoming.aa_id, base.authId, base.aa_id]),
    clientId: firstNonEmptyString([incoming.clientId, incoming.client_id, base.clientId, base.client_id]),
    tokenType: firstNonEmptyString([incoming.tokenType, incoming.type, base.tokenType, base.type]),
    scope: firstNonEmptyString([incoming.scope, base.scope]),
    as: firstNonEmptyString([incoming.as, base.as]),
    fg: firstNonEmptyString([incoming.fg, base.fg]),
    moi: firstNonEmptyString([incoming.moi, base.moi]),
    pba: firstNonEmptyString([incoming.pba, base.pba]),
    keyAlias: firstNonEmptyString([incoming.keyAlias, incoming.key_alias, base.keyAlias, base.key_alias]),
    stateNonce: firstNonEmptyString([incoming.stateNonce, incoming.nonce, base.stateNonce, base.nonce]),
    stateJslibVersion: firstNonEmptyString([
      incoming.stateJslibVersion,
      incoming.jslibver,
      base.stateJslibVersion,
      base.jslibver
    ]),
    createdAt: Number(incoming.createdAt || incoming.created_at || base.createdAt || base.created_at || 0),
    issuedAt: Number(incoming.issuedAt || incoming.issued_at || base.issuedAt || base.issued_at || 0),
    expiresAt: Number(incoming.expiresAt || incoming.expires_at || base.expiresAt || base.expires_at || 0)
  };

  const filtered = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "" || Number.isNaN(value)) {
      continue;
    }
    filtered[key] = value;
  }

  return Object.keys(filtered).length > 0 ? filtered : null;
}

function parseImsStatePayload(rawState = "") {
  const normalized = String(rawState || "").trim();
  if (!normalized || !normalized.startsWith("{")) {
    return null;
  }

  const payload = parseJsonText(normalized, null);
  return payload && typeof payload === "object" ? payload : null;
}

function deriveImsSessionSnapshotFromToken(accessToken = "") {
  const claims = decodeJwtPayload(accessToken);
  if (!claims) {
    return null;
  }

  const statePayload = parseImsStatePayload(firstNonEmptyString([claims.state]));
  const expSeconds = Number(claims.exp || 0);
  const iatSeconds = Number(claims.iat || 0);
  const createdAtRaw = Number(claims.created_at || 0);
  const createdAtMs =
    createdAtRaw > 0 && createdAtRaw < 1000000000000 ? createdAtRaw * 1000 : createdAtRaw > 0 ? createdAtRaw : 0;

  return mergeImsSessionSnapshots(null, {
    tokenId: claims.id,
    sessionId: claims.sid,
    sessionUrl: firstNonEmptyString([claims.session, statePayload?.session]),
    userId: firstNonEmptyString([claims.user_id, claims.userId]),
    authId: firstNonEmptyString([claims.aa_id, claims.authId]),
    clientId: firstNonEmptyString([claims.client_id, claims.clientId]),
    tokenType: firstNonEmptyString([claims.type]),
    scope: firstNonEmptyString([claims.scope]),
    as: claims.as,
    fg: claims.fg,
    moi: claims.moi,
    pba: claims.pba,
    keyAlias: firstNonEmptyString([claims.key_alias, claims.keyAlias]),
    stateNonce: statePayload?.nonce,
    stateJslibVersion: firstNonEmptyString([statePayload?.jslibver, statePayload?.jslibVersion]),
    createdAt: createdAtMs,
    issuedAt: Number.isFinite(iatSeconds) && iatSeconds > 0 ? iatSeconds * 1000 : 0,
    expiresAt: Number.isFinite(expSeconds) && expSeconds > 0 ? expSeconds * 1000 : 0
  });
}

function coercePositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function resolveAuthResponseExpiry(accessToken, expiresInValue) {
  const tokenSnapshot = deriveImsSessionSnapshotFromToken(accessToken);
  const tokenExpiresAt = coercePositiveNumber(tokenSnapshot?.expiresAt);
  const expiresIn = coercePositiveNumber(expiresInValue);
  const now = Date.now();

  if (!expiresIn) {
    return {
      expiresAt: tokenExpiresAt,
      tokenSnapshot
    };
  }

  const expiresAtFromSeconds = now + expiresIn * 1000;
  const expiresAtFromMilliseconds = now + expiresIn;
  if (tokenExpiresAt > 0) {
    const candidates = [tokenExpiresAt, expiresAtFromSeconds];
    if (expiresIn >= 1000) {
      candidates.push(expiresAtFromMilliseconds);
    }

    let bestCandidate = tokenExpiresAt;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      if (!Number.isFinite(candidate) || candidate <= 0) {
        continue;
      }

      const delta = Math.abs(candidate - tokenExpiresAt);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestCandidate = candidate;
      }
    }

    return {
      expiresAt: bestCandidate,
      tokenSnapshot
    };
  }

  const appearsToBeMilliseconds = expiresIn >= 100000 && expiresIn <= 24 * 60 * 60 * 1000;
  return {
    expiresAt: appearsToBeMilliseconds ? expiresAtFromMilliseconds : expiresAtFromSeconds,
    tokenSnapshot
  };
}

function collectObjects(value, output = []) {
  if (!value) {
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjects(item, output);
    }
    return output;
  }

  if (typeof value === "object") {
    output.push(value);
    for (const nestedValue of Object.values(value)) {
      if (nestedValue && (Array.isArray(nestedValue) || typeof nestedValue === "object")) {
        collectObjects(nestedValue, output);
      }
    }
  }

  return output;
}

function extractOAuthError(parsedBody, rawText, fallbackMessage) {
  const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};
  return redactSensitiveTokenValues(
    firstNonEmptyString([
      body.error_description,
      body.error_message,
      body.error,
      rawText,
      fallbackMessage
    ])
  );
}
