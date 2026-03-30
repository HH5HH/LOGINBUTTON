const HARPO_REST_V2_INTERACTIVE_BASE_URL = "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/";
const HARPO_DCR_INTERACTIVE_BASE_URL = "https://developer.adobe.com/adobe-pass/api/dcr-api/interactive/";

const HARPO_DCR_INTERACTIVE_DOC_ENTRIES = Object.freeze([
  {
    endpointId: "dcr-client-register",
    key: "dcr-client-register",
    label: "Register Client Application",
    learningLabel: "LEARN THIS DCR CALL",
    operationAnchor: "operation/processSoftwareStatementUsingPOST",
    operationId: "processSoftwareStatementUsingPOST",
    contentType: "application/json",
    usesDeviceHeaders: true,
    usesUserAgent: true,
    usesBodySoftwareStatement: true,
    requireBodySoftwareStatement: true,
    usesBodyRedirectUri: true,
    requireBodyRedirectUri: true
  },
  {
    endpointId: "dcr-client-token",
    key: "dcr-client-token",
    label: "Retrieve Client Token",
    learningLabel: "LEARN THIS DCR CALL",
    operationAnchor: "operation/generateAccessTokenUsingPOST",
    operationId: "generateAccessTokenUsingPOST",
    usesQueryClientId: true,
    requireQueryClientId: true,
    usesQueryClientSecret: true,
    requireQueryClientSecret: true,
    usesQueryRefreshToken: true
  }
]);

const HARPO_REST_V2_INTERACTIVE_DOC_ENTRIES = Object.freeze([
  {
    endpointId: "rest-v2-configuration",
    key: "configuration-service-provider",
    label: "Service Provider Configuration",
    operationAnchor: "operation/handleRequestUsingGET",
    operationId: "handleRequestUsingGET",
    requiresAccessToken: true
  },
  {
    endpointId: "rest-v2-authenticate-user-agent",
    key: "sessions-start-authentication",
    label: "Start Authentication",
    operationAnchor: "operation/startAuthenticationUsingGET",
    operationId: "startAuthenticationUsingGET",
    requiresAccessToken: false,
    usesSessionCode: true,
    requireSessionCode: true
  },
  {
    endpointId: "rest-v2-sessions-create",
    key: "sessions-create-session",
    label: "Create Session",
    operationAnchor: "operation/createSessionUsingPOST",
    operationId: "createSessionUsingPOST",
    requiresAccessToken: true,
    usesDeviceHeaders: true,
    usesVisitorIdentifier: true,
    usesAdobeSubjectToken: true,
    usesAdServiceToken: true,
    contentType: "application/x-www-form-urlencoded",
    usesBodyMvpd: true,
    usesBodyDomainName: true,
    usesBodyRedirectUrl: true
  },
  {
    endpointId: "rest-v2-sessions-resume",
    key: "sessions-resume-session",
    label: "Resume Session",
    operationAnchor: "operation/resumeSessionUsingPOST",
    operationId: "resumeSessionUsingPOST",
    requiresAccessToken: true,
    contentType: "application/x-www-form-urlencoded",
    usesVisitorIdentifier: true,
    usesSessionCode: true,
    requireSessionCode: true,
    usesBodyMvpd: true,
    usesBodyDomainName: true,
    usesBodyRedirectUrl: true
  },
  {
    endpointId: "rest-v2-sessions-retrieve",
    key: "sessions-session-status",
    label: "Session Status",
    operationAnchor: "operation/getSessionStatusUsingGET_1",
    operationId: "getSessionStatusUsingGET_1",
    requiresAccessToken: true,
    usesVisitorIdentifier: true,
    usesSessionCode: true,
    requireSessionCode: true
  },
  {
    endpointId: "rest-v2-profile-code",
    key: "profiles-by-code",
    label: "Profiles by Code",
    operationAnchor: "operation/getProfileForCodeUsingGET_1",
    operationId: "getProfileForCodeUsingGET_1",
    requiresAccessToken: true,
    usesVisitorIdentifier: true,
    usesSessionCode: true,
    requireSessionCode: true
  },
  {
    endpointId: "rest-v2-profiles",
    key: "profiles-all",
    label: "All Profiles",
    operationAnchor: "operation/getProfilesUsingGET_1",
    operationId: "getProfilesUsingGET_1",
    requiresAccessToken: true,
    usesDeviceHeaders: true,
    usesVisitorIdentifier: true,
    usesAdobeSubjectToken: true,
    usesAdServiceToken: true,
    usesPartnerFrameworkStatus: true
  },
  {
    endpointId: "rest-v2-profile-mvpd",
    key: "profiles-by-mvpd",
    label: "Profile by MVPD",
    operationAnchor: "operation/getProfileForMvpdUsingGET",
    operationId: "getProfileForMvpdUsingGET",
    requiresAccessToken: true,
    usesDeviceHeaders: true,
    usesMvpdPath: true,
    requireMvpdPath: true,
    usesAdobeSubjectToken: true,
    usesAdServiceToken: true,
    usesTempPassIdentity: true,
    usesVisitorIdentifier: true,
    usesPartnerFrameworkStatus: true
  },
  {
    endpointId: "rest-v2-decisions-authorize",
    key: "decisions-authorize",
    label: "Authorize",
    operationAnchor: "operation/retrieveAuthorizeDecisionsForMvpdUsingPOST",
    operationId: "retrieveAuthorizeDecisionsForMvpdUsingPOST",
    requiresAccessToken: true,
    usesDeviceHeaders: true,
    usesVisitorIdentifier: true,
    usesMvpdPath: true,
    requireMvpdPath: true,
    usesAdobeSubjectToken: true,
    usesAdServiceToken: true,
    usesTempPassIdentity: true,
    usesPartnerFrameworkStatus: true,
    usesBodyResources: true,
    requireBodyResources: true,
    contentType: "application/json"
  },
  {
    endpointId: "rest-v2-decisions-preauthorize",
    key: "decisions-preauthorize",
    label: "Preauthorize",
    operationAnchor: "operation/retrievePreAuthorizeDecisionsForMvpdUsingPOST_1",
    operationId: "retrievePreAuthorizeDecisionsForMvpdUsingPOST_1",
    requiresAccessToken: true,
    usesDeviceHeaders: true,
    usesVisitorIdentifier: true,
    usesMvpdPath: true,
    requireMvpdPath: true,
    usesAdobeSubjectToken: true,
    usesAdServiceToken: true,
    usesTempPassIdentity: true,
    usesPartnerFrameworkStatus: true,
    usesBodyResources: true,
    requireBodyResources: true,
    contentType: "application/json"
  },
  {
    endpointId: "rest-v2-logout",
    key: "logout-by-mvpd",
    label: "Logout for MVPD",
    operationAnchor: "operation/getLogoutForMvpdUsingGET",
    operationId: "getLogoutForMvpdUsingGET",
    requiresAccessToken: true,
    usesDeviceHeaders: true,
    usesVisitorIdentifier: true,
    usesMvpdPath: true,
    requireMvpdPath: true,
    usesAdobeSubjectToken: true,
    usesAdServiceToken: true,
    usesQueryRedirectUrl: true
  },
  {
    endpointId: "rest-v2-profiles-partner",
    key: "partner-sso-create-profile",
    label: "Create Partner Profile",
    operationAnchor: "operation/createPartnerProfileUsingPOST",
    operationId: "createPartnerProfileUsingPOST",
    requiresAccessToken: true,
    usesDeviceHeaders: true,
    usesVisitorIdentifier: true,
    usesPartnerPath: true,
    requirePartnerPath: true,
    usesPartnerFrameworkStatus: true,
    requirePartnerFrameworkStatus: true,
    usesBodySamlResponse: true,
    requireBodySamlResponse: true,
    contentType: "application/x-www-form-urlencoded"
  },
  {
    endpointId: "rest-v2-sessions-partner",
    key: "partner-sso-verification-token",
    label: "Retrieve Verification Token",
    operationAnchor: "operation/retrieveVerificationTokenUsingPOST",
    operationId: "retrieveVerificationTokenUsingPOST",
    requiresAccessToken: true,
    usesDeviceHeaders: true,
    usesVisitorIdentifier: true,
    usesPartnerPath: true,
    requirePartnerPath: true,
    usesPartnerFrameworkStatus: true,
    requirePartnerFrameworkStatus: true,
    usesBodyDomainName: true,
    requireBodyDomainName: true,
    usesBodyRedirectUrl: true,
    requireBodyRedirectUrl: true,
    contentType: "application/x-www-form-urlencoded"
  }
]);

const HARPO_REST_V2_INTERACTIVE_DOC_ENTRY_BY_ENDPOINT_ID = Object.freeze(
  HARPO_REST_V2_INTERACTIVE_DOC_ENTRIES.reduce((accumulator, entry) => {
    accumulator[entry.endpointId] = Object.freeze({ ...entry });
    return accumulator;
  }, {})
);

const HARPO_DCR_INTERACTIVE_DOC_ENTRY_BY_ENDPOINT_ID = Object.freeze(
  HARPO_DCR_INTERACTIVE_DOC_ENTRIES.reduce((accumulator, entry) => {
    accumulator[entry.endpointId] = Object.freeze({ ...entry });
    return accumulator;
  }, {})
);

function sleep(ms = 0) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, Number(ms || 0)));
  });
}

function normalizeHarpoLearningValue(value = "") {
  return String(value || "").trim();
}

function waitForTabCompletion(tabId = 0, timeoutMs = 20000) {
  const normalizedTabId = Number(tabId || 0);
  if (normalizedTabId <= 0 || !chrome.tabs?.get || !chrome.tabs?.onUpdated) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved?.removeListener(handleRemoved);
      resolve(value);
    };
    const handleUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== normalizedTabId) return;
      if (changeInfo.status === "complete") {
        settle(tab || null);
      }
    };
    const handleRemoved = (removedTabId) => {
      if (removedTabId === normalizedTabId) {
        settle(null);
      }
    };
    const timeoutId = globalThis.setTimeout(async () => {
      try {
        const tab = await chrome.tabs.get(normalizedTabId);
        settle(tab || null);
      } catch {
        settle(null);
      }
    }, Math.max(1000, Number(timeoutMs || 0) || 20000));

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onRemoved?.addListener(handleRemoved);
    void chrome.tabs.get(normalizedTabId).then((tab) => {
      if (tab?.status === "complete") {
        settle(tab);
      }
    }).catch(() => {});
  });
}

export function getHarpoRestV2InteractiveDocsEntryFromEndpointId(endpointId = "") {
  return HARPO_REST_V2_INTERACTIVE_DOC_ENTRY_BY_ENDPOINT_ID[String(endpointId || "").trim()] || null;
}

export function getHarpoDcrInteractiveDocsEntryFromEndpointId(endpointId = "") {
  return HARPO_DCR_INTERACTIVE_DOC_ENTRY_BY_ENDPOINT_ID[String(endpointId || "").trim()] || null;
}

export function buildHarpoRestV2InteractiveDocsUrl(anchor = "") {
  const normalizedAnchor = String(anchor || "").trim().replace(/^#/, "");
  return normalizedAnchor ? `${HARPO_REST_V2_INTERACTIVE_BASE_URL}#${normalizedAnchor}` : HARPO_REST_V2_INTERACTIVE_BASE_URL;
}

export function buildHarpoDcrInteractiveDocsUrl(anchor = "") {
  const normalizedAnchor = String(anchor || "").trim().replace(/^#/, "");
  return normalizedAnchor ? `${HARPO_DCR_INTERACTIVE_BASE_URL}#${normalizedAnchor}` : HARPO_DCR_INTERACTIVE_BASE_URL;
}

async function openHarpoInteractiveDocsPlanInternal(plan = null, options = {}) {
  const docsUrl = String(plan?.docsUrl || "").trim();
  const operationId = String(plan?.operationId || "").trim();
  const docsLabel = String(options?.docsLabel || "interactive docs").trim() || "interactive docs";
  const hydrateTab = typeof options?.hydrateTab === "function" ? options.hydrateTab : null;
  if (!docsUrl || !operationId) {
    return {
      ok: false,
      error: `HARPO ${docsLabel} learning plan is missing docsUrl or operationId.`
    };
  }
  if (!chrome.tabs?.create) {
    return {
      ok: false,
      error: "Chrome tabs API is unavailable."
    };
  }

  const openedTab = await chrome.tabs.create({ url: docsUrl, active: true });
  const tabId = Number(openedTab?.id || 0);
  if (tabId <= 0) {
    return {
      ok: false,
      error: `HARPO could not open the ${docsLabel} tab.`
    };
  }

  await waitForTabCompletion(tabId, 20000);

  let hydrationResult = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      hydrationResult = hydrateTab ? await hydrateTab(tabId, plan) : null;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || `${docsLabel} hydration failed.`));
      await sleep(220 * attempt);
    }
  }

  if (!hydrationResult) {
    return {
      ok: false,
      error: String(lastError?.message || `${docsLabel} hydration failed.`),
      tabId,
      url: docsUrl
    };
  }

  const unresolvedRequiredFields = Array.isArray(hydrationResult.unresolvedRequiredFields)
    ? hydrationResult.unresolvedRequiredFields.filter(Boolean)
    : [];

  return {
    ok: unresolvedRequiredFields.length === 0,
    partial: unresolvedRequiredFields.length > 0,
    tabId,
    url: docsUrl,
    hydrationResult
  };
}

export async function openHarpoRestV2InteractiveDocsPlan(plan = null) {
  return openHarpoInteractiveDocsPlanInternal(plan, {
    docsLabel: "REST V2 interactive docs",
    hydrateTab: hydrateHarpoRestV2InteractiveDocsTab
  });
}

export async function openHarpoDcrInteractiveDocsPlan(plan = null) {
  return openHarpoInteractiveDocsPlanInternal(plan, {
    docsLabel: "DCR interactive docs",
    hydrateTab: hydrateHarpoDcrInteractiveDocsTab
  });
}

async function runHarpoRestV2InteractiveDocsHydrator(config = {}) {
  const normalize = (value) => String(value || "").trim();
  const uniqueStrings = (values = []) => {
    const seen = new Set();
    const output = [];
    (Array.isArray(values) ? values : [values]).forEach((value) => {
      const normalizedValue = normalize(value);
      if (!normalizedValue) return;
      const dedupeKey = normalizedValue.toLowerCase();
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      output.push(normalizedValue);
    });
    return output;
  };
  const normalizeFieldMatchToken = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const parseFieldReference = (fieldName = "") => {
    const normalizedFieldName = normalize(fieldName);
    const dotIndex = normalizedFieldName.indexOf(".");
    if (dotIndex < 0) {
      return { scope: "", name: normalizedFieldName };
    }
    return {
      scope: normalize(normalizedFieldName.slice(0, dotIndex)).toLowerCase(),
      name: normalize(normalizedFieldName.slice(dotIndex + 1))
    };
  };
  const getHeaderAliasCandidates = (headerName = "") => {
    const lowerHeaderName = normalize(headerName).toLowerCase();
    if (!lowerHeaderName) return [];
    const aliases = {
      "adobe-subject-token": ["Adobe-Subject-Token", "adobeSubjectToken", "subjectToken"],
      "ad-service-token": ["AD-Service-Token", "adServiceToken", "serviceToken"],
      "ap-device-identifier": ["AP-Device-Identifier", "deviceIdentifier", "deviceId"],
      "x-device-info": ["X-Device-Info", "deviceInfo", "xDeviceInfo"],
      "ap-temppass-identity": ["AP-Temppass-Identity", "AP-TempPass-Identity", "tempPassIdentity"],
      "ap-temp-pass-identity": ["AP-Temppass-Identity", "AP-TempPass-Identity", "tempPassIdentity"],
      "ap-partner-framework-status": ["AP-Partner-Framework-Status", "partnerFrameworkStatus", "frameworkStatus"],
      "ap-visitor-identifier": ["AP-Visitor-Identifier", "visitorIdentifier", "visitorId"],
      "x-roku-reserved-roku-connect-token": ["X-Roku-Reserved-Roku-Connect-Token", "rokuConnectToken"]
    };
    return aliases[lowerHeaderName] || [headerName];
  };
  const getFieldNameCandidates = (fieldName = "") => {
    const normalizedFieldName = normalize(fieldName);
    if (!normalizedFieldName) return [];
    const { scope, name } = parseFieldReference(normalizedFieldName);
    const candidates = [normalizedFieldName];
    if (name) {
      candidates.push(name);
      if (scope) {
        candidates.push(`${scope}.${name}`);
      }
    }
    if (scope === "header" && name) {
      getHeaderAliasCandidates(name).forEach((alias) => {
        candidates.push(alias);
        candidates.push(`header.${alias}`);
      });
    }
    return uniqueStrings(candidates);
  };
  const buildFieldReferenceCandidates = (fieldName = "") =>
    getFieldNameCandidates(fieldName)
      .map((candidate) => {
        const parsed = parseFieldReference(candidate);
        const name = normalize(parsed?.name || candidate);
        const scope = normalize(parsed?.scope || "");
        const rawCandidates = uniqueStrings([candidate, name]);
        const matchTokens = uniqueStrings(rawCandidates.map((value) => normalizeFieldMatchToken(value))).filter(Boolean);
        if (!name || matchTokens.length === 0) return null;
        return { scope, rawCandidates, matchTokens };
      })
      .filter(Boolean);
  const collectDescendants = (root) => {
    if (!root || typeof root.querySelectorAll !== "function") return [];
    try {
      return Array.from(root.querySelectorAll("*"));
    } catch {
      return [];
    }
  };
  const isFormControlElement = (element) =>
    Boolean(element?.CodeMirror) ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement;
  const getElementTextHaystack = (element, options = {}) => {
    if (!element) return "";
    const includeParentText = options?.includeParentText === true;
    const parts = [
      normalize(element.textContent),
      normalize(element.getAttribute?.("data-param-name")),
      normalize(element.getAttribute?.("data-param-in")),
      normalize(element.getAttribute?.("data-name")),
      normalize(element.getAttribute?.("name")),
      normalize(element.getAttribute?.("aria-label")),
      normalize(element.getAttribute?.("placeholder")),
      normalize(element.id),
      normalize(element.className)
    ];
    if (includeParentText) {
      parts.push(normalize(element.parentElement?.textContent));
    }
    return parts.filter(Boolean).join(" ").toLowerCase();
  };
  const isElementScopeCompatible = (element, scope = "") => {
    const normalizedScope = normalize(scope).toLowerCase();
    if (!element || !normalizedScope) return true;
    const dataScope = normalize(element.getAttribute?.("data-param-in")).toLowerCase();
    if (dataScope) {
      return dataScope === normalizedScope;
    }
    const haystackToken = normalizeFieldMatchToken(getElementTextHaystack(element, { includeParentText: true }));
    return !haystackToken || haystackToken.includes(normalizeFieldMatchToken(normalizedScope));
  };
  const doesControlMatchField = (element, fieldCandidates = []) => {
    if (!element || !Array.isArray(fieldCandidates) || fieldCandidates.length === 0) return false;
    const rawControlCandidates = uniqueStrings([
      element.getAttribute?.("data-param-name"),
      element.getAttribute?.("data-name"),
      element.getAttribute?.("name"),
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("placeholder"),
      element.id,
      element.textContent
    ]);
    const controlMatchTokens = uniqueStrings(rawControlCandidates.map((value) => normalizeFieldMatchToken(value))).filter(Boolean);
    if (controlMatchTokens.length === 0) return false;
    return fieldCandidates.some(({ scope, rawCandidates, matchTokens }) => {
      if (!isElementScopeCompatible(element, scope)) return false;
      const exactMatch = rawCandidates.some((candidate) =>
        rawControlCandidates.some((controlCandidate) => String(controlCandidate || "").toLowerCase() === String(candidate || "").toLowerCase())
      );
      if (exactMatch) return true;
      return matchTokens.some((candidateToken) =>
        controlMatchTokens.some((controlToken) => controlToken === candidateToken || controlToken.includes(candidateToken))
      );
    });
  };
  const findEmbeddedControlWithin = (element) => {
    if (!element) return null;
    if (isFormControlElement(element)) return element;
    return collectDescendants(element).find((candidate) => isFormControlElement(candidate)) || null;
  };
  const findMatchingControlWithin = (element, fieldCandidates = []) => {
    if (!element) return null;
    if (isFormControlElement(element) && doesControlMatchField(element, fieldCandidates)) {
      return element;
    }
    const descendants = collectDescendants(element).filter((candidate) => isFormControlElement(candidate));
    return descendants.find((candidate) => doesControlMatchField(candidate, fieldCandidates)) || findEmbeddedControlWithin(element);
  };
  const findLabeledControl = (operation, fieldName) => {
    const fieldCandidates = buildFieldReferenceCandidates(fieldName);
    if (!operation || fieldCandidates.length === 0) return null;
    const descendants = collectDescendants(operation);
    const candidates = descendants.filter((element) => {
      const haystackToken = normalizeFieldMatchToken(getElementTextHaystack(element));
      if (!haystackToken) return false;
      return fieldCandidates.some(({ scope, matchTokens }) => {
        const hasNameMatch = matchTokens.some((candidateToken) => haystackToken.includes(candidateToken));
        return hasNameMatch && isElementScopeCompatible(element, scope);
      });
    });
    for (const candidate of candidates) {
      const control = findMatchingControlWithin(candidate, fieldCandidates);
      if (control) return control;
    }
    return null;
  };
  const isLikelyRequestBodyElement = (element) => {
    if (!element || !isFormControlElement(element)) return false;
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) return false;
    const combinedHaystack = [
      getElementTextHaystack(element, { includeParentText: true }),
      getElementTextHaystack(element.parentElement, { includeParentText: true })
    ].filter(Boolean).join(" ");
    return normalize(element.getAttribute?.("data-param-in")).toLowerCase() === "body" ||
      Boolean(element.closest?.('[data-cy="console-request-body"]')) ||
      /request body|request-body|body-param/.test(combinedHaystack);
  };
  const findRequestBodyEditor = (operation) => {
    if (!operation) return null;
    const explicitBodyEditor =
      operation.querySelector('[data-cy="console-request-body"] .CodeMirror') ||
      operation.querySelector('[data-cy="console-request-body"] textarea') ||
      operation.querySelector(".react-codemirror2 .CodeMirror") ||
      operation.querySelector(".react-codemirror2");
    if (explicitBodyEditor) {
      return findEmbeddedControlWithin(explicitBodyEditor) || explicitBodyEditor;
    }
    return collectDescendants(operation).find((element) => isLikelyRequestBodyElement(element)) || null;
  };
  const getElementCurrentValue = (element) => {
    if (!element) return "";
    if (element?.CodeMirror && typeof element.CodeMirror.getValue === "function") {
      return String(element.CodeMirror.getValue() || "");
    }
    if (typeof element.value === "string") {
      return element.value;
    }
    return "";
  };
  const buildRequestBodyEditorValue = (bodyEntries, editorElement, normalizedFieldValues) => {
    const contentType = String(normalizedFieldValues?.["header.Content-Type"] || config?.contentType || "").trim().toLowerCase();
    const bodyRecord = {};
    bodyEntries.forEach(([fieldName, rawValue]) => {
      const { name } = parseFieldReference(fieldName);
      if (!name) return;
      bodyRecord[name] = Array.isArray(rawValue) ? rawValue.slice() : String(rawValue ?? "");
    });
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams();
      Object.entries(bodyRecord).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((item) => params.append(key, String(item ?? "")));
        } else {
          params.set(key, String(value ?? ""));
        }
      });
      return params.toString();
    }
    const existingObject = (() => {
      try { return JSON.parse(getElementCurrentValue(editorElement)); } catch { return {}; }
    })();
    const mergedObject =
      existingObject && typeof existingObject === "object" && !Array.isArray(existingObject) ? { ...existingObject } : {};
    Object.entries(bodyRecord).forEach(([key, value]) => {
      mergedObject[key] = value;
    });
    return JSON.stringify(mergedObject, null, 2);
  };
  const setElementValue = (element, rawValue, fieldName = "") => {
    if (!element) return false;
    if (element?.CodeMirror && typeof element.CodeMirror.setValue === "function") {
      const valueText =
        String(fieldName || "").trim() === "body.resources"
          ? JSON.stringify({ resources: Array.isArray(rawValue) ? rawValue : [String(rawValue ?? "")] }, null, 2)
          : String(fieldName || "").trim() === "body.SAMLResponse"
            ? JSON.stringify({ SAMLResponse: String(rawValue ?? "") }, null, 2)
            : Array.isArray(rawValue) || (rawValue && typeof rawValue === "object")
              ? JSON.stringify(rawValue, null, 2)
              : String(rawValue ?? "");
      element.CodeMirror.setValue(valueText);
      element.CodeMirror.save?.();
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (element instanceof HTMLSelectElement) {
      const targetValue = normalize(rawValue);
      const options = Array.from(element.options || []);
      const matchedOption =
        options.find((option) => normalize(option.value) === targetValue) ||
        options.find((option) => normalize(option.textContent) === targetValue) ||
        options.find((option) => normalize(option.value).toLowerCase() === targetValue.toLowerCase()) ||
        options.find((option) => normalize(option.textContent).toLowerCase() === targetValue.toLowerCase());
      if (!matchedOption) return false;
      element.value = matchedOption.value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    const valueText =
      element instanceof HTMLTextAreaElement && Array.isArray(rawValue)
        ? JSON.stringify(rawValue, null, 2)
        : Array.isArray(rawValue)
          ? rawValue.join(", ")
          : String(rawValue ?? "");
    element.value = valueText;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  };
  const findControl = (operation, fieldName) => {
    const fieldNameCandidates = getFieldNameCandidates(fieldName);
    const fieldCandidates = buildFieldReferenceCandidates(fieldName);
    const normalizedFieldName = normalize(fieldNameCandidates[0] || fieldName);
    if (!operation || !normalizedFieldName || fieldNameCandidates.length === 0) {
      return null;
    }
    if (normalizedFieldName === "server") {
      return operation.querySelector("select");
    }
    for (const candidateFieldName of fieldNameCandidates) {
      const byId = document.getElementById(candidateFieldName);
      if (byId && operation.contains(byId)) return byId;
      const escapedName = candidateFieldName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const byName = operation.querySelector(`[name="${escapedName}"]`);
      if (byName) return byName;
    }
    const directMatch = collectDescendants(operation)
      .filter((element) => isFormControlElement(element))
      .find((element) => doesControlMatchField(element, fieldCandidates));
    if (directMatch) return directMatch;
    if (normalizedFieldName === "body.resources" || normalizedFieldName === "body.SAMLResponse") {
      return findRequestBodyEditor(operation);
    }
    return findLabeledControl(operation, normalizedFieldName);
  };
  const sleepFor = (ms = 0) => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms || 0))));
  const waitFor = async (resolver, timeoutMs = 15000, intervalMs = 120) => {
    const deadline = Date.now() + Math.max(1000, Number(timeoutMs || 0) || 15000);
    while (Date.now() < deadline) {
      const resolved = resolver();
      if (resolved) return resolved;
      await sleepFor(intervalMs);
    }
    return null;
  };
  const findActionButton = (scope, matchers = []) => {
    if (!scope) return null;
    return Array.from(scope.querySelectorAll("button")).find((button) =>
      matchers.some((matcher) => typeof matcher === "string"
        ? normalize(button.textContent).toLowerCase() === matcher
        : matcher instanceof RegExp
          ? matcher.test(normalize(button.textContent))
          : false
      )
    ) || null;
  };

  const operationId = normalize(config?.operationId);
  if (!operationId) {
    return { ok: false, error: "REST V2 docs hydrator is missing an operation id." };
  }

  const operationElement = await waitFor(() => document.getElementById(`operation/${operationId}`), config?.timeoutMs || 18000, 140);
  if (!operationElement) {
    return { ok: false, error: `REST V2 docs did not render operation/${operationId}.` };
  }

  if (location.hash !== `#operation/${operationId}`) {
    location.hash = `#operation/${operationId}`;
    await sleepFor(120);
  }

  operationElement.scrollIntoView({ behavior: "auto", block: "center" });
  await sleepFor(200);

  const requiredFields = Array.isArray(config?.requiredFields) ? config.requiredFields.map((item) => normalize(item)).filter(Boolean) : [];
  const missingRequiredFields = Array.isArray(config?.missingRequiredFields) ? config.missingRequiredFields.map((item) => normalize(item)).filter(Boolean) : [];
  const clearFieldNames = Array.isArray(config?.clearFieldNames) ? config.clearFieldNames.map((item) => normalize(item)).filter(Boolean) : [];
  const fieldValues = config?.fieldValues && typeof config.fieldValues === "object" ? config.fieldValues : {};
  const requestButton = findActionButton(operationElement, ["request", "edit request"]);
  if (requestButton) {
    requestButton.click();
    await sleepFor(120);
  }
  const sendButtonSelector = () =>
    operationElement.querySelector('[data-cy="send-button"]') || findActionButton(operationElement, ["send", "resend"]);
  const tryItButton = await waitFor(
    () => operationElement.querySelector('[data-cy="try-it"]') || findActionButton(operationElement, [/^try it$/i]),
    config?.timeoutMs || 18000,
    140
  );
  if (tryItButton instanceof HTMLElement && !sendButtonSelector()) {
    tryItButton.click();
  }

  await waitFor(() => sendButtonSelector() || findRequestBodyEditor(operationElement), config?.timeoutMs || 18000, 140);

  const filledFields = [];
  const missingControls = [];
  const bodyEditorEntries = [];
  const sharedBodyEditor = findRequestBodyEditor(operationElement);

  clearFieldNames.forEach((fieldName) => {
    if (Object.prototype.hasOwnProperty.call(fieldValues, fieldName)) return;
    const control = findControl(operationElement, fieldName);
    if (control && !(fieldName.startsWith("body.") && control === sharedBodyEditor)) {
      setElementValue(control, "", fieldName);
    }
  });

  Object.entries(fieldValues).forEach(([fieldName, rawValue]) => {
    const normalizedFieldName = normalize(fieldName);
    const control = findControl(operationElement, fieldName);
    if (normalizedFieldName.startsWith("body.") && control && sharedBodyEditor && control === sharedBodyEditor) {
      bodyEditorEntries.push([fieldName, rawValue]);
      return;
    }
    if (!control) {
      if (normalizedFieldName.startsWith("body.") && sharedBodyEditor) {
        bodyEditorEntries.push([fieldName, rawValue]);
      } else {
        missingControls.push(fieldName);
      }
      return;
    }
    if (setElementValue(control, rawValue, fieldName)) {
      filledFields.push(fieldName);
    } else {
      missingControls.push(fieldName);
    }
  });

  if (bodyEditorEntries.length > 0 && sharedBodyEditor) {
    const bodyEditorValue = buildRequestBodyEditorValue(bodyEditorEntries, sharedBodyEditor, fieldValues);
    if (setElementValue(sharedBodyEditor, bodyEditorValue, "body")) {
      bodyEditorEntries.forEach(([fieldName]) => filledFields.push(fieldName));
    } else {
      bodyEditorEntries.forEach(([fieldName]) => missingControls.push(fieldName));
    }
  }

  const unresolvedRequiredFields = [...new Set([...missingRequiredFields, ...missingControls.filter((fieldName) => requiredFields.includes(normalize(fieldName)))])];
  const firstPendingField = unresolvedRequiredFields[0] || missingControls[0] || "";
  const firstPendingControl = firstPendingField ? findControl(operationElement, firstPendingField) : null;
  const sendButton = sendButtonSelector();
  if (firstPendingControl instanceof HTMLElement) {
    firstPendingControl.focus();
  } else if (sendButton instanceof HTMLElement) {
    sendButton.focus();
  }

  return {
    ok: unresolvedRequiredFields.length === 0,
    operationId,
    filledFields,
    missingControls,
    unresolvedRequiredFields,
    sendButtonFound: Boolean(sendButton),
    currentHash: normalize(location.hash)
  };
}

export async function hydrateHarpoRestV2InteractiveDocsTab(tabId, plan = null) {
  const normalizedTabId = Number(tabId || 0);
  if (!chrome.scripting?.executeScript) {
    throw new Error("Chrome scripting is unavailable. Reload Login Button and retry.");
  }
  if (normalizedTabId <= 0) {
    throw new Error("HARPO REST V2 docs hydrator is missing a usable tab target.");
  }
  const executionResults = await chrome.scripting.executeScript({
    target: { tabId: normalizedTabId },
    world: "MAIN",
    args: [
      {
        operationId: String(plan?.operationId || "").trim(),
        requiredFields: Array.isArray(plan?.requiredFields) ? plan.requiredFields.slice() : [],
        missingRequiredFields: Array.isArray(plan?.missingRequiredFields) ? plan.missingRequiredFields.slice() : [],
        clearFieldNames: Array.isArray(plan?.clearFieldNames) ? plan.clearFieldNames.slice() : [],
        fieldValues: plan?.fieldValues && typeof plan.fieldValues === "object" ? { ...plan.fieldValues } : {},
        contentType: String(plan?.fieldValues?.["header.Content-Type"] || "").trim(),
        timeoutMs: 18000
      }
    ],
    func: runHarpoRestV2InteractiveDocsHydrator
  });
  const result = executionResults?.[0]?.result && typeof executionResults[0].result === "object" ? executionResults[0].result : null;
  if (!result) {
    throw new Error("REST V2 docs hydration returned no result.");
  }
  if (result.ok !== true && result.error) {
    throw new Error(String(result.error || "REST V2 docs hydration failed."));
  }
  return result;
}

export async function hydrateHarpoDcrInteractiveDocsTab(tabId, plan = null) {
  const normalizedTabId = Number(tabId || 0);
  if (!chrome.scripting?.executeScript) {
    throw new Error("Chrome scripting is unavailable. Reload Login Button and retry.");
  }
  if (normalizedTabId <= 0) {
    throw new Error("HARPO DCR docs hydrator is missing a usable tab target.");
  }
  const executionResults = await chrome.scripting.executeScript({
    target: { tabId: normalizedTabId },
    world: "MAIN",
    args: [
      {
        operationId: String(plan?.operationId || "").trim(),
        requiredFields: Array.isArray(plan?.requiredFields) ? plan.requiredFields.slice() : [],
        missingRequiredFields: Array.isArray(plan?.missingRequiredFields) ? plan.missingRequiredFields.slice() : [],
        clearFieldNames: Array.isArray(plan?.clearFieldNames) ? plan.clearFieldNames.slice() : [],
        fieldValues: plan?.fieldValues && typeof plan.fieldValues === "object" ? { ...plan.fieldValues } : {},
        contentType: String(plan?.fieldValues?.["header.Content-Type"] || "").trim(),
        timeoutMs: 18000
      }
    ],
    func: runHarpoRestV2InteractiveDocsHydrator
  });
  const result = executionResults?.[0]?.result && typeof executionResults[0].result === "object" ? executionResults[0].result : null;
  if (!result) {
    throw new Error("DCR docs hydration returned no result.");
  }
  if (result.ok !== true && result.error) {
    throw new Error(String(result.error || "DCR docs hydration failed."));
  }
  return result;
}
