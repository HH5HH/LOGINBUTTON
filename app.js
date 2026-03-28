import {
  CONSOLE_DEFAULT_ENVIRONMENT,
  CONSOLE_LATEST_CONFIGURATION_VERSION_PATH,
  CONSOLE_PROGRAMMERS_PATH,
  CONSOLE_USER_EXTENDED_PROFILE_PATH,
  FLOW_LABEL,
  IMS_CLIENT_ID,
  IMS_ISSUER_URL,
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
  normalizeImsRedirectUri,
  normalizeAvatarCandidate,
  getConsoleEnvironmentMeta,
  normalizeScopeList,
  parseJsonText,
  parseAuthorizationCodeResponse,
  pickAvatarUrl,
  randomToken,
  redactSensitiveTokenValues,
  resolveConsoleBaseUrl,
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
import {
  exportLoginButtonVaultSnapshot,
  importLoginButtonVaultSnapshot,
  LOGINBUTTON_VAULT_PROGRAMMER_RECORD_TTL_MS,
  assessProgrammerVaultRecord,
  mergeProgrammerVaultSelections,
  primeLoginButtonVault,
  readProgrammerVaultRecord,
  writeEnvironmentVaultGlobals,
  writeProgrammerVaultRecord
} from "./vault.js";
import { harpoIdbPut } from "./harpo-idb.js";

const BUILD_VERSION = chrome.runtime.getManifest().version;
const DEFAULT_CONFIG_STATUS_MESSAGE = "Drop key.";
const DEFAULT_DEBUG_TOGGLE_LABEL = "DEBUG INFO";
const DEFAULT_DEBUG_TOGGLE_META = "Click copies. Shift+click toggles details.";
const DEFAULT_DEBUG_COPY_STATUS = "Copied to clipboard";
const DEFAULT_VAULT_TRANSFER_STATUS_MESSAGE =
  "Export hydrated programmer records or import a VAULT from another Login Button user.";
const LOGINBUTTON_GET_UPDATE_STATE_REQUEST_TYPE = "loginbutton:getUpdateState";
const LOGINBUTTON_GET_LATEST_REQUEST_TYPE = "loginbutton:getLatest";
const ORG_PICKER_PLACEHOLDER_VALUE = "__loginbutton_choose_other_org__";
const ORG_PICKER_REAUTH_VALUE = "__loginbutton_reauth_org__";
const ORG_PICKER_UNAVAILABLE_VALUE = "__loginbutton_unavailable_org__";
const CM_TENANT_PICKER_PLACEHOLDER_VALUE = "__loginbutton_choose_cm_tenant__";
const CM_TENANT_PICKER_UNAVAILABLE_VALUE = "__loginbutton_cm_tenant_unavailable__";
const PROGRAMMER_PICKER_PLACEHOLDER_VALUE = "__loginbutton_choose_programmer__";
const PROGRAMMER_PICKER_UNAVAILABLE_VALUE = "__loginbutton_programmer_unavailable__";
const REGISTERED_APPLICATION_PICKER_PLACEHOLDER_VALUE = "__loginbutton_choose_registered_application__";
const REGISTERED_APPLICATION_PICKER_UNAVAILABLE_VALUE = "__loginbutton_registered_application_unavailable__";
const REQUESTOR_PICKER_PLACEHOLDER_VALUE = "__loginbutton_choose_requestor__";
const REQUESTOR_PICKER_UNAVAILABLE_VALUE = "__loginbutton_requestor_unavailable__";
const IMS_ORG_DISCOVERY_SCOPE = "read_organizations";
const ADOBE_PASS_TENANT_ID = "adobepass";
const ADOBE_PASS_DISPLAY_NAME = "Adobe Pass";
const ADOBE_PASS_IMS_ORG_ID = "30FC5E0951240C900A490D4D@AdobeOrg";
const IMS_DEFAULT_LOGOUT_ENDPOINT = `${IMS_ISSUER_URL}/ims/logout`;
const THEME_RAMP_STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600];
const CONSOLE_CHANNELS_PATH = "/entity/ServiceProvider";
const CONSOLE_APPLICATIONS_PATH = "/applications";
const UNIFIED_SHELL_GRAPHQL_URL = "https://exc-unifiedcontent.experience.adobe.net/api/gql/app/shell/graphql?appId=shell";
const UNIFIED_SHELL_API_KEY = "exc_app";
const UNIFIED_SHELL_OPERATION_NAME = "loginButtonShellInitDataQuery";
const CM_BASE_URL = "https://config.adobeprimetime.com";
const CM_REPORTS_BASE_URL = "https://cm-reports.adobeprimetime.com";
const ADOBE_SP_BASE_URL = "https://sp.auth.adobe.com";
const CM_TENANTS_PATH = "/core/tenants";
const DCR_REGISTER_PATH = "/o/client/register";
const DCR_TOKEN_PATH = "/o/client/token";
const CM_TENANTS_OWNER_ORG_ID = "adobe";
const CM_CONSOLE_IMS_CHECK_TOKEN_ENDPOINT = "https://adobeid-na1.services.adobe.com/ims/check/v6/token";
const CM_CONSOLE_IMS_VALIDATE_TOKEN_ENDPOINT = `${IMS_ISSUER_URL}/ims/validate_token/v1?jslVersion=loginbutton-cm`;
const CM_CONSOLE_IMS_CLIENT_ID = "cm-console-ui";
const CM_CONSOLE_IMS_SCOPE = "AdobeID,openid,dma_group_mapping,read_organizations,additional_info.projectedProductContext";
const CM_CONSOLE_APP_ORIGIN = "https://experience.adobe.com";
const CM_CONSOLE_APP_REFERER = `${CM_CONSOLE_APP_ORIGIN}/`;
const CM_CONSOLE_BOOTSTRAP_URL = `${CM_CONSOLE_APP_ORIGIN}/#/@${ADOBE_PASS_TENANT_ID}/cm-console/cmu/year`;
const ADOBE_PASS_CONSOLE_SHELL_PATH = `/#/@${ADOBE_PASS_TENANT_ID}/pass/authentication`;
const ADOBE_PASS_CONSOLE_APP_ORIGIN = "https://cdn.experience.adobe.net";
const ADOBE_PASS_CONSOLE_APP_SLUG = "AdobePass-adobepass-unifiedshell-console-client";
const CM_REPORTS_APP_ORIGIN = "https://cdn.experience.adobe.net";
const CM_REPORTS_APP_REFERER = `${CM_REPORTS_APP_ORIGIN}/`;
const CONSOLE_PAGE_CONTEXT_ALLOWED_ORIGINS = [ADOBE_PASS_CONSOLE_APP_ORIGIN];
const CM_REPORTS_SUMMARY_PATH = "/v2/year/month";
const PREMIUM_SERVICE_SCOPE_RULES = [
  { label: "REST API V2", scope: "api:client:v2" },
  { label: "ESM", scope: "analytics:client" },
  { label: "degradation", scope: "decisions:owner" },
  { label: "reset TempPass", scope: "temporary:passes:owner" }
];
const VAULT_DCR_SERVICE_DEFINITIONS = [
  { serviceKey: "restV2", label: "REST API V2", requiredScope: "api:client:v2" },
  { serviceKey: "esm", label: "ESM", requiredScope: "analytics:client" },
  { serviceKey: "degradation", label: "degradation", requiredScope: "decisions:owner" },
  { serviceKey: "resetTempPass", label: "reset TempPass", requiredScope: "temporary:passes:owner" }
];
const PREMIUM_SERVICE_CONCURRENCY_LABEL = "Concurrency Monitoring";

const HARPO_MESSAGE_START  = "harpo:startRecording";
const HARPO_MESSAGE_STOP   = "harpo:stopRecording";
const HARPO_MESSAGE_STATUS = "harpo:recordingStatus";
const HARPO_STORAGE_PREFIX = "harpo:";
const HARPO_DOMAIN_PICKER_PLACEHOLDER = "__harpo_choose_domain__";
const REGISTERED_APPLICATION_SCOPE_LABELS = {
  "api:client:v2": "REST API V2",
  "analytics:client": "ESM",
  "decisions:owner": "degradation",
  "temporary:passes:owner": "reset TempPass",
  "mvpd_status:client": "MVPD Status Service",
  "idp:owner": "Proxy MVPD push",
  "cmu:analytics:client": "CMU"
};
const CMU_TOKEN_HEADER_NAME = "Authorization";
const CMU_TOKEN_HEADER_SCHEME = "Bearer";
const CM_TOKEN_REFRESH_SKEW_MS = 45 * 1000;
const ADOBE_PAGE_CONTEXT_TIMEOUT_MS = 12 * 1000;
const UNIFIED_SHELL_INIT_QUERY = `
  query loginButtonShellInitDataQuery($selectedOrg: String, $useConsolidatedAccounts: Boolean) {
    imsExtendedAccountClusterData(
      selectedOrg: $selectedOrg
      ignoreSuppressed: true
      useV3: true
      useConsolidatedAccounts: $useConsolidatedAccounts
    ) {
      data {
        consolidatedAccount
        restricted
        userId
        userType
        owningOrg {
          aemInstances {
            domain
            environment
            path
            rootTemplate
            title
            type
          }
          aepRegion
          hasAEP
          imsOrgId
          orgName
          tenantId
        }
        orgs {
          aemInstances {
            domain
            environment
            path
            rootTemplate
            title
            type
          }
          aepRegion
          hasAEP
          imsOrgId
          orgName
          tenantId
        }
      }
      next
      preferredLanguages
      timestamp
    }
    userProfileJson(ignoreImsCache: false)
  }
`;

const themeControl = document.getElementById("themeControl");
const themePickerButton = document.getElementById("themePickerButton");
const themePickerButtonSwatch = document.getElementById("themePickerButtonSwatch");
const themePickerPopover = document.getElementById("themePickerPopover");
const themeSwatchGrid = document.getElementById("themeSwatchGrid");
const setupView = document.getElementById("setupView");
const zipKeyFileInput = document.getElementById("zipKeyFileInput");
const vaultImportInput = document.getElementById("vaultImportInput");
const zipKeyBrowseButton = document.getElementById("zipKeyBrowseButton");
const zipKeyDropSurface = document.getElementById("zipKeyDropSurface");
const zipKeyStatus = document.getElementById("zipKeyStatus");
const zipKeyDropOverlay = document.getElementById("zipKeyDropOverlay");
const loginButtonLabel = document.getElementById("loginButtonLabel");
const loggedOutView = document.getElementById("loggedOutView");
const authenticatedView = document.getElementById("authenticatedView");
const loginButton = document.getElementById("loginButton");
const loadZipKeyButton = document.getElementById("loadZipKeyButton");
const getLatestButton = document.getElementById("getLatestButton");
const logoutButton = document.getElementById("logoutButton");
const exportVaultButton = document.getElementById("exportVaultButton");
const importVaultButton = document.getElementById("importVaultButton");
const vaultTransferStatus = document.getElementById("vaultTransferStatus");
const loginStatus = document.getElementById("loginStatus");
const authenticatedHero = document.getElementById("authenticatedHero");
const avatarMenuButton = document.getElementById("avatarMenuButton");
const avatarMenu = document.getElementById("avatarMenu");
const avatarContainer = document.getElementById("avatarContainer");
const avatarImage = document.getElementById("avatarImage");
const avatarFallback = document.getElementById("avatarFallback");
const mainIdentityCopy = document.getElementById("mainIdentityCopy");
const identityHeadlineLabel = document.getElementById("identityHeadlineLabel");
const displayNameLink = document.getElementById("displayNameLink");
const displayEmail = document.getElementById("displayEmail");
const avatarMenuIdentityLabel = document.getElementById("avatarMenuIdentityLabel");
const avatarMenuDisplayName = document.getElementById("avatarMenuDisplayName");
const avatarMenuDisplayMeta = document.getElementById("avatarMenuDisplayMeta");
const avatarMenuOverview = document.getElementById("avatarMenuOverview");
const avatarMenuSummary = document.getElementById("avatarMenuSummary");
const avatarMenuCardList = document.getElementById("avatarMenuCardList");
const avatarMenuUserDataSummary = document.getElementById("avatarMenuUserDataSummary");
const avatarMenuUserDataList = document.getElementById("avatarMenuUserDataList");
const detectedOrganizationPicker = document.getElementById("detectedOrganizationPicker");
const detectedOrganizationPickerSection = document.getElementById("detectedOrganizationPickerContainer");
const cmFieldGroup = document.getElementById("cmFieldGroup");
const cmuTokenSection = document.getElementById("cmuTokenContainer");
const cmuTokenHeaderValue = document.getElementById("cmuTokenValue");
const cmTenantPicker = document.getElementById("cmTenantPicker");
const cmTenantPickerSection = document.getElementById("cmTenantPickerContainer");
const organizationPicker = document.getElementById("organizationPicker");
const programmerFieldGroup = document.getElementById("programmerFieldGroup");
const programmerPickerSection = document.getElementById("programmerPickerContainer");
const premiumServicesSection = document.getElementById("premiumServicesContainer");
const premiumServicesList = document.getElementById("premiumServicesList");
const requestorPicker = document.getElementById("requestorPicker");
const requestorPickerSection = document.getElementById("requestorPickerContainer");
const registeredApplicationPicker = document.getElementById("registeredApplicationPicker");
const registeredApplicationPickerSection = document.getElementById("registeredApplicationPickerContainer");
const organizationCardList = document.getElementById("organizationCardList");
const organizationListSummary = document.getElementById("organizationListSummary");
const organizationPickerMeta = document.getElementById("organizationPickerMeta");
const authenticatedPanelHeader = document.getElementById("authenticatedPanelHeader");
const authenticatedSummarySection = document.getElementById("authenticatedSummarySection");
const authenticatedUserDataSection = document.getElementById("authenticatedUserDataSection");
const organizationSwitchHelp = document.getElementById("organizationSwitchHelp");
const organizationReauthButton = document.getElementById("organizationReauthButton");
const organizationReauthButtonLabel = document.getElementById("organizationReauthButtonLabel");
const userDataSummary = document.getElementById("userDataSummary");
const userDataList = document.getElementById("userDataList");
const debugConsole = document.getElementById("debugConsole");
const debugConsoleBody = document.getElementById("debugConsoleBody");
const debugToggleButton = document.getElementById("debugToggleButton");
const debugToggleButtonLabel = document.getElementById("debugToggleButtonLabel");
const debugToggleButtonMeta = document.getElementById("debugToggleButtonMeta");
const debugToggleStatus = document.getElementById("debugToggleStatus");
const logOutput = document.getElementById("logOutput");

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
  lastSilentAuthAttemptAt: 0,
  dragActive: false,
  postLoginHydrationInFlight: false,
  vaultTransferBusy: false,
  selectedCmTenantId: "",
  selectedProgrammerId: "",
  selectedRegisteredApplicationId: "",
  selectedRequestorId: "",
  programmerApplicationsLoadingFor: "",
  selectedProgrammerVaultRecord: null,
  premiumServiceExpandedKeys: [],
  updateAvailable: false,
  latestVersion: "",
  latestCommitSha: "",
  updateCheckPending: false,
  updateCheckError: "",
  configStatus: {
    message: DEFAULT_CONFIG_STATUS_MESSAGE,
    tone: ""
  },
  vaultTransferStatus: {
    message: DEFAULT_VAULT_TRANSFER_STATUS_MESSAGE,
    tone: ""
  },
  selectedOrganizationSwitchKey: "",
  harpoExpanded: false,
  harpoReproOpen: false,
  harpoRecording: false,
  harpoRecordingCount: 0,
  logs: []
};
let dragDepth = 0;
let copyDebugResetTimer = 0;
let backgroundHydrationRequestId = 0;

applyThemePreferenceToDocument(state.theme);
initializeThemeSwatchGrid();

loginButton.addEventListener("click", async () => {
  state.selectedOrganizationSwitchKey = "";
  await login({
    forceInteractive: true,
    forceBrowserLogout: true,
    prompt: "login"
  });
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

if (getLatestButton) {
  getLatestButton.addEventListener("click", async () => {
    await triggerGetLatestWorkflow();
  });
}

organizationPicker.addEventListener("change", (event) => {
  const nextValue = String(event.currentTarget?.value || "").trim();
  if (
    !nextValue ||
    nextValue === PROGRAMMER_PICKER_PLACEHOLDER_VALUE ||
    nextValue === PROGRAMMER_PICKER_UNAVAILABLE_VALUE
  ) {
    state.selectedProgrammerId = "";
    state.selectedRegisteredApplicationId = "";
    state.selectedRequestorId = "";
    state.selectedProgrammerVaultRecord = null;
    render();
    return;
  }

  state.selectedProgrammerId = nextValue;
  state.selectedRegisteredApplicationId = "";
  state.selectedRequestorId = "";
  state.selectedProgrammerVaultRecord = null;
  render();
  void ensureSelectedProgrammerApplicationsLoaded(nextValue);
});

if (registeredApplicationPicker) {
  registeredApplicationPicker.addEventListener("change", (event) => {
    const nextValue = String(event.currentTarget?.value || "").trim();
    if (
      !nextValue ||
      nextValue === REGISTERED_APPLICATION_PICKER_PLACEHOLDER_VALUE ||
      nextValue === REGISTERED_APPLICATION_PICKER_UNAVAILABLE_VALUE
    ) {
      state.selectedRegisteredApplicationId = "";
      render();
      void persistSelectedProgrammerVaultSelections();
      return;
    }

    state.selectedRegisteredApplicationId = nextValue;
    render();
    void persistSelectedProgrammerVaultSelections();
  });
}

if (requestorPicker) {
  requestorPicker.addEventListener("change", (event) => {
    const nextValue = String(event.currentTarget?.value || "").trim();
    if (
      !nextValue ||
      nextValue === REQUESTOR_PICKER_PLACEHOLDER_VALUE ||
      nextValue === REQUESTOR_PICKER_UNAVAILABLE_VALUE
    ) {
      state.selectedRequestorId = "";
      render();
      void persistSelectedProgrammerVaultSelections();
      return;
    }

    state.selectedRequestorId = nextValue;
    render();
    void persistSelectedProgrammerVaultSelections();
  });
}

if (cmTenantPicker) {
  cmTenantPicker.addEventListener("change", (event) => {
    const nextValue = String(event.currentTarget?.value || "").trim();
    if (
      !nextValue ||
      nextValue === CM_TENANT_PICKER_PLACEHOLDER_VALUE ||
      nextValue === CM_TENANT_PICKER_UNAVAILABLE_VALUE
    ) {
      render();
      return;
    }

    state.selectedCmTenantId = nextValue;
    render();
    void persistSelectedProgrammerVaultSelections();
  });
}

if (detectedOrganizationPicker) {
  detectedOrganizationPicker.addEventListener("change", async (event) => {
    const nextValue = String(event.currentTarget?.value || "").trim();
    const organizationPickerContext = buildAuthenticatedOrganizationPickerContext(state.session);
    const activeOrganizationKey = String(organizationPickerContext?.activeOrganization?.key || "").trim();
    if (!nextValue || nextValue === ORG_PICKER_UNAVAILABLE_VALUE || nextValue === activeOrganizationKey) {
      state.selectedOrganizationSwitchKey = "";
      render();
      return;
    }

    state.selectedOrganizationSwitchKey = nextValue;
    render();
    try {
      await requestOrganizationSwitch(nextValue);
    } finally {
      if (state.selectedOrganizationSwitchKey === nextValue) {
        state.selectedOrganizationSwitchKey = "";
        render();
      }
    }
  });
}

if (organizationReauthButton) {
  organizationReauthButton.addEventListener("click", async () => {
    const nextKey = String(state.selectedOrganizationSwitchKey || "").trim();
    render();
    if (nextKey) {
      await requestOrganizationSwitch(nextKey);
      return;
    }
    await switchAdobeOrganization();
  });
}

zipKeyDropSurface.addEventListener("click", () => {
  zipKeyFileInput.click();
});

zipKeyFileInput.addEventListener("change", async (event) => {
  await importZipKeyFiles(event.currentTarget?.files);
});

if (vaultImportInput) {
  vaultImportInput.addEventListener("change", async (event) => {
    await importVaultFiles(event.currentTarget?.files);
  });
}

logoutButton.addEventListener("click", async () => {
  setAvatarMenuOpen(false);
  await logout();
});

if (exportVaultButton) {
  exportVaultButton.addEventListener("click", async () => {
    await exportVaultFromContextMenu();
  });
}

if (importVaultButton) {
  importVaultButton.addEventListener("click", () => {
    if (state.vaultTransferBusy || !vaultImportInput) {
      return;
    }

    vaultImportInput.click();
  });
}

avatarMenuButton.addEventListener("click", () => {
  if (avatarMenuButton.disabled) {
    return;
  }

  if (state.themePickerOpen) {
    state.themePickerOpen = false;
  }
  const nextOpen = !state.avatarMenuOpen;
  setAvatarMenuOpen(nextOpen);
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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[SESSION_KEY]) {
    state.session = changes[SESSION_KEY].newValue || null;
    state.selectedOrganizationSwitchKey = "";
    if (!state.session?.accessToken) {
      state.postLoginHydrationInFlight = false;
      state.selectedCmTenantId = "";
      state.selectedProgrammerId = "";
      state.selectedRegisteredApplicationId = "";
      state.selectedRequestorId = "";
      state.programmerApplicationsLoadingFor = "";
      state.selectedProgrammerVaultRecord = null;
    }
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
void initialize();

async function initialize() {
  setBusy(true);
  render();

  try {
    const stored = await chrome.storage.local.get([SESSION_KEY, THEME_STORAGE_KEY]);
    state.session = null;
    state.theme = normalizeThemePreference(stored[THEME_STORAGE_KEY] || DEFAULT_THEME);
    applyThemePreferenceToDocument(state.theme);
    if (stored[SESSION_KEY]) {
      await chrome.storage.local.remove(SESSION_KEY);
      log("Discarded the stored Adobe IMS session on startup so LoginButton sign-in stays user-driven.");
    }
    void primeLoginButtonVault().catch((error) => {
      log(`LoginButton VAULT unavailable: ${serializeError(error)}`);
    });
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
      const effectiveRedirectUri = getEffectiveAuthRedirectUri(state.runtimeConfig);
      if (effectiveRedirectUri && effectiveRedirectUri !== state.runtime.redirectUri) {
        log(
          `Using Adobe-registered redirect URI ${effectiveRedirectUri}. Interactive sign-in will use popup tab monitoring because Chrome identity is bound to ${state.runtime.redirectUri || "an unavailable redirect"}.`
        );
      }
      if (Array.isArray(state.runtimeConfig.droppedScopes) && state.runtimeConfig.droppedScopes.length > 0) {
        log(
          `ZIP.KEY scope was clamped to the supported Adobe Console scope set. Dropped scopes: ${state.runtimeConfig.droppedScopes.join(", ")}`
        );
      }
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

async function login({
  forceInteractive = false,
  forceBrowserLogout = false,
  prompt = "",
  intent = "login",
  targetOrganization = null
} = {}) {
  if (state.busy) {
    return;
  }

  setBusy(true);
  render();

  try {
    const runtimeConfig = await loadRuntimeConfig();
    const clientId = requireConfiguredClientId(runtimeConfig);
    const configuredScope = normalizeScopeList(firstNonEmptyString([runtimeConfig.scope, IMS_SCOPE]), IMS_SCOPE);
    const requestedTargetOrganization = normalizeRequestedTargetOrganization(targetOrganization);
    const effectiveForceInteractive = forceInteractive || Boolean(requestedTargetOrganization?.key);
    const effectivePrompt = firstNonEmptyString([prompt]);
    const baseInteractiveReason = intent === "org-switch" ? "interactive-org-switch" : "interactive-login";
    log(
      requestedTargetOrganization
        ? forceBrowserLogout
          ? "Starting interactive Adobe IMS sign-in after resetting the browser session so Adobe can reopen the org chooser."
          : "Starting interactive Adobe IMS sign-in for an Adobe org switch."
        : effectiveForceInteractive && forceBrowserLogout
          ? "Starting interactive Adobe IMS sign-in after resetting the browser session so Adobe can reopen the profile chooser."
          : effectiveForceInteractive
            ? "Starting forced interactive Adobe IMS sign-in."
            : "Starting Adobe IMS sign-in with PKCE."
    );
    const scopePlan = buildRequestedScopePlan(configuredScope);
    const preferredScope = scopePlan[0] || configuredScope;
    const authConfiguration = await loadAuthConfiguration();
    const redirectUri = getEffectiveAuthRedirectUri(runtimeConfig);
    if (!redirectUri) {
      throw new Error("Unable to resolve the Adobe redirect URI.");
    }
    if (shouldUseChromeIdentityRedirectTransport(redirectUri) && !chrome.identity?.launchWebAuthFlow) {
      throw new Error("Chrome identity API is unavailable. Add the identity permission and reload the extension.");
    }

    if (requestedTargetOrganization) {
      log(
        `Requested Adobe IMS org switch to "${requestedTargetOrganization.label}" (${firstNonEmptyString([requestedTargetOrganization.id, "no org id"])}). Login Button will reopen Adobe sign-in so the user can choose that org explicitly.`
      );
    }

    if (preferredScope !== configuredScope) {
      log(
        `Login Button is requesting Adobe org discovery scope "${preferredScope}" so the post-login picker can load other detected Adobe IMS orgs.`
      );
    }

    let silentlyResumed = null;
    if (!effectiveForceInteractive) {
      try {
        silentlyResumed = await attemptSessionHydration({
          authConfiguration,
          clientId,
          redirectUri,
          requestedScope: preferredScope,
          reason: preferredScope === configuredScope ? "login-click" : "login-click-org-discovery",
          interactive: false,
          prompt: "none",
          silent: true
        });
      } catch (error) {
        if (shouldRetryWithConfiguredScope(error, preferredScope, configuredScope) && preferredScope !== configuredScope) {
          log(`Adobe rejected silent scope "${preferredScope}". Retrying with configured ZIP.KEY scope "${configuredScope}".`);
          silentlyResumed = await attemptSessionHydration({
            authConfiguration,
            clientId,
            redirectUri,
            requestedScope: configuredScope,
            reason: "login-click-configured-scope",
            interactive: false,
            prompt: "none",
            silent: true
          });
        } else {
          throw error;
        }
      }
    }
    if (silentlyResumed) {
      state.session = silentlyResumed;
      await chrome.storage.local.set({ [SESSION_KEY]: silentlyResumed });
      log("Experience Cloud session was already active. Login Button refreshed the Adobe account and detected orgs without opening a full sign-in flow.");
      return;
    }

    const runInteractiveScopePlan = async ({
      reasonBase = baseInteractiveReason,
      promptOverride = effectivePrompt,
      forceBrowserLogoutForAttempt = false
    } = {}) => {
      let nextSession = null;
      let lastInteractiveError = null;
      let browserLogoutAttempted = false;

      for (const [index, requestedScope] of scopePlan.entries()) {
        try {
          if (effectiveForceInteractive && forceBrowserLogoutForAttempt && !browserLogoutAttempted) {
            browserLogoutAttempted = true;
            log(
              requestedTargetOrganization
                ? "Resetting the Adobe browser session before reopening Adobe's org chooser for the selected target org."
                : "Resetting the Adobe browser session before re-authenticating so Adobe reopens the profile chooser."
            );
            await runImsBrowserLogout({
              accessToken: firstNonEmptyString([state.session?.accessToken]),
              redirectUri,
              clientId
            });
          }

          nextSession = await attemptSessionHydration({
            authConfiguration,
            clientId,
            redirectUri,
            requestedScope,
            reason:
              index === 0
                ? requestedScope === configuredScope
                  ? reasonBase
                  : `${reasonBase}-org-discovery`
                : `${reasonBase}-configured-scope`,
            interactive: true,
            prompt: promptOverride,
            targetOrganization: requestedTargetOrganization
          });
          if (index > 0) {
            setConfigStatus(
              "Adobe rejected the org discovery scope add-on. Signed in with the configured ZIP.KEY scope instead, so org switching may be limited.",
              { ok: true }
            );
          }
          break;
        } catch (error) {
          lastInteractiveError = error;
          if (shouldRetryWithConfiguredScope(error, requestedScope, configuredScope) && index < scopePlan.length - 1) {
            log(`Adobe rejected scope "${requestedScope}". Retrying with configured ZIP.KEY scope "${configuredScope}".`);
            continue;
          }
          break;
        }
      }

      return {
        nextSession,
        lastInteractiveError
      };
    };

    let { nextSession, lastInteractiveError } = await runInteractiveScopePlan({
      reasonBase: baseInteractiveReason,
      promptOverride: effectivePrompt,
      forceBrowserLogoutForAttempt: forceBrowserLogout
    });

    if (!nextSession) {
      setConfigStatus(
        "Adobe rejected the requested Adobe IMS scope bundle. Login Button kept the original scope request and did not downgrade sign-in to a narrower profile-only consent.",
        { error: true }
      );
      throw lastInteractiveError || new Error("Adobe rejected the requested Adobe IMS scope bundle.");
    }

    let finalizedSession = attachTargetOrganizationToSession(nextSession, requestedTargetOrganization);
    const targetOrganizationVerification = verifyTargetOrganizationSelection(finalizedSession, requestedTargetOrganization);
    finalizedSession.orgVerification = targetOrganizationVerification;
    if (requestedTargetOrganization) {
      log(targetOrganizationVerification.message);
      if (!isSuccessfulTargetOrganizationVerification(targetOrganizationVerification)) {
        if (forceBrowserLogout) {
          finalizedSession = attachTargetOrganizationToSession(finalizedSession, null);
          finalizedSession.orgVerification = {
            ...targetOrganizationVerification,
            status: "accepted-returned-org",
            expectedOrgKey: "",
            message: `${targetOrganizationVerification.message} Login Button switched to the active returned Adobe org.`
          };
          setConfigStatus(finalizedSession.orgVerification.message, { ok: true });
          log(finalizedSession.orgVerification.message);
        } else {
          const verificationFailureMessage = `${targetOrganizationVerification.message} Login Button kept the prior session so it does not misrepresent the selected Adobe profile. Use Sign In Again if Adobe needs to reopen the chooser.`;
          setConfigStatus(verificationFailureMessage, { error: true });
          log(verificationFailureMessage);
          return;
        }
      }
    }

    state.session = finalizedSession;
    await chrome.storage.local.set({ [SESSION_KEY]: finalizedSession });
    void refreshSessionPostLoginContextInBackground(finalizedSession, {
      reason: firstNonEmptyString([
        requestedTargetOrganization ? "interactive-org-switch-post-login" : "interactive-login-post-login"
      ])
    });
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
    state.postLoginHydrationInFlight = false;
    state.selectedCmTenantId = "";
    state.selectedProgrammerId = "";
    state.selectedRegisteredApplicationId = "";
    state.selectedRequestorId = "";
    state.programmerApplicationsLoadingFor = "";
    state.selectedProgrammerVaultRecord = null;
    state.selectedOrganizationSwitchKey = "";
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

function buildPreferredRequestedScope(configuredScope = IMS_SCOPE) {
  const normalizedConfiguredScope = normalizeScopeList(configuredScope, IMS_SCOPE);
  if (scopeIncludes(normalizedConfiguredScope, IMS_ORG_DISCOVERY_SCOPE)) {
    return normalizedConfiguredScope;
  }

  return normalizeScopeList(`${normalizedConfiguredScope} ${IMS_ORG_DISCOVERY_SCOPE}`, normalizedConfiguredScope);
}

function buildRequestedScopePlan(configuredScope = IMS_SCOPE) {
  const normalizedConfiguredScope = normalizeScopeList(configuredScope, IMS_SCOPE);
  const preferredScope = buildPreferredRequestedScope(normalizedConfiguredScope);
  return Array.from(new Set([preferredScope, normalizedConfiguredScope]));
}

function shouldRetryWithConfiguredScope(error, attemptedScope, configuredScope) {
  const message = String(serializeError(error) || "");
  return /invalid_scope/i.test(message) && normalizeScopeList(attemptedScope, IMS_SCOPE) !== normalizeScopeList(configuredScope, IMS_SCOPE);
}

function buildImsLogoutUrl({ accessToken = "", redirectUri = "", clientId = "" } = {}) {
  const params = new URLSearchParams();
  const normalizedAccessToken = String(accessToken || "").trim();
  const normalizedRedirectUri = String(redirectUri || "").trim();
  const normalizedClientId = String(clientId || "").trim();

  if (normalizedAccessToken) {
    params.set("access_token", normalizedAccessToken);
  }
  if (normalizedRedirectUri) {
    params.set("redirect_uri", normalizedRedirectUri);
  }
  if (normalizedClientId) {
    params.set("client_id", normalizedClientId);
  }

  return `${IMS_DEFAULT_LOGOUT_ENDPOINT}?${params.toString()}`;
}

async function runImsBrowserLogout({ accessToken = "", redirectUri = "", clientId = "" } = {}) {
  const logoutUrl = buildImsLogoutUrl({
    accessToken,
    redirectUri,
    clientId
  });

  if (!redirectUri) {
    return false;
  }

  try {
    if (shouldUseChromeIdentityRedirectTransport(redirectUri)) {
      if (!chrome.identity?.launchWebAuthFlow) {
        return false;
      }
      await chrome.identity.launchWebAuthFlow({
        url: logoutUrl,
        interactive: true
      });
    } else {
      await launchInteractiveAuthPopup({
        authorizeUrl: logoutUrl,
        redirectUri,
        timeoutMs: 30000
      });
    }
    return true;
  } catch (error) {
    log(`Adobe browser logout reset failed: ${summarizeErrorHeadline(error)}`);
    return false;
  }
}

async function maybeResumeExistingAdobeSession(reason = "auto") {
  if (state.silentAuthInFlight || state.interactiveAuthInFlight || !state.runtimeConfig?.clientId) {
    return null;
  }

  const currentSession = state.session;
  if (!currentSession?.accessToken) {
    return null;
  }
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
    const redirectUri = getEffectiveAuthRedirectUri(state.runtimeConfig);
    if (!redirectUri || !shouldUseChromeIdentityRedirectTransport(redirectUri)) {
      return null;
    }

    const clientId = requireConfiguredClientId(state.runtimeConfig);
    const configuredScope = normalizeScopeList(firstNonEmptyString([state.runtimeConfig.scope, IMS_SCOPE]), IMS_SCOPE);
    const scopePlan = buildRequestedScopePlan(configuredScope);
    let silentlyResumed = null;

    for (const [index, requestedScope] of scopePlan.entries()) {
      try {
        silentlyResumed = await attemptSessionHydration({
          authConfiguration,
          clientId,
          redirectUri,
          requestedScope,
          reason: index === 0 ? reason : `${reason}-configured-scope`,
          interactive: false,
          prompt: "none",
          silent: true
        });
      } catch (error) {
        if (shouldRetryWithConfiguredScope(error, requestedScope, configuredScope) && index < scopePlan.length - 1) {
          log(`Adobe rejected the broader silent Adobe Pass scope "${requestedScope}". Retrying with configured scope "${configuredScope}".`);
          continue;
        }
        throw error;
      }

      if (silentlyResumed) {
        break;
      }
    }

    if (silentlyResumed) {
      state.session = silentlyResumed;
      await chrome.storage.local.set({ [SESSION_KEY]: silentlyResumed });
      void refreshSessionPostLoginContextInBackground(silentlyResumed, { reason });
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
  silent = false,
  extraParams = {},
  targetOrganization = null
}) {
  const authTransport = interactive && !shouldUseChromeIdentityRedirectTransport(redirectUri)
    ? "popup-monitor"
    : "chrome.identity.launchWebAuthFlow";
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
    chromeIdentityRedirectUri: getChromeIdentityRedirectUri(),
    transport: authTransport,
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
    prompt,
    extraParams
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
      if (!shouldUseChromeIdentityRedirectTransport(redirectUri)) {
        throw new Error("Silent auth requires the current Chrome identity redirect URI.");
      }
      launchDetails.abortOnLoadForNonInteractive = false;
      launchDetails.timeoutMsForNonInteractive = 10000;
    }
    if (authTransport === "popup-monitor") {
      callbackUrl = await launchInteractiveAuthPopup({
        authorizeUrl,
        redirectUri
      });
    } else {
      callbackUrl = await chrome.identity.launchWebAuthFlow(launchDetails);
    }
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
    settle(() =>
      fetchImsOrganizations({
        organizationsEndpoint: IMS_ORGS_URL,
        accessToken: tokenPayload.access_token,
        clientId
      })
    )
  ]);

  if (!profileResult.ok) {
    log(`Adobe user info fetch failed: ${serializeError(profileResult.error)}`);
  }
  if (!imsProfileResult.ok) {
    log(`Adobe IMS profile enrichment fetch failed: ${serializeError(imsProfileResult.error)}`);
  }
  if (!organizationsResult.ok) {
    log(
      scopeIncludes(firstNonEmptyString([tokenPayload?.scope, requestedScope]), IMS_ORG_DISCOVERY_SCOPE)
        ? `Adobe organizations fetch failed: ${serializeError(organizationsResult.error)}`
        : `Adobe organizations fetch was unavailable with the current scope: ${serializeError(organizationsResult.error)}`
    );
  }

  const resolvedProfile = mergeProfilePayloads([
    profileResult.ok ? profileResult.value : null,
    imsProfileResult.ok ? imsProfileResult.value : null
  ]);
  if (resolvedProfile && pickAvatarUrl(resolvedProfile)) {
    log("Resolved Adobe avatar from merged IMS profile payloads.");
  }

  const sessionRecord = attachTargetOrganizationToSession(
    buildSessionRecord({
      authConfiguration,
      clientId,
      redirectUri,
      requestState,
      requestedScope,
      authTransport: authContext.transport,
      tokenPayload,
      profile: resolvedProfile,
      organizations: organizationsResult.ok ? organizationsResult.value : null
    }),
    targetOrganization
  );

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
  const normalizedOrganizations = mergeDetectedOrganizationCandidates({
    existingOrganizations: collectOrganizationCandidates({
      profile,
      accessClaims: accessTokenClaims,
      idClaims: idTokenClaims,
      organizations: flattenOrganizations(organizations)
    }),
    additionalOrganizations: getConfiguredOrganizationCandidates()
  });
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
    detectedOrganizations: normalizedOrganizations,
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

function hasActiveSession(session = state.session) {
  return Boolean(session?.accessToken) && !isExpired(session?.expiresAtMs || session?.expiresAt);
}

function hasHydratedPostLoginContext(session = state.session) {
  return Boolean(session?.console?.hydratedAt) && Boolean(session?.unifiedShell?.hydratedAt);
}

async function refreshSessionPostLoginContextInBackground(session, { reason = "post-login" } = {}) {
  const currentSession = session && typeof session === "object" ? { ...session } : null;
  if (!currentSession?.accessToken) {
    return currentSession;
  }

  const requestId = ++backgroundHydrationRequestId;
  state.postLoginHydrationInFlight = true;
  render();

  try {
    const hydratedSession = await hydratePostLoginSessionData(currentSession, { reason });
    if (requestId !== backgroundHydrationRequestId) {
      return hydratedSession;
    }

    const activeAccessToken = firstNonEmptyString([state.session?.accessToken]);
    const hydratedAccessToken = firstNonEmptyString([hydratedSession?.accessToken]);
    if (activeAccessToken && hydratedAccessToken && activeAccessToken !== hydratedAccessToken) {
      return hydratedSession;
    }

    state.session = hydratedSession;
    await chrome.storage.local.set({ [SESSION_KEY]: hydratedSession });
    render();
    void autoActivateAdobePassProgrammerContext(hydratedSession, { reason }).catch((error) => {
      log(`Adobe Pass programmer auto-activation skipped: ${serializeError(error)}`);
    });
    return hydratedSession;
  } catch (error) {
    log(`Background Adobe post-login hydration failed (${reason}): ${serializeError(error)}`);
    return currentSession;
  } finally {
    if (requestId === backgroundHydrationRequestId) {
      state.postLoginHydrationInFlight = false;
      render();
    }
  }
}

async function hydratePostLoginSessionData(session, { reason = "post-login" } = {}) {
  const currentSession = session && typeof session === "object" ? { ...session } : null;
  if (!currentSession?.accessToken) {
    return currentSession;
  }

  const [nextConsoleContext, nextCmContext, nextUnifiedShellContext] = await Promise.all([
    buildConsoleContext(currentSession, reason),
    buildCmContext(currentSession, reason),
    buildUnifiedShellContext(currentSession, reason)
  ]);
  const configuredOrganizations = getConfiguredOrganizationCandidates();
  const mergedDetectedOrganizations = mergeDetectedOrganizationCandidates({
    existingOrganizations: currentSession?.detectedOrganizations,
    additionalOrganizations: [
      ...configuredOrganizations,
      ...(Array.isArray(nextUnifiedShellContext?.organizations) ? nextUnifiedShellContext.organizations : [])
    ],
    activeOrganizationHint: buildOrganizationContextFromSession(currentSession).activeOrganization
  });
  void persistEnvironmentVaultGlobalsFromSession({
    session: currentSession,
    consoleContext: nextConsoleContext,
    cmContext: nextCmContext
  }).catch((error) => {
    log(`LoginButton VAULT CM globals write failed: ${serializeError(error)}`);
  });

  return {
    ...currentSession,
    console: nextConsoleContext,
    cm: nextCmContext,
    unifiedShell: nextUnifiedShellContext,
    detectedOrganizations: mergedDetectedOrganizations
  };
}

function buildEnvironmentVaultGlobalsInput({ session = null, consoleContext = null, cmContext = null } = {}) {
  const normalizedConsoleContext = consoleContext && typeof consoleContext === "object" ? consoleContext : {};
  const normalizedCmContext = cmContext && typeof cmContext === "object" ? cmContext : {};
  const environmentId = firstNonEmptyString([
    normalizedConsoleContext.environmentId,
    state.runtimeConfig?.consoleEnvironment,
    CONSOLE_DEFAULT_ENVIRONMENT
  ]);
  if (!environmentId) {
    return null;
  }

  const environmentLabel = firstNonEmptyString([
    normalizedConsoleContext.environmentLabel,
    getConsoleEnvironmentMeta(environmentId).label
  ]);
  const tenants = Array.isArray(normalizedCmContext.tenants) ? normalizedCmContext.tenants : [];

  return {
    environmentId,
    environmentLabel,
    cmGlobal: {
      status: firstNonEmptyString([normalizedCmContext.status]),
      cmuTokenHeaderName: firstNonEmptyString([normalizedCmContext.cmuTokenHeaderName]),
      cmuTokenClientId: firstNonEmptyString([normalizedCmContext.cmuTokenClientId]),
      cmuTokenScope: firstNonEmptyString([normalizedCmContext.cmuTokenScope]),
      cmuTokenUserId: firstNonEmptyString([
        normalizedCmContext.cmuTokenUserId,
        session?.imsSession?.userId
      ]),
      cmuTokenSource: firstNonEmptyString([normalizedCmContext.cmuTokenSource]),
      cmuTokenExpiresAt: firstNonEmptyString([normalizedCmContext.cmuTokenExpiresAt]),
      tokenPresent: Boolean(normalizedCmContext.cmuTokenHeaderValue)
    },
    cmTenants: {
      fetchedAt: firstNonEmptyString([normalizedCmContext.hydratedAt]),
      tenantCount: tenants.length,
      tenants: tenants.map((tenant) => ({
        key: firstNonEmptyString([tenant?.key, tenant?.id]),
        id: firstNonEmptyString([tenant?.id, tenant?.key]),
        name: firstNonEmptyString([tenant?.name]),
        label: firstNonEmptyString([tenant?.label, tenant?.name, tenant?.id])
      }))
    }
  };
}

async function persistEnvironmentVaultGlobalsFromSession({ session = null, consoleContext = null, cmContext = null } = {}) {
  const input = buildEnvironmentVaultGlobalsInput({
    session,
    consoleContext,
    cmContext
  });
  if (!input) {
    return null;
  }

  return writeEnvironmentVaultGlobals(input);
}

async function buildConsoleContext(session, reason = "post-login") {
  const previousConsole = session?.console && typeof session.console === "object" ? session.console : {};
  const environmentId = firstNonEmptyString([
    state.runtimeConfig?.consoleEnvironment,
    previousConsole.environmentId,
    CONSOLE_DEFAULT_ENVIRONMENT
  ]);
  const environmentMeta = getConsoleEnvironmentMeta(environmentId);
  const baseUrl = resolveConsoleBaseUrl({
    consoleEnvironment: environmentMeta.id,
    consoleBaseUrl: firstNonEmptyString([state.runtimeConfig?.consoleBaseUrl, previousConsole.baseUrl])
  });
  const accessToken = firstNonEmptyString([session?.accessToken]);
  const hydratedAt = new Date().toISOString();
  const programmerAccess = resolveProgrammerAccessContext(session);

  if (!accessToken) {
    return {
      ...previousConsole,
      environmentId: environmentMeta.id,
      environmentLabel: environmentMeta.label,
      baseUrl,
      transport: "",
      pageContextOrigin: "",
      pageContextUrl: "",
      hydratedAt,
      status: "unavailable",
      channels: [],
      errors: {
        accessToken: "Adobe IMS access token is unavailable."
      }
    };
  }

  if (!programmerAccess.eligible) {
    log(`Adobe Pass programmer hydration skipped: ${programmerAccess.reason}`);
    return {
      ...previousConsole,
      environmentId: environmentMeta.id,
      environmentLabel: environmentMeta.label,
      expectedImsEnvironment: environmentMeta.imsEnvironment,
      baseUrl,
      transport: "",
      pageContextOrigin: "",
      pageContextUrl: "",
      configurationVersion: "",
      extendedProfile: null,
      roles: [],
      channels: [],
      programmers: [],
      hydratedAt,
      status: "org-selection-required",
      programmerAccess,
      errors: {
        extendedProfile: "",
        configurationVersion: "",
        channels: "",
        programmers: ""
      }
    };
  }

  log(`Hydrating Adobe Pass console context from ${baseUrl} (${reason}).`);

  let csrfToken = "NO-TOKEN";
  let transport = "";
  let pageContextOrigin = "";
  let pageContextUrl = "";
  const consolePageContextRef = {
    target: null
  };
  const syncConsoleFetchMeta = (result = null) => {
    if (!result || typeof result !== "object") {
      return;
    }

    transport = firstNonEmptyString([result.transport, transport]);
    csrfToken = firstNonEmptyString([result.csrfToken, csrfToken]);
    pageContextOrigin = firstNonEmptyString([result.pageContext?.origin, pageContextOrigin]);
    pageContextUrl = firstNonEmptyString([result.pageContext?.url, pageContextUrl]);
  };
  const extendedProfileResult = await settle(() =>
    fetchConsoleJsonWithFallback({
      baseUrl,
      path: CONSOLE_USER_EXTENDED_PROFILE_PATH,
      accessToken,
      csrfToken,
      environmentId: environmentMeta.id,
      pageContextTargetRef: consolePageContextRef
    })
  );
  if (extendedProfileResult.ok) {
    syncConsoleFetchMeta(extendedProfileResult.value);
  }

  const configurationVersionResult = await settle(() =>
    fetchConsoleJsonWithFallback({
      baseUrl,
      path: CONSOLE_LATEST_CONFIGURATION_VERSION_PATH,
      accessToken,
      csrfToken,
      environmentId: environmentMeta.id,
      pageContextTargetRef: consolePageContextRef
    })
  );
  if (configurationVersionResult.ok) {
    syncConsoleFetchMeta(configurationVersionResult.value);
  }

  const configurationVersion = normalizeConsoleConfigurationVersion(
    configurationVersionResult.ok ? configurationVersionResult.value?.data : ""
  );
  const configurationQueryParams = configurationVersion
    ? {
        configurationVersion
      }
    : null;
  const defaultConfigurationError =
    configurationVersionResult.ok
      ? new Error("Console did not return an activated configuration version.")
      : configurationVersionResult.error;
  const [channelsResult, programmersResult] = configurationQueryParams
    ? await Promise.all([
        settle(() =>
          fetchConsoleJsonWithFallback({
            baseUrl,
            path: CONSOLE_CHANNELS_PATH,
            accessToken,
            csrfToken,
            queryParams: configurationQueryParams,
            environmentId: environmentMeta.id,
            pageContextTargetRef: consolePageContextRef
          })
        ),
        settle(() =>
          fetchConsoleJsonWithFallback({
            baseUrl,
            path: CONSOLE_PROGRAMMERS_PATH,
            accessToken,
            csrfToken,
            queryParams: configurationQueryParams,
            environmentId: environmentMeta.id,
            pageContextTargetRef: consolePageContextRef
          })
        )
      ])
    : [
        {
          ok: false,
          error: defaultConfigurationError
        },
        {
          ok: false,
          error: defaultConfigurationError
        }
      ];

  if (!extendedProfileResult.ok) {
    log(`Adobe Pass extended profile fetch failed: ${serializeError(extendedProfileResult.error)}`);
  }
  if (!configurationVersion) {
    log(
      `Adobe Pass configuration version fetch failed: ${
        configurationVersionResult.ok
          ? "Console did not return an activated configuration version."
          : serializeError(configurationVersionResult.error)
      }`
    );
  }
  if (!channelsResult.ok) {
    log(`Adobe Pass channels fetch failed: ${serializeError(channelsResult.error)}`);
  }
  if (!programmersResult.ok) {
    log(`Adobe Pass programmers fetch failed: ${serializeError(programmersResult.error)}`);
  }
  if (channelsResult.ok) {
    syncConsoleFetchMeta(channelsResult.value);
  }
  if (programmersResult.ok) {
    syncConsoleFetchMeta(programmersResult.value);
  }

  const extendedProfile =
    extendedProfileResult.ok && extendedProfileResult.value?.data && typeof extendedProfileResult.value.data === "object"
      ? extendedProfileResult.value.data
      : null;
  const roles = extractConsoleAuthorities(extendedProfile);
  const channels = channelsResult.ok ? normalizeConsoleChannels(channelsResult.value?.data) : [];
  const programmers = programmersResult.ok ? normalizeConsoleProgrammers(programmersResult.value?.data) : [];
  const errors = {
    extendedProfile: extendedProfileResult.ok ? "" : serializeError(extendedProfileResult.error),
    configurationVersion:
      configurationVersionResult.ok && configurationVersion
        ? ""
        : configurationVersionResult.ok
          ? "Console did not return an activated configuration version."
          : serializeError(configurationVersionResult.error),
    channels: channelsResult.ok ? "" : serializeError(channelsResult.error),
    programmers: programmersResult.ok ? "" : serializeError(programmersResult.error)
  };
  const successfulSegments = [
    extendedProfile ? 1 : 0,
    configurationVersion ? 1 : 0,
    channelsResult.ok ? 1 : 0,
    programmersResult.ok ? 1 : 0
  ].reduce(
    (total, value) => total + value,
    0
  );

  const nextConsoleContext = {
    ...previousConsole,
    environmentId: environmentMeta.id,
    environmentLabel: environmentMeta.label,
    expectedImsEnvironment: environmentMeta.imsEnvironment,
    baseUrl,
    csrfToken,
    transport,
    pageContextOrigin,
    pageContextUrl,
    configurationVersion,
    extendedProfile,
    roles,
    channels,
    programmers,
    hydratedAt,
    programmerAccess,
    status: successfulSegments === 4 ? "ready" : successfulSegments > 0 ? "limited" : "unavailable",
    errors
  };

  await closeTemporaryAdobePageContextTarget(consolePageContextRef.target?.temporaryTarget);
  return nextConsoleContext;
}

async function buildCmContext(session, reason = "post-login") {
  const previousCm = session?.cm && typeof session.cm === "object" ? session.cm : {};
  const accessToken = firstNonEmptyString([session?.accessToken]);
  const hydratedAt = new Date().toISOString();
  const programmerAccess = resolveProgrammerAccessContext(session);

  if (!accessToken) {
    return {
      ...previousCm,
      baseUrl: CM_BASE_URL,
      reportsBaseUrl: CM_REPORTS_BASE_URL,
      checkTokenEndpoint: CM_CONSOLE_IMS_CHECK_TOKEN_ENDPOINT,
      validateTokenEndpoint: CM_CONSOLE_IMS_VALIDATE_TOKEN_ENDPOINT,
      tenantAuthModel: "loginbutton-ims",
      cmuAuthModel: "cm-console-ui",
      cmuToken: "",
      cmuTokenSource: "",
      cmuTokenClientId: "",
      cmuTokenScope: "",
      cmuTokenUserId: "",
      cmuTokenExpiresAt: "",
      cmuTokenHeaderName: CMU_TOKEN_HEADER_NAME,
      cmuTokenHeaderValue: "",
      reportsStatus: "unavailable",
      tenants: [],
      hydratedAt,
      status: "unavailable",
      errors: {
        cmuToken: "Adobe IMS access token is unavailable.",
        tenants: "Adobe IMS access token is unavailable.",
        reports: "Adobe IMS access token is unavailable."
      }
    };
  }

  if (!programmerAccess.eligible) {
    return {
      ...previousCm,
      baseUrl: CM_BASE_URL,
      reportsBaseUrl: CM_REPORTS_BASE_URL,
      checkTokenEndpoint: CM_CONSOLE_IMS_CHECK_TOKEN_ENDPOINT,
      validateTokenEndpoint: CM_CONSOLE_IMS_VALIDATE_TOKEN_ENDPOINT,
      tenantAuthModel: "loginbutton-ims",
      cmuAuthModel: "cm-console-ui",
      cmuToken: "",
      cmuTokenSource: "",
      cmuTokenClientId: "",
      cmuTokenScope: "",
      cmuTokenUserId: "",
      cmuTokenExpiresAt: "",
      cmuTokenHeaderName: CMU_TOKEN_HEADER_NAME,
      cmuTokenHeaderValue: "",
      reportsStatus: "org-selection-required",
      tenants: [],
      hydratedAt,
      status: "org-selection-required",
      errors: {
        cmuToken: "",
        tenants: "",
        reports: ""
      }
    };
  }

  log(
    `Hydrating CM tenant + CMU context from ${CM_BASE_URL}, ${CM_CONSOLE_IMS_CHECK_TOKEN_ENDPOINT}, and ${CM_REPORTS_BASE_URL} (${reason}).`
  );
  const cmuTokenResult = await settle(() =>
    resolveQualifiedCmConsoleAccessToken(session, previousCm?.cmuToken)
  );

  if (!cmuTokenResult.ok) {
    log(`CMU token fetch failed: ${serializeError(cmuTokenResult.error)}`);
  }

  const cmuToken = cmuTokenResult.ok ? normalizeBearerTokenValue(cmuTokenResult.value?.token) : "";
  const cmuTokenSource = cmuTokenResult.ok ? firstNonEmptyString([cmuTokenResult.value?.source]) : "";
  const cmuTokenError =
    cmuTokenResult.ok
      ? cmuToken
        ? ""
        : "CMU token bootstrap returned an empty token."
      : serializeError(cmuTokenResult.error);
  if (cmuTokenResult.ok && !cmuToken) {
    log("CMU token fetch completed but returned an empty token payload.");
  }
  const cmuTokenClaims = cmuToken ? decodeJwtPayload(cmuToken) : null;
  const cmuTokenClientId = firstNonEmptyString([cmuTokenClaims?.client_id, CM_CONSOLE_IMS_CLIENT_ID]);
  const cmuTokenScope = firstNonEmptyString([cmuTokenClaims?.scope, CM_CONSOLE_IMS_SCOPE]);
  const cmuTokenUserId = firstNonEmptyString([
    cmuTokenClaims?.user_id,
    session?.imsSession?.userId,
    session?.accessTokenClaims?.user_id,
    session?.accessTokenClaims?.sub
  ]);
  const cmuTokenIssuedAt = coerceClaimTime(firstNonEmptyString([cmuTokenClaims?.created_at, cmuTokenClaims?.iat]));
  const cmuTokenExpiresInMs = Number(firstNonEmptyString([cmuTokenClaims?.expires_in, "0"]));
  const cmuTokenExpiresAt =
    Number.isFinite(cmuTokenIssuedAt) && cmuTokenIssuedAt > 0 && Number.isFinite(cmuTokenExpiresInMs) && cmuTokenExpiresInMs > 0
      ? new Date(cmuTokenIssuedAt + cmuTokenExpiresInMs).toISOString()
      : "";
  const cmuTokenHeaderValue = buildCmuAuthorizationHeaderValue(cmuToken);

  const tenantsResult = await settle(() =>
    fetchPrimetimeJson({
      baseUrl: CM_BASE_URL,
      path: CM_TENANTS_PATH,
      accessToken,
      queryParams: {
        orgId: CM_TENANTS_OWNER_ORG_ID
      }
    })
  );

  if (!tenantsResult.ok) {
    log(`CM tenants fetch failed: ${serializeError(tenantsResult.error)}`);
  }

  const reportsResult = cmuToken
    ? await settle(() =>
        fetchCmuReportJson({
          baseUrl: CM_REPORTS_BASE_URL,
          path: CM_REPORTS_SUMMARY_PATH,
          accessToken: cmuToken,
          queryParams: {
            format: "json"
          }
        })
      )
    : {
        ok: false,
        error: new Error("CMU token is unavailable.")
      };

  if (cmuToken && !reportsResult.ok) {
    log(`CMU reports bootstrap failed: ${serializeError(reportsResult.error)}`);
  }

  const successfulSegments = [cmuTokenHeaderValue ? 1 : 0, tenantsResult.ok ? 1 : 0, reportsResult.ok ? 1 : 0].reduce(
    (total, value) => total + value,
    0
  );

  return {
    ...previousCm,
    baseUrl: CM_BASE_URL,
    reportsBaseUrl: CM_REPORTS_BASE_URL,
    checkTokenEndpoint: CM_CONSOLE_IMS_CHECK_TOKEN_ENDPOINT,
    validateTokenEndpoint: CM_CONSOLE_IMS_VALIDATE_TOKEN_ENDPOINT,
    tenantAuthModel: "loginbutton-ims",
    cmuAuthModel: "cm-console-ui",
    cmuToken,
    cmuTokenSource,
    cmuTokenClientId,
    cmuTokenScope,
    cmuTokenUserId,
    cmuTokenExpiresAt,
    cmuTokenHeaderName: CMU_TOKEN_HEADER_NAME,
    cmuTokenHeaderValue,
    reportsStatus: reportsResult.ok ? "ready" : cmuToken ? "unavailable" : "pending",
    tenants: tenantsResult.ok ? normalizeCmTenants(tenantsResult.value) : [],
    hydratedAt,
    status: successfulSegments === 3 ? "ready" : successfulSegments > 0 ? "limited" : "unavailable",
    errors: {
      cmuToken: cmuTokenError,
      tenants: tenantsResult.ok ? "" : serializeError(tenantsResult.error),
      reports: reportsResult.ok ? "" : serializeError(reportsResult.error)
    }
  };
}

async function fetchProgrammerRegisteredApplications(session, programmerId) {
  const currentSession = session && typeof session === "object" ? session : null;
  const consoleContext = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const accessToken = firstNonEmptyString([currentSession?.accessToken]);
  const baseUrl = firstNonEmptyString([consoleContext?.baseUrl]);
  const configurationVersion = firstNonEmptyString([consoleContext?.configurationVersion]);
  const normalizedProgrammerId = String(programmerId || "").trim();
  const environmentId = firstNonEmptyString([
    consoleContext?.environmentId,
    state.runtimeConfig?.consoleEnvironment,
    CONSOLE_DEFAULT_ENVIRONMENT
  ]);
  const csrfToken = firstNonEmptyString([consoleContext?.csrfToken, "NO-TOKEN"]);

  if (!accessToken || !baseUrl || !configurationVersion || !normalizedProgrammerId) {
    throw new Error("Registered Applications request is missing console context.");
  }

  const consolePageContextRef = {
    target: null
  };

  try {
    const result = await fetchConsoleJsonWithFallback({
      baseUrl,
      path: CONSOLE_APPLICATIONS_PATH,
      accessToken,
      csrfToken,
      queryParams: {
        configurationVersion,
        programmer: normalizedProgrammerId
      },
      environmentId,
      pageContextTargetRef: consolePageContextRef
    });

    return {
      applications: normalizeConsoleRegisteredApplications(result?.data),
      csrfToken: firstNonEmptyString([result?.csrfToken, csrfToken]),
      pageContext: result?.pageContext || null,
      transport: firstNonEmptyString([result?.transport])
    };
  } finally {
    await closeTemporaryAdobePageContextTarget(consolePageContextRef.target?.temporaryTarget);
  }
}

async function ensureSelectedProgrammerApplicationsLoaded(programmerId = "") {
  const normalizedProgrammerId = String(programmerId || "").trim();
  const currentSession = state.session && typeof state.session === "object" ? state.session : null;
  const consoleContext = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const applicationsByProgrammer =
    consoleContext?.applicationsByProgrammer && typeof consoleContext.applicationsByProgrammer === "object"
      ? consoleContext.applicationsByProgrammer
    : {};
  const existingApplications = Array.isArray(applicationsByProgrammer?.[normalizedProgrammerId])
    ? applicationsByProgrammer[normalizedProgrammerId]
    : null;
  const vaultLookupContext = buildProgrammerVaultLookupContext(currentSession, normalizedProgrammerId);
  let hydratedFromVault = false;

  if (!normalizedProgrammerId || !currentSession?.accessToken) {
    return;
  }
  if (state.programmerApplicationsLoadingFor === normalizedProgrammerId) {
    return;
  }
  if (existingApplications) {
    render();
    return;
  }

  if (vaultLookupContext) {
    const vaultReadResult = await settle(() => readProgrammerVaultRecord(vaultLookupContext));
    if (!vaultReadResult.ok) {
      log(`LoginButton VAULT read failed for ${normalizedProgrammerId}: ${serializeError(vaultReadResult.error)}`);
    } else if (vaultReadResult.value) {
      const vaultAssessment = assessProgrammerVaultRecord(vaultReadResult.value, vaultLookupContext);
      if (vaultAssessment.reusable) {
        hydratedFromVault = hydrateSelectedProgrammerFromVaultRecord(vaultReadResult.value, normalizedProgrammerId, {
          restoreSelections: true
        });
        log(
          `LoginButton VAULT ${vaultAssessment.stale ? "stale hit" : "hit"} for ${normalizedProgrammerId} (${vaultAssessment.reason}).`
        );
        if (!vaultAssessment.needsRefresh) {
          render();
          return;
        }
      } else {
        log(`LoginButton VAULT record for ${normalizedProgrammerId} requires refresh (${vaultAssessment.reason}).`);
      }
    } else {
      log(`LoginButton VAULT miss for ${normalizedProgrammerId}.`);
    }
  }

  if (!hydratedFromVault) {
    state.programmerApplicationsLoadingFor = normalizedProgrammerId;
    render();
  }

  const result = await settle(() => fetchProgrammerRegisteredApplications(currentSession, normalizedProgrammerId));

  const liveSession = state.session && typeof state.session === "object" ? state.session : null;

  state.programmerApplicationsLoadingFor = "";

  if (!liveSession) {
    render();
    return;
  }

  if (!result.ok) {
    log(`Adobe Pass registered applications fetch failed: ${serializeError(result.error)}`);
    state.session = mergeProgrammerApplicationsErrorIntoSession(liveSession, normalizedProgrammerId, result.error, {
      preserveExistingApplications: hydratedFromVault
    });
    render();
    return;
  }

  const mergedSession = mergeProgrammerApplicationsIntoSession(liveSession, normalizedProgrammerId, result.value);
  void persistProgrammerVaultSnapshot(mergedSession, normalizedProgrammerId, {
    source: "network"
  }).catch((error) => {
    log(`LoginButton VAULT write failed for ${normalizedProgrammerId}: ${serializeError(error)}`);
  });
  state.session = mergedSession;
  autoSelectSingletonAuthenticatedOptions(mergedSession);

  if (state.selectedProgrammerId !== normalizedProgrammerId) {
    render();
    return;
  }

  render();
}

function autoSelectSingletonAuthenticatedOptions(session = state.session) {
  const authenticatedDataContext = buildAuthenticatedUserDataContext(session);
  if (authenticatedDataContext?.programmerAccess?.eligible !== true) {
    return false;
  }

  let changed = false;
  if (!String(state.selectedCmTenantId || "").trim() && authenticatedDataContext.cmTenantOptions.length === 1) {
    state.selectedCmTenantId = firstNonEmptyString([
      authenticatedDataContext.cmTenantOptions[0]?.key,
      authenticatedDataContext.cmTenantOptions[0]?.id
    ]);
    changed = true;
  }

  if (
    authenticatedDataContext?.selectedProgrammer &&
    !String(state.selectedRegisteredApplicationId || "").trim() &&
    authenticatedDataContext.registeredApplicationOptions.length === 1
  ) {
    state.selectedRegisteredApplicationId = firstNonEmptyString([
      authenticatedDataContext.registeredApplicationOptions[0]?.key,
      authenticatedDataContext.registeredApplicationOptions[0]?.id
    ]);
    changed = true;
  }

  if (
    authenticatedDataContext?.selectedProgrammer &&
    !String(state.selectedRequestorId || "").trim() &&
    authenticatedDataContext.requestorOptions.length === 1
  ) {
    state.selectedRequestorId = firstNonEmptyString([
      authenticatedDataContext.requestorOptions[0]?.key,
      authenticatedDataContext.requestorOptions[0]?.id
    ]);
    changed = true;
  }

  if (!changed) {
    return false;
  }

  render();
  if (authenticatedDataContext?.selectedProgrammer) {
    void persistSelectedProgrammerVaultSelections();
  }
  return true;
}

async function autoActivateAdobePassProgrammerContext(session = state.session, { reason = "post-login" } = {}) {
  const currentSession = session && typeof session === "object" ? session : null;
  if (!currentSession?.accessToken) {
    return false;
  }

  const authenticatedDataContext = buildAuthenticatedUserDataContext(currentSession);
  if (authenticatedDataContext?.programmerAccess?.eligible !== true) {
    return false;
  }

  autoSelectSingletonAuthenticatedOptions(currentSession);
  const programmerOptions = Array.isArray(authenticatedDataContext.programmerOptions)
    ? authenticatedDataContext.programmerOptions
    : [];
  if (programmerOptions.length === 0) {
    return false;
  }

  let selectedProgrammer = authenticatedDataContext.selectedProgrammer || null;
  if (!selectedProgrammer) {
    if (programmerOptions.length !== 1) {
      return false;
    }

    selectedProgrammer = programmerOptions[0];
    state.selectedProgrammerId = firstNonEmptyString([selectedProgrammer?.key, selectedProgrammer?.id]);
    state.selectedRegisteredApplicationId = "";
    state.selectedRequestorId = "";
    state.selectedProgrammerVaultRecord = null;
    log(
      `Auto-selected ${firstNonEmptyString([selectedProgrammer?.label, selectedProgrammer?.name, "the only programmer"])} after Adobe Pass org activation (${reason}).`
    );
    render();
  }

  const selectedProgrammerId = firstNonEmptyString([selectedProgrammer?.key, selectedProgrammer?.id]);
  if (!selectedProgrammerId) {
    return false;
  }

  await ensureSelectedProgrammerApplicationsLoaded(selectedProgrammerId);
  autoSelectSingletonAuthenticatedOptions();
  return true;
}

function resolveProgrammerAccessContext(session) {
  const organizationContext = buildOrganizationContextFromSession(session);
  const activeOrganization = organizationContext.activeOrganization;
  const requiredOrganization = findAdobePassOrganizationCandidate([
    activeOrganization,
    ...(Array.isArray(organizationContext?.options) ? organizationContext.options : []),
    ...(Array.isArray(session?.unifiedShell?.organizations) ? session.unifiedShell.organizations : [])
  ]);
  const activeIsAdobePass = isAdobePassOrganization(activeOrganization);
  const requiredLabel = firstNonEmptyString([
    requiredOrganization?.label,
    requiredOrganization?.name,
    ADOBE_PASS_DISPLAY_NAME
  ]);

  if (activeIsAdobePass) {
    return {
      eligible: true,
      activeIsAdobePass: true,
      activeOrganization,
      requiredOrganization,
      requiredOrgKey: firstNonEmptyString([requiredOrganization?.key, `org:${ADOBE_PASS_TENANT_ID}`]),
      requiredOrgId: firstNonEmptyString([requiredOrganization?.id, ADOBE_PASS_TENANT_ID]),
      requiredLabel,
      reason: ""
    };
  }

  if (requiredOrganization) {
    return {
      eligible: false,
      activeIsAdobePass: false,
      activeOrganization,
      requiredOrganization,
      requiredOrgKey: firstNonEmptyString([requiredOrganization.key, `org:${ADOBE_PASS_TENANT_ID}`]),
      requiredOrgId: firstNonEmptyString([requiredOrganization.id, ADOBE_PASS_TENANT_ID]),
      requiredLabel,
      reason: `Switch Adobe Org to ${requiredLabel} to load the Adobe Pass Programmer list.`
    };
  }

  return {
    eligible: false,
    activeIsAdobePass: false,
    activeOrganization,
    requiredOrganization: null,
    requiredOrgKey: `org:${ADOBE_PASS_TENANT_ID}`,
    requiredOrgId: ADOBE_PASS_TENANT_ID,
    requiredLabel: ADOBE_PASS_DISPLAY_NAME,
    reason: "Adobe Pass org was not detected in the current Adobe session, so the Programmer list stays hidden."
  };
}

function findAdobePassOrganizationCandidate(organizations = []) {
  return (Array.isArray(organizations) ? organizations : []).find((organization) => isAdobePassOrganization(organization)) || null;
}

function isAdobePassOrganization(organization) {
  if (!organization || typeof organization !== "object") {
    return false;
  }

  const values = [
    organization.key,
    organization.id,
    organization.tenantId,
    organization.imsOrgId,
    organization.name,
    organization.label
  ]
    .map((value) => normalizeOrganizationIdentifier(value))
    .filter(Boolean);

  return values.some((value) =>
    value === ADOBE_PASS_TENANT_ID ||
    value === `org:${ADOBE_PASS_TENANT_ID}` ||
    value === normalizeOrganizationIdentifier(ADOBE_PASS_DISPLAY_NAME) ||
    value === normalizeOrganizationIdentifier(ADOBE_PASS_IMS_ORG_ID)
  );
}

async function buildUnifiedShellContext(session, reason = "post-login") {
  const previousUnifiedShell = session?.unifiedShell && typeof session.unifiedShell === "object" ? session.unifiedShell : {};
  const accessToken = firstNonEmptyString([session?.accessToken]);
  const hydratedAt = new Date().toISOString();
  const activeOrganization = buildOrganizationContextFromSession(session).activeOrganization;
  const selectedOrg = resolveUnifiedShellSelectedOrg(session, activeOrganization);

  if (!accessToken) {
    return {
      ...previousUnifiedShell,
      hydratedAt,
      selectedOrg,
      status: "unavailable",
      organizations: [],
      clusterCount: 0,
      userProfile: null,
      errors: {
        init: "Adobe IMS access token is unavailable."
      }
    };
  }

  log(`Hydrating Unified Shell org context from ${UNIFIED_SHELL_GRAPHQL_URL} (${reason}).`);
  const initResult = await settle(() =>
    fetchUnifiedShellInit({
      accessToken,
      selectedOrg
    })
  );

  if (!initResult.ok) {
    log(`Unified Shell org hydration failed: ${serializeError(initResult.error)}`);
    return {
      ...previousUnifiedShell,
      hydratedAt,
      selectedOrg,
      status: "unavailable",
      organizations: [],
      clusterCount: 0,
      userProfile: null,
      errors: {
        init: serializeError(initResult.error)
      }
    };
  }

  const payload = initResult.value?.data && typeof initResult.value.data === "object" ? initResult.value.data : {};
  const clusterData = normalizeUnifiedShellClusterData(payload?.imsExtendedAccountClusterData);
  const organizations = normalizeUnifiedShellOrganizations({
    clusters: clusterData,
    activeOrganization,
    selectedOrg
  });
  const userProfile = payload?.userProfileJson && typeof payload.userProfileJson === "object" ? payload.userProfileJson : null;
  const clusterMeta =
    payload?.imsExtendedAccountClusterData && typeof payload.imsExtendedAccountClusterData === "object"
      ? payload.imsExtendedAccountClusterData
      : {};

  return {
    ...previousUnifiedShell,
    hydratedAt,
    selectedOrg,
    status: organizations.length > 0 || userProfile ? "ready" : "limited",
    clusterCount: clusterData.length,
    next: firstNonEmptyString([clusterMeta.next]),
    timestamp: firstNonEmptyString([clusterMeta.timestamp]),
    preferredLanguages: Array.isArray(clusterMeta.preferredLanguages) ? clusterMeta.preferredLanguages.filter(Boolean) : [],
    organizations,
    userProfile,
    errors: {
      init: ""
    }
  };
}

function buildApiRequestId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function buildConsoleRequestHeaders(accessToken = "", csrfToken = "NO-TOKEN") {
  const bearerToken = String(accessToken || "").trim();
  return {
    Accept: "application/json, text/plain, */*",
    Authorization: `bearer ${bearerToken}`,
    "X-CSRF-Token": firstNonEmptyString([csrfToken, "NO-TOKEN"]),
    "AP-Request-Id": buildApiRequestId()
  };
}

function buildPrimetimeRequestHeaders(accessToken = "") {
  const bearerToken = String(accessToken || "").trim();
  return {
    Accept: "*/*",
    Authorization: `Bearer ${bearerToken}`
  };
}

function buildCmuReportRequestHeaders(accessToken = "") {
  const bearerToken = normalizeBearerTokenValue(accessToken);
  return {
    Accept: "*/*",
    ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {})
  };
}

function normalizeBearerTokenValue(value) {
  return String(value || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function isProbablyJwt(value = "") {
  const token = normalizeBearerTokenValue(value);
  return token.split(".").length === 3;
}

function isTokenFreshEnough(value = "", skewMs = 0) {
  const token = normalizeBearerTokenValue(value);
  if (!isProbablyJwt(token)) {
    return false;
  }

  const claims = decodeJwtPayload(token) || {};
  const expSeconds = Number(claims?.exp || 0);
  if (!Number.isFinite(expSeconds) || expSeconds <= 0) {
    return true;
  }
  return expSeconds * 1000 > Date.now() + Math.max(0, Number(skewMs || 0));
}

function tokenSupportsCmConsoleRequests(value = "") {
  const token = normalizeBearerTokenValue(value);
  if (!isProbablyJwt(token)) {
    return false;
  }

  const claims = decodeJwtPayload(token) || {};
  const clientId = String(firstNonEmptyString([claims?.client_id, claims?.clientId]) || "")
    .trim()
    .toLowerCase();
  return clientId === CM_CONSOLE_IMS_CLIENT_ID;
}

function dedupeCandidateStrings(values = []) {
  const output = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push(normalized);
  });
  return output;
}

function collectCmConsoleUserIdCandidates(session = null, seedToken = "") {
  const currentSession = session && typeof session === "object" ? session : {};
  const profile = currentSession?.profile && typeof currentSession.profile === "object" ? currentSession.profile : {};
  const imsSession = currentSession?.imsSession && typeof currentSession.imsSession === "object" ? currentSession.imsSession : {};
  const accessTokenClaims = currentSession?.accessTokenClaims && typeof currentSession.accessTokenClaims === "object"
    ? currentSession.accessTokenClaims
    : {};
  const idTokenClaims = currentSession?.idTokenClaims && typeof currentSession.idTokenClaims === "object"
    ? currentSession.idTokenClaims
    : {};
  const seedClaims = decodeJwtPayload(seedToken) || {};

  return dedupeCandidateStrings([
    imsSession?.userId,
    accessTokenClaims?.user_id,
    accessTokenClaims?.userId,
    accessTokenClaims?.sub,
    idTokenClaims?.user_id,
    idTokenClaims?.userId,
    idTokenClaims?.sub,
    profile?.userId,
    profile?.user_id,
    profile?.sub,
    profile?.id,
    profile?.additional_info?.userId,
    profile?.additional_info?.user_id,
    imsSession?.authId,
    profile?.authId,
    profile?.aa_id,
    profile?.adobeID,
    profile?.additional_info?.authId,
    profile?.additional_info?.aa_id,
    profile?.email,
    profile?.user_email,
    profile?.emailAddress,
    profile?.additional_info?.email,
    seedClaims?.user_id,
    seedClaims?.userId,
    seedClaims?.sub,
    seedClaims?.aa_id,
    seedClaims?.authId
  ]);
}

function extractJwtLikeTokenFromText(value = "") {
  const rawText = String(value || "").trim();
  if (!rawText) {
    return "";
  }

  const matches = rawText.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g);
  if (!Array.isArray(matches)) {
    return "";
  }

  for (const candidate of matches) {
    if (isProbablyJwt(candidate)) {
      return candidate;
    }
  }
  return "";
}

function extractImsAccessTokenFromPayload(payload, rawText = "") {
  const normalizedRawText = String(rawText || "").trim();
  if (!payload && !normalizedRawText) {
    return "";
  }

  if (typeof payload === "string") {
    const directToken = normalizeBearerTokenValue(payload);
    if (isProbablyJwt(directToken)) {
      return directToken;
    }
  }

  if (payload && typeof payload === "object") {
    const nestedToken =
      payload.token && typeof payload.token === "object"
        ? firstNonEmptyString([
            payload.token.access_token,
            payload.token.accessToken,
            payload.token.token,
            payload.token.value
          ])
        : payload.token;
    const structuredToken = normalizeBearerTokenValue(
      firstNonEmptyString([
        payload.access_token,
        payload.accessToken,
        nestedToken,
        payload.tenantDataToken,
        payload.tenant_data_token,
        payload.imsToken,
        payload.authToken,
        payload.authorization,
        payload.Authorization,
        payload.bearer,
        payload.value
      ])
    );
    if (isProbablyJwt(structuredToken)) {
      return structuredToken;
    }
  }

  return extractJwtLikeTokenFromText(typeof payload === "string" ? payload : normalizedRawText);
}

function normalizeCmuAccessToken(value, rawText = "") {
  return extractImsAccessTokenFromPayload(value, rawText);
}

function buildCmuAuthorizationHeaderValue(token = "") {
  const normalizedToken = normalizeBearerTokenValue(token);
  return normalizedToken ? `${CMU_TOKEN_HEADER_SCHEME} ${normalizedToken}` : "";
}

function buildImsCheckTokenUrl({ endpoint, clientId, scope, userId }) {
  const normalizedEndpoint = String(endpoint || "").trim();
  const normalizedClientId = String(clientId || "").trim();
  const normalizedScope = String(scope || "").trim();
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedEndpoint || !normalizedClientId || !normalizedScope || !normalizedUserId) {
    throw new Error("IMS check token request is missing required context.");
  }

  const url = new URL(normalizedEndpoint);
  url.searchParams.set("client_id", normalizedClientId);
  url.searchParams.set("scope", normalizedScope);
  url.searchParams.set("user_id", normalizedUserId);
  return url;
}

function sleep(ms = 0) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(ms || 0)));
  });
}

function buildApiRequestUrl(baseUrl = "", path = "", queryParams = {}) {
  const normalizedBaseUrl = String(baseUrl || "").trim();
  const normalizedPath = String(path || "").trim();
  if (!normalizedBaseUrl || !normalizedPath) {
    throw new Error("API request URL is missing required context.");
  }

  const base = normalizedBaseUrl.endsWith("/") ? normalizedBaseUrl : `${normalizedBaseUrl}/`;
  const relativePath = normalizedPath.replace(/^\/+/, "");
  const url = new URL(relativePath, base);
  Object.entries(queryParams || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url;
}

function isExperienceAdobeTabUrl(value = "") {
  const normalizedUrl = String(value || "").trim().toLowerCase();
  const normalizedOrigin = String(CM_CONSOLE_APP_ORIGIN || "").trim().toLowerCase().replace(/\/+$/, "");
  if (!normalizedUrl || !normalizedOrigin) {
    return false;
  }
  return normalizedUrl === normalizedOrigin || normalizedUrl.startsWith(`${normalizedOrigin}/`);
}

function buildAdobePassConsoleBootstrapUrl(environmentId = CONSOLE_DEFAULT_ENVIRONMENT, page = "programmers") {
  const normalizedEnvironmentId = String(environmentId || "").trim() || CONSOLE_DEFAULT_ENVIRONMENT;
  const normalizedPage = String(page || "").trim() || "programmers";
  return `${ADOBE_PASS_CONSOLE_APP_ORIGIN}/solutions/${ADOBE_PASS_CONSOLE_APP_SLUG}/${normalizedEnvironmentId}/${normalizedPage}`;
}

function isAdobePassConsoleAppUrl(value = "") {
  const normalizedUrl = String(value || "").trim().toLowerCase();
  return normalizedUrl.includes(`/solutions/${ADOBE_PASS_CONSOLE_APP_SLUG.toLowerCase()}/`);
}

async function getTabByIdSafe(tabId) {
  const normalizedTabId = Number(tabId || 0);
  if (!chrome.tabs?.get || normalizedTabId <= 0) {
    return null;
  }

  try {
    return await chrome.tabs.get(normalizedTabId);
  } catch {
    return null;
  }
}

async function waitForTabCompletion(tabId, timeoutMs = ADOBE_PAGE_CONTEXT_TIMEOUT_MS) {
  const normalizedTabId = Number(tabId || 0);
  if (normalizedTabId <= 0) {
    return null;
  }

  const deadline = Date.now() + Math.max(1000, Number(timeoutMs || 0));
  let lastTab = await getTabByIdSafe(normalizedTabId);
  while (lastTab && Date.now() < deadline) {
    if (String(lastTab?.status || "").trim().toLowerCase() === "complete") {
      return lastTab;
    }
    await sleep(150);
    lastTab = await getTabByIdSafe(normalizedTabId);
  }
  return lastTab;
}

async function findExistingExperienceAdobeTab() {
  if (!chrome.tabs?.query) {
    return null;
  }

  try {
    const tabs = await chrome.tabs.query({
      url: [`${CM_CONSOLE_APP_ORIGIN}/*`]
    });
    const normalizedTabs = Array.isArray(tabs) ? tabs : [];
    const scored = normalizedTabs
      .filter((tab) => Number(tab?.id || 0) > 0)
      .map((tab) => {
        const url = String(tab?.url || tab?.pendingUrl || "").trim().toLowerCase();
        let score = Number(tab?.lastAccessed || 0);
        if (tab?.active === true) {
          score += 5000;
        }
        if (url.includes("/#/@adobepass/cm-console/")) {
          score += 2400;
        }
        if (url.includes("/#/@adobepass/")) {
          score += 1800;
        }
        if (isExperienceAdobeTabUrl(url)) {
          score += 1200;
        }
        return {
          tab,
          score
        };
      })
      .sort((left, right) => right.score - left.score);
    return scored[0]?.tab || null;
  } catch {
    return null;
  }
}

async function openTemporaryAdobePageContextTarget(targetUrl = CM_CONSOLE_BOOTSTRAP_URL) {
  const normalizedUrl = String(targetUrl || "").trim();
  if (!normalizedUrl) {
    return null;
  }

  let temporaryTarget = null;
  if (chrome.tabs?.create) {
    try {
      const createdTab = await chrome.tabs.create({
        url: normalizedUrl,
        active: false
      });
      const tabId = Number(createdTab?.id || 0);
      if (tabId > 0) {
        temporaryTarget = {
          tab: createdTab,
          tabId,
          windowId: Number(createdTab?.windowId || 0),
          ownsWindow: false
        };
      }
    } catch {
      temporaryTarget = null;
    }
  }

  if (!temporaryTarget && chrome.windows?.create) {
    try {
      const createdWindow = await chrome.windows.create({
        url: normalizedUrl,
        type: "popup",
        focused: false,
        width: 480,
        height: 640
      });
      const tab =
        Array.isArray(createdWindow?.tabs) && createdWindow.tabs.length > 0
          ? createdWindow.tabs.find((candidate) => Number(candidate?.id || 0) > 0) || null
          : null;
      const tabId = Number(tab?.id || 0);
      const windowId = Number(createdWindow?.id || 0);
      if (tabId > 0 && windowId > 0) {
        temporaryTarget = {
          tab,
          tabId,
          windowId,
          ownsWindow: true
        };
      }
    } catch {
      temporaryTarget = null;
    }
  }

  if (!temporaryTarget?.tabId) {
    return null;
  }

  const resolvedTab = await waitForTabCompletion(temporaryTarget.tabId, ADOBE_PAGE_CONTEXT_TIMEOUT_MS).catch(() => null);
  return {
    ...temporaryTarget,
    tab: resolvedTab || temporaryTarget.tab
  };
}

async function closeTemporaryAdobePageContextTarget(target = null) {
  const tabId = Number(target?.tabId || target?.tab?.id || 0);
  const windowId = Number(target?.windowId || target?.tab?.windowId || 0);
  const ownsWindow = target?.ownsWindow === true;

  if (ownsWindow && windowId > 0 && chrome.windows?.remove) {
    try {
      await chrome.windows.remove(windowId);
      return;
    } catch {
      // Fall through to tab cleanup if the temporary window is already gone.
    }
  }

  if (tabId > 0 && chrome.tabs?.remove) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Ignore cleanup failures for temporary Adobe page-context tabs.
    }
  }
}

async function resolveExperienceAdobePageContextTarget({ preferredTabId = 0, allowTemporaryTab = true } = {}) {
  let tab = await getTabByIdSafe(preferredTabId);
  const preferredUrl = String(tab?.url || tab?.pendingUrl || "").trim();
  if (!isExperienceAdobeTabUrl(preferredUrl)) {
    tab = await findExistingExperienceAdobeTab();
  }

  let temporaryTarget = null;
  if (!tab?.id && allowTemporaryTab) {
    temporaryTarget = await openTemporaryAdobePageContextTarget(CM_CONSOLE_BOOTSTRAP_URL);
    tab = temporaryTarget?.tab || null;
  }

  return {
    tab: tab || null,
    tabId: Number(tab?.id || 0),
    temporaryTarget
  };
}

function isAdobeConsoleTabUrl(value = "") {
  return isAdobePassConsoleAppUrl(value);
}

async function findExistingAdobeConsoleTab() {
  if (!chrome.tabs?.query) {
    return null;
  }

  try {
    const tabs = await chrome.tabs.query({
      url: [`${ADOBE_PASS_CONSOLE_APP_ORIGIN}/*`]
    });
    const normalizedTabs = Array.isArray(tabs) ? tabs : [];
    const scored = normalizedTabs
      .filter((tab) => Number(tab?.id || 0) > 0)
      .map((tab) => ({
        tab,
        url: String(tab?.url || tab?.pendingUrl || "").trim().toLowerCase()
      }))
      .filter(({ url }) => isAdobePassConsoleAppUrl(url))
      .map(({ tab, url }) => {
        let score = Number(tab?.lastAccessed || 0);
        if (tab?.active === true) {
          score += 5000;
        }
        if (isAdobePassConsoleAppUrl(url)) {
          score += 2600;
        }
        if (url.includes("/programmers")) {
          score += 1800;
        }
        return {
          tab,
          score
        };
      })
      .sort((left, right) => right.score - left.score);
    return scored[0]?.tab || null;
  } catch {
    return null;
  }
}

async function resolveAdobeConsolePageContextTarget({
  preferredTabId = 0,
  allowTemporaryTab = true,
  environmentId = CONSOLE_DEFAULT_ENVIRONMENT
} = {}) {
  let tab = await getTabByIdSafe(preferredTabId);
  const preferredUrl = String(tab?.url || tab?.pendingUrl || "").trim();
  if (!isAdobePassConsoleAppUrl(preferredUrl)) {
    tab = await findExistingAdobeConsoleTab();
  }

  let temporaryTarget = null;
  if (!tab?.id && allowTemporaryTab) {
    temporaryTarget = await openTemporaryAdobePageContextTarget(buildAdobePassConsoleBootstrapUrl(environmentId, "programmers"));
    tab = temporaryTarget?.tab || null;
  }

  return {
    tab: tab || null,
    tabId: Number(tab?.id || 0),
    temporaryTarget
  };
}

async function executeFetchViaAdobePageContextTarget({
  tabId,
  requestUrl,
  method = "GET",
  headers = {},
  bodyText = "",
  timeoutMs = ADOBE_PAGE_CONTEXT_TIMEOUT_MS,
  requiredFrameOrigins = [],
  requiredFrameUrlIncludes = []
}) {
  if (!chrome.scripting?.executeScript) {
    throw new Error("Chrome page-context scripting is unavailable. Add the scripting permission and reload the extension.");
  }

  const normalizedTabId = Number(tabId || 0);
  if (normalizedTabId <= 0) {
    throw new Error("Adobe page-context fetch is missing a usable tab target.");
  }

  const normalizedRequestUrl = String(requestUrl || "").trim();
  if (!normalizedRequestUrl) {
    throw new Error("Adobe page-context fetch is missing a request URL.");
  }

  const normalizedMethod = String(method || "GET").trim().toUpperCase();
  const normalizedHeaders = Object.entries(headers || {}).reduce((result, [key, value]) => {
    const normalizedKey = String(key || "").trim();
    const normalizedValue = String(value || "").trim();
    if (normalizedKey && normalizedValue) {
      result[normalizedKey] = normalizedValue;
    }
    return result;
  }, {});
  const normalizedOrigins = (Array.isArray(requiredFrameOrigins) ? requiredFrameOrigins : [])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const normalizedUrlIncludes = (Array.isArray(requiredFrameUrlIncludes) ? requiredFrameUrlIncludes : [])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const deadline = Date.now() + Math.max(2500, Number(timeoutMs || 0) || ADOBE_PAGE_CONTEXT_TIMEOUT_MS);
  let lastFrameSummary = [];
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await waitForTabCompletion(normalizedTabId, Math.min(1200, Math.max(200, deadline - Date.now()))).catch(() => null);
      const executionResults = await chrome.scripting.executeScript({
        target: { tabId: normalizedTabId, allFrames: true },
        world: "MAIN",
        args: [
          {
            requestUrl: normalizedRequestUrl,
            method: normalizedMethod,
            headers: normalizedHeaders,
            bodyText: String(bodyText || ""),
            timeoutMs: Math.max(1500, deadline - Date.now()),
            requiredFrameOrigins: normalizedOrigins,
            requiredFrameUrlIncludes: normalizedUrlIncludes
          }
        ],
        func: async (config) => {
          const normalize = (value) => String(value || "").trim();
          const parseJson = (text) => {
            try {
              return JSON.parse(String(text || ""));
            } catch {
              return null;
            }
          };
          const frameUrl = normalize(globalThis.location?.href);
          const frameOrigin = normalize(globalThis.location?.origin).toLowerCase();
          const documentReadyState = normalize(globalThis.document?.readyState);
          const requiredOrigins = (Array.isArray(config?.requiredFrameOrigins) ? config.requiredFrameOrigins : [])
            .map((value) => normalize(value).toLowerCase())
            .filter(Boolean);
          const requiredUrlIncludes = (Array.isArray(config?.requiredFrameUrlIncludes) ? config.requiredFrameUrlIncludes : [])
            .map((value) => normalize(value).toLowerCase())
            .filter(Boolean);
          const matchesOrigin = requiredOrigins.length === 0 || requiredOrigins.includes(frameOrigin);
          const frameUrlLower = frameUrl.toLowerCase();
          const matchesUrl =
            requiredUrlIncludes.length === 0 || requiredUrlIncludes.some((fragment) => frameUrlLower.includes(fragment));

          if (!matchesOrigin || !matchesUrl) {
            return {
              skipped: true,
              frameUrl,
              frameOrigin,
              documentReadyState
            };
          }

          const controller = new AbortController();
          const timerId = window.setTimeout(
            () => controller.abort(),
            Math.max(1200, Number(config?.timeoutMs || 0) || 5000)
          );

          try {
            const response = await fetch(normalize(config?.requestUrl), {
              method: normalize(config?.method || "GET") || "GET",
              credentials: "include",
              headers: config?.headers && typeof config.headers === "object" ? config.headers : {},
              ...(normalize(config?.method || "GET").toUpperCase() === "GET"
                ? {}
                : { body: String(config?.bodyText || "") }),
              signal: controller.signal
            });
            const text = await response.text().catch(() => "");
            const responseHeaders = {};
            response.headers.forEach((value, key) => {
              const normalizedKey = normalize(key).toLowerCase();
              if (normalizedKey) {
                responseHeaders[normalizedKey] = normalize(value);
              }
            });
            return {
              skipped: false,
              ok: Boolean(response.ok),
              status: Number(response.status || 0),
              statusText: normalize(response.statusText),
              url: normalize(response.url || config?.requestUrl),
              text,
              parsed: parseJson(text),
              responseHeaders,
              frameUrl,
              frameOrigin,
              documentReadyState
            };
          } catch (error) {
            return {
              skipped: false,
              ok: false,
              status: 0,
              statusText: error instanceof Error ? error.message : String(error),
              url: normalize(config?.requestUrl),
              text: "",
              parsed: null,
              responseHeaders: {},
              frameUrl,
              frameOrigin,
              documentReadyState
            };
          } finally {
            window.clearTimeout(timerId);
          }
        }
      });

      const results = (Array.isArray(executionResults) ? executionResults : [])
        .map((entry) => (entry?.result && typeof entry.result === "object" ? entry.result : null))
        .filter(Boolean);
      const matchingResults = results.filter((result) => result?.skipped !== true);

      if (matchingResults.length === 0) {
        lastFrameSummary = results.map((result) => ({
          frameOrigin: firstNonEmptyString([result?.frameOrigin, "unknown-origin"]),
          frameUrl: firstNonEmptyString([result?.frameUrl, "unknown-url"])
        }));
        await sleep(150);
        continue;
      }

      const scoreResult = (result) => {
        const frameOrigin = String(result?.frameOrigin || "").trim().toLowerCase();
        const originIndex = normalizedOrigins.indexOf(frameOrigin);
        return originIndex >= 0 ? normalizedOrigins.length - originIndex : 0;
      };
      matchingResults.sort((left, right) => scoreResult(right) - scoreResult(left));
      const selectedResult = matchingResults[0];

      if (!selectedResult?.ok) {
        const message = extractConsoleErrorMessage(selectedResult?.parsed, selectedResult?.text);
        throw new Error(
          `${new URL(normalizedRequestUrl).pathname} returned ${Number(selectedResult?.status || 0)}${
            message ? `: ${message}` : ""
          } via Adobe page context ${firstNonEmptyString([selectedResult?.frameOrigin, "unknown-origin"])}.`
        );
      }

      return {
        data: selectedResult.parsed ?? (selectedResult.text ? String(selectedResult.text).trim() : null),
        rawText: String(selectedResult.text || ""),
        headers: selectedResult.responseHeaders && typeof selectedResult.responseHeaders === "object" ? selectedResult.responseHeaders : {},
        pageContext: {
          url: firstNonEmptyString([selectedResult.frameUrl]),
          origin: firstNonEmptyString([selectedResult.frameOrigin]),
          readyState: firstNonEmptyString([selectedResult.documentReadyState])
        }
      };
    } catch (error) {
      lastError = error;
      break;
    }
  }

  if (lastError) {
    throw lastError;
  }

  const observedFrames = lastFrameSummary
    .map((frame) => {
      const origin = firstNonEmptyString([frame?.frameOrigin, "unknown-origin"]);
      const url = firstNonEmptyString([frame?.frameUrl, "unknown-url"]);
      return `${origin} | ${url}`;
    })
    .filter(Boolean)
    .join(", ");
  throw new Error(
    observedFrames
      ? `Adobe page context did not expose the Adobe Pass console frame. Observed: ${observedFrames}`
      : "Adobe page context did not expose the Adobe Pass console frame."
  );
}

async function fetchConsoleJsonViaAdobePageContext({
  baseUrl,
  path,
  accessToken,
  csrfToken = "NO-TOKEN",
  queryParams = {},
  method = "GET",
  headers = {},
  body = "",
  tabId,
  requiredFrameUrlIncludes = []
}) {
  const normalizedBaseUrl = String(baseUrl || "").trim();
  const normalizedPath = String(path || "").trim();
  const bearerToken = String(accessToken || "").trim();
  const normalizedMethod = String(method || "GET").trim().toUpperCase() || "GET";
  if (!normalizedBaseUrl || !normalizedPath || !bearerToken) {
    throw new Error("Console request is missing required context.");
  }

  const url = buildApiRequestUrl(normalizedBaseUrl, normalizedPath, queryParams);

  const result = await executeFetchViaAdobePageContextTarget({
    tabId,
    requestUrl: url.toString(),
    method: normalizedMethod,
    headers: {
      ...buildConsoleRequestHeaders(bearerToken, csrfToken),
      ...(headers && typeof headers === "object" ? headers : {})
    },
    bodyText: normalizedMethod === "GET" ? "" : String(body || ""),
    requiredFrameOrigins: CONSOLE_PAGE_CONTEXT_ALLOWED_ORIGINS,
    requiredFrameUrlIncludes
  });

  return {
    data: result.data,
    rawText: result.rawText,
    csrfToken: firstNonEmptyString([result.headers?.["x-csrf-token"], csrfToken]),
    pageContext: result.pageContext
  };
}

function buildConsoleFallbackError(directError, fallbackError) {
  const directMessage = serializeError(directError);
  const fallbackMessage = serializeError(fallbackError);
  if (directMessage && fallbackMessage) {
    return new Error(`Direct IMS console request failed: ${directMessage}. Existing Adobe page-context fallback failed: ${fallbackMessage}`);
  }
  return fallbackError || directError || new Error("Adobe Pass console request failed.");
}

async function fetchConsoleJsonWithFallback({
  baseUrl,
  path,
  accessToken,
  csrfToken = "NO-TOKEN",
  queryParams = {},
  method = "GET",
  headers = {},
  body = "",
  environmentId = CONSOLE_DEFAULT_ENVIRONMENT,
  pageContextTargetRef = null
}) {
  const directResult = await settle(() =>
    fetchConsoleJson({
      baseUrl,
      path,
      accessToken,
      csrfToken,
      queryParams,
      method,
      headers,
      body
    })
  );
  if (directResult.ok) {
    return {
      ...directResult.value,
      transport: "ims-bearer:direct",
      pageContext: null
    };
  }

  let consolePageContextTarget =
    pageContextTargetRef && typeof pageContextTargetRef === "object" ? pageContextTargetRef.target : null;
  if (Number(consolePageContextTarget?.tabId || 0) <= 0) {
    consolePageContextTarget = await resolveAdobeConsolePageContextTarget({
      allowTemporaryTab: false,
      environmentId
    });
    if (pageContextTargetRef && typeof pageContextTargetRef === "object") {
      pageContextTargetRef.target = consolePageContextTarget;
    }
  }

  const consoleTabId = Number(consolePageContextTarget?.tabId || 0);
  let pageContextError =
    consoleTabId > 0
      ? null
      : new Error("No existing Adobe Pass console page context is available for fallback.");
  if (consoleTabId > 0) {
    const pageContextResult = await settle(() =>
      fetchConsoleJsonViaAdobePageContext({
        baseUrl,
        path,
        accessToken,
        csrfToken,
        queryParams,
        method,
        headers,
        body,
        tabId: consoleTabId,
        requiredFrameUrlIncludes: [`/solutions/${ADOBE_PASS_CONSOLE_APP_SLUG}/`]
      })
    );
    if (pageContextResult.ok) {
      return {
        ...pageContextResult.value,
        transport: "ims-bearer:page-context"
      };
    }
    pageContextError = pageContextResult.error;
  }

  throw buildConsoleFallbackError(directResult.error, pageContextError);
}

async function fetchImsCheckTokenViaAdobePageContext({
  endpoint,
  clientId,
  scope,
  userId,
  preferredTabId = 0,
  allowTemporaryTab = true,
  timeoutMs = ADOBE_PAGE_CONTEXT_TIMEOUT_MS
}) {
  if (!chrome.scripting?.executeScript) {
    throw new Error("Chrome page-context scripting is unavailable. Add the scripting permission and reload the extension.");
  }

  const requestUrl = buildImsCheckTokenUrl({
    endpoint,
    clientId,
    scope,
    userId
  }).toString();
  const target = await resolveExperienceAdobePageContextTarget({
    preferredTabId,
    allowTemporaryTab
  });
  const temporaryTarget = target?.temporaryTarget || null;
  const tabId = Number(target?.tabId || 0);
  if (tabId <= 0) {
    throw new Error("Unable to open an Adobe Experience Cloud page context for the CMU token bootstrap.");
  }

  try {
    await waitForTabCompletion(tabId, timeoutMs).catch(() => null);
    const executionResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [
        {
          requestUrl,
          timeoutMs
        }
      ],
      func: async (config) => {
        const normalize = (value) => String(value || "").trim();
        const parseJson = (text) => {
          try {
            return JSON.parse(String(text || ""));
          } catch {
            return null;
          }
        };

        const controller = new AbortController();
        const timerId = window.setTimeout(
          () => controller.abort(),
          Math.max(2000, Number(config?.timeoutMs || 0) || 12000)
        );
        try {
          const response = await fetch(String(config?.requestUrl || ""), {
            method: "POST",
            credentials: "include",
            headers: {
              Accept: "*/*"
            },
            signal: controller.signal
          });
          const text = await response.text().catch(() => "");
          return {
            ok: Boolean(response.ok),
            status: Number(response.status || 0),
            statusText: normalize(response.statusText),
            url: normalize(response.url || config?.requestUrl),
            text,
            parsed: parseJson(text),
            frameUrl: normalize(globalThis.location?.href),
            frameOrigin: normalize(globalThis.location?.origin),
            documentReadyState: normalize(globalThis.document?.readyState)
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            statusText: error instanceof Error ? error.message : String(error),
            url: normalize(config?.requestUrl),
            text: "",
            parsed: null,
            frameUrl: normalize(globalThis.location?.href),
            frameOrigin: normalize(globalThis.location?.origin),
            documentReadyState: normalize(globalThis.document?.readyState)
          };
        } finally {
          window.clearTimeout(timerId);
        }
      }
    });

    const result = executionResults?.[0]?.result;
    if (!result || typeof result !== "object") {
      throw new Error("Adobe page context did not return a usable IMS check response.");
    }

    if (!result.ok) {
      const message = extractConsoleErrorMessage(result.parsed, result.text);
      throw new Error(
        `${new URL(requestUrl).pathname} returned ${Number(result.status || 0)}${
          message ? `: ${message}` : ""
        } via Adobe page context ${firstNonEmptyString([result.frameOrigin, "unknown-origin"])}.`
      );
    }

    return {
      data: result.parsed ?? (result.text ? String(result.text).trim() : null),
      rawText: String(result.text || ""),
      pageContext: {
        url: firstNonEmptyString([result.frameUrl]),
        origin: firstNonEmptyString([result.frameOrigin]),
        readyState: firstNonEmptyString([result.documentReadyState])
      }
    };
  } finally {
    await closeTemporaryAdobePageContextTarget(temporaryTarget);
  }
}

async function fetchImsValidateToken({ endpoint, clientId, token, credentials = "include" }) {
  const normalizedEndpoint = String(endpoint || "").trim();
  const normalizedClientId = String(clientId || "").trim();
  const normalizedToken = normalizeBearerTokenValue(token);
  if (!normalizedEndpoint || !normalizedClientId || !normalizedToken) {
    throw new Error("IMS validate token request is missing required context.");
  }

  const body = new URLSearchParams({
    type: "access_token",
    token: normalizedToken
  });
  body.set("client_id", normalizedClientId);

  let response;
  try {
    response = await fetch(normalizedEndpoint, {
      method: "POST",
      mode: "cors",
      credentials,
      referrer: CM_CONSOLE_APP_REFERER,
      referrerPolicy: "strict-origin-when-cross-origin",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        client_id: normalizedClientId
      },
      body: body.toString()
    });
  } catch (error) {
    throw new Error(`Unable to reach ${new URL(normalizedEndpoint).pathname}: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = parseJsonText(text, null);
  if (!response.ok) {
    const message = extractConsoleErrorMessage(parsed, text);
    throw new Error(`${new URL(normalizedEndpoint).pathname} returned ${response.status}${message ? `: ${message}` : ""}`);
  }

  return {
    data: parsed ?? (text ? text.trim() : null),
    rawText: text
  };
}

async function fetchImsCheckToken({ endpoint, clientId, scope, userId, credentials = "include", seedToken = "" }) {
  const url = buildImsCheckTokenUrl({
    endpoint,
    clientId,
    scope,
    userId
  });
  const normalizedClientId = String(clientId || "").trim();
  const normalizedSeedToken = normalizeBearerTokenValue(seedToken);
  const requestHeaders = {
    Accept: "*/*",
    ...(normalizedSeedToken
      ? {
          Authorization: `Bearer ${normalizedSeedToken}`,
          "X-IMS-ClientId": normalizedClientId,
          "x-api-key": normalizedClientId
        }
      : {})
  };

  let response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      mode: "cors",
      credentials,
      referrer: CM_CONSOLE_APP_REFERER,
      referrerPolicy: "strict-origin-when-cross-origin",
      headers: requestHeaders
    });
  } catch (error) {
    throw new Error(`Unable to reach ${url.pathname}: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = parseJsonText(text, null);
  if (!response.ok) {
    const message = extractConsoleErrorMessage(parsed, text);
    throw new Error(`${url.pathname} returned ${response.status}${message ? `: ${message}` : ""}`);
  }

  return {
    data: parsed ?? (text ? text.trim() : null),
    rawText: text
  };
}

async function resolveQualifiedCmConsoleAccessToken(session = null, previousToken = "") {
  const currentSession = session && typeof session === "object" ? session : {};
  const existingTokenCandidates = dedupeCandidateStrings([
    previousToken,
    currentSession?.cm?.cmuToken,
    currentSession?.accessToken
  ]);

  for (const candidate of existingTokenCandidates) {
    if (tokenSupportsCmConsoleRequests(candidate) && isTokenFreshEnough(candidate, CM_TOKEN_REFRESH_SKEW_MS)) {
      return {
        token: normalizeBearerTokenValue(candidate),
        source: candidate === currentSession?.accessToken ? "existing:session" : "existing:cached"
      };
    }
  }

  const seedTokens = dedupeCandidateStrings([
    currentSession?.accessToken,
    previousToken
  ]).filter((value) => isProbablyJwt(value));
  const userIdCandidates = collectCmConsoleUserIdCandidates(currentSession);
  let lastError = null;

  for (const userId of userIdCandidates) {
    const pageContextResult = await settle(() =>
      fetchImsCheckTokenViaAdobePageContext({
        endpoint: CM_CONSOLE_IMS_CHECK_TOKEN_ENDPOINT,
        clientId: CM_CONSOLE_IMS_CLIENT_ID,
        scope: CM_CONSOLE_IMS_SCOPE,
        userId,
        allowTemporaryTab: true
      })
    );
    if (pageContextResult.ok) {
      const nextToken = normalizeCmuAccessToken(pageContextResult.value?.data, pageContextResult.value?.rawText);
      if (tokenSupportsCmConsoleRequests(nextToken) && isTokenFreshEnough(nextToken, CM_TOKEN_REFRESH_SKEW_MS)) {
        return {
          token: nextToken,
          source: "page-context:ims-check"
        };
      }
      if (nextToken) {
        const claims = decodeJwtPayload(nextToken) || {};
        lastError = new Error(
          `Adobe page context minted an unsupported Adobe IMS token client_id=${firstNonEmptyString([
            claims?.client_id,
            claims?.clientId,
            "unknown"
          ])}.`
        );
      } else {
        lastError = new Error("Adobe page context IMS check response did not include a cm-console-ui access token.");
      }
    } else {
      lastError = pageContextResult.error;
    }

    const attempts = [
      {
        credentials: "include",
        seedToken: ""
      },
      {
        credentials: "omit",
        seedToken: ""
      },
      ...seedTokens.map((seedToken) => ({
        credentials: "omit",
        seedToken
      }))
    ];

    for (const attempt of attempts) {
      const result = await settle(() =>
        fetchImsCheckToken({
          endpoint: CM_CONSOLE_IMS_CHECK_TOKEN_ENDPOINT,
          clientId: CM_CONSOLE_IMS_CLIENT_ID,
          scope: CM_CONSOLE_IMS_SCOPE,
          userId,
          credentials: attempt.credentials,
          seedToken: attempt.seedToken
        })
      );
      if (!result.ok) {
        lastError = result.error;
        continue;
      }

      const nextToken = normalizeCmuAccessToken(result.value?.data, result.value?.rawText);
      if (tokenSupportsCmConsoleRequests(nextToken) && isTokenFreshEnough(nextToken, CM_TOKEN_REFRESH_SKEW_MS)) {
        return {
          token: nextToken,
          source: `ims-check:${attempt.credentials}${attempt.seedToken ? ":seed" : ""}`
        };
      }
      if (nextToken) {
        const claims = decodeJwtPayload(nextToken) || {};
        lastError = new Error(
          `IMS check minted an unsupported Adobe IMS token client_id=${firstNonEmptyString([claims?.client_id, claims?.clientId, "unknown"])}.`
        );
      } else {
        lastError = new Error("IMS check token response did not include a cm-console-ui access token.");
      }
    }
  }

  for (const seedToken of seedTokens) {
    for (const credentials of ["include", "omit"]) {
      const result = await settle(() =>
        fetchImsValidateToken({
          endpoint: CM_CONSOLE_IMS_VALIDATE_TOKEN_ENDPOINT,
          clientId: CM_CONSOLE_IMS_CLIENT_ID,
          token: seedToken,
          credentials
        })
      );
      if (!result.ok) {
        lastError = result.error;
        continue;
      }

      const nextToken = normalizeCmuAccessToken(result.value?.data, result.value?.rawText);
      if (tokenSupportsCmConsoleRequests(nextToken) && isTokenFreshEnough(nextToken, CM_TOKEN_REFRESH_SKEW_MS)) {
        return {
          token: nextToken,
          source: `validate:${credentials}`
        };
      }
      if (nextToken) {
        const claims = decodeJwtPayload(nextToken) || {};
        lastError = new Error(
          `IMS validate token minted an unsupported Adobe IMS token client_id=${firstNonEmptyString([claims?.client_id, claims?.clientId, "unknown"])}.`
        );
      } else {
        lastError = new Error("IMS validate token response did not include a cm-console-ui access token.");
      }
    }
  }

  throw lastError || new Error("Login Button could not auto-hydrate a cm-console-ui bearer from the current Adobe IMS session.");
}

async function fetchConsoleJson({
  baseUrl,
  path,
  accessToken,
  csrfToken = "NO-TOKEN",
  queryParams = {},
  method = "GET",
  headers = {},
  body = ""
}) {
  const normalizedBaseUrl = String(baseUrl || "").trim();
  const normalizedPath = String(path || "").trim();
  const bearerToken = String(accessToken || "").trim();
  const normalizedMethod = String(method || "GET").trim().toUpperCase() || "GET";
  if (!normalizedBaseUrl || !normalizedPath || !bearerToken) {
    throw new Error("Console request is missing required context.");
  }

  const url = buildApiRequestUrl(normalizedBaseUrl, normalizedPath, queryParams);

  let response;
  try {
    response = await fetch(url.toString(), {
      method: normalizedMethod,
      mode: "cors",
      credentials: "include",
      headers: {
        ...buildConsoleRequestHeaders(bearerToken, csrfToken),
        ...(headers && typeof headers === "object" ? headers : {})
      },
      ...(normalizedMethod === "GET" ? {} : { body: String(body || "") })
    });
  } catch (error) {
    throw new Error(`Unable to reach ${url.pathname}: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = parseJsonText(text, null);
  if (!response.ok) {
    const message = extractConsoleErrorMessage(parsed, text);
    throw new Error(`${url.pathname} returned ${response.status}${message ? `: ${message}` : ""}`);
  }

  return {
    data: parsed ?? (text ? text.trim() : null),
    rawText: text,
    csrfToken: firstNonEmptyString([response.headers.get("x-csrf-token"), csrfToken])
  };
}

async function fetchPrimetimeJson({ baseUrl, path, accessToken, queryParams = {} }) {
  const normalizedBaseUrl = String(baseUrl || "").trim();
  const normalizedPath = String(path || "").trim();
  const bearerToken = String(accessToken || "").trim();
  if (!normalizedBaseUrl || !normalizedPath || !bearerToken) {
    throw new Error("CM request is missing required context.");
  }

  const url = new URL(normalizedPath, `${normalizedBaseUrl.replace(/\/+$/, "")}/`);
  Object.entries(queryParams || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });

  let response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: buildPrimetimeRequestHeaders(bearerToken)
    });
  } catch (error) {
    throw new Error(`Unable to reach ${url.pathname}: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = parseJsonText(text, null);
  if (!response.ok) {
    const message = extractConsoleErrorMessage(parsed, text);
    throw new Error(`${url.pathname} returned ${response.status}${message ? `: ${message}` : ""}`);
  }

  return parsed ?? (text ? text.trim() : null);
}

async function fetchCmuReportJson({ baseUrl, path, accessToken, queryParams = {} }) {
  const normalizedBaseUrl = String(baseUrl || "").trim();
  const normalizedPath = String(path || "").trim();
  const bearerToken = normalizeBearerTokenValue(accessToken);
  if (!normalizedBaseUrl || !normalizedPath || !bearerToken) {
    throw new Error("CMU report request is missing required context.");
  }

  const url = new URL(normalizedPath, `${normalizedBaseUrl.replace(/\/+$/, "")}/`);
  Object.entries(queryParams || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });

  let response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      credentials: "include",
      referrer: CM_REPORTS_APP_REFERER,
      referrerPolicy: "strict-origin-when-cross-origin",
      headers: buildCmuReportRequestHeaders(bearerToken)
    });
  } catch (error) {
    throw new Error(`Unable to reach ${url.pathname}: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = parseJsonText(text, null);
  if (!response.ok) {
    const message = extractConsoleErrorMessage(parsed, text);
    throw new Error(`${url.pathname} returned ${response.status}${message ? `: ${message}` : ""}`);
  }

  return parsed ?? (text ? text.trim() : null);
}

async function fetchUnifiedShellInit({ accessToken, selectedOrg = "" }) {
  const bearerToken = String(accessToken || "").trim();
  if (!bearerToken) {
    throw new Error("Unified Shell request is missing the Adobe IMS access token.");
  }

  let response;
  try {
    response = await fetch(UNIFIED_SHELL_GRAPHQL_URL, {
      method: "POST",
      mode: "cors",
      credentials: "include",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
        "x-api-key": UNIFIED_SHELL_API_KEY
      },
      body: JSON.stringify({
        operationName: UNIFIED_SHELL_OPERATION_NAME,
        query: UNIFIED_SHELL_INIT_QUERY,
        variables: {
          selectedOrg: firstNonEmptyString([selectedOrg]) || null,
          useConsolidatedAccounts: false
        }
      })
    });
  } catch (error) {
    throw new Error(`Unable to reach Unified Shell GraphQL: ${serializeError(error)}`);
  }

  const text = await response.text().catch(() => "");
  const parsed = parseJsonText(text, null);
  if (!response.ok) {
    const message = extractConsoleErrorMessage(parsed, text);
    throw new Error(`Unified Shell GraphQL returned ${response.status}${message ? `: ${message}` : ""}`);
  }
  if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
    const message = extractConsoleErrorMessage(parsed, text);
    throw new Error(`Unified Shell GraphQL returned an application error${message ? `: ${message}` : ""}`);
  }

  return parsed ?? { data: {} };
}

function resolveUnifiedShellSelectedOrg(session, activeOrganization = null) {
  const requestedTargetOrganization = normalizeRequestedTargetOrganization(session?.targetOrganization);
  const targetSelectedOrg = firstNonEmptyString([
    requestedTargetOrganization?.tenantId,
    requestedTargetOrganization?.id && !/@adobeorg$/i.test(requestedTargetOrganization.id) ? requestedTargetOrganization.id : ""
  ]);
  if (targetSelectedOrg) {
    return targetSelectedOrg;
  }

  const previousSelectedOrg = firstNonEmptyString([session?.unifiedShell?.selectedOrg]);
  if (previousSelectedOrg && !/@adobeorg$/i.test(previousSelectedOrg)) {
    return previousSelectedOrg;
  }

  const activeId = firstNonEmptyString([activeOrganization?.tenantId, activeOrganization?.id]);
  if (activeId && !/@adobeorg$/i.test(activeId)) {
    return activeId;
  }

  const projectedProductContexts = [
    ...(Array.isArray(session?.profile?.projectedProductContext) ? session.profile.projectedProductContext : []),
    ...(Array.isArray(session?.profile?.additional_info?.projectedProductContext)
      ? session.profile.additional_info.projectedProductContext
      : []),
    ...(Array.isArray(session?.console?.extendedProfile?.userProfile?.projectedProductContext)
      ? session.console.extendedProfile.userProfile.projectedProductContext
      : [])
  ];

  for (const entry of projectedProductContexts) {
    const prodCtx = entry?.prodCtx && typeof entry.prodCtx === "object" ? entry.prodCtx : entry;
    const tenantId = firstNonEmptyString([prodCtx?.tenantId, prodCtx?.tenant_id, prodCtx?.companyId, prodCtx?.company_id]);
    if (tenantId) {
      return tenantId;
    }
  }

  return firstNonEmptyString([previousSelectedOrg, activeId]);
}

function normalizeUnifiedShellClusterData(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      return {
        index,
        consolidatedAccount: entry.consolidatedAccount === true,
        restricted: entry.restricted === true,
        userId: firstNonEmptyString([entry.userId]),
        userType: firstNonEmptyString([entry.userType]),
        owningOrg: normalizeUnifiedShellOrganizationNode(entry.owningOrg),
        orgs: Array.isArray(entry.orgs)
          ? entry.orgs.map((organization) => normalizeUnifiedShellOrganizationNode(organization)).filter(Boolean)
          : []
      };
    })
    .filter(Boolean);
}

function normalizeUnifiedShellOrganizationNode(organization) {
  if (!organization || typeof organization !== "object") {
    return null;
  }

  const tenantId = firstNonEmptyString([organization.tenantId, organization.tenant_id]);
  const imsOrgId = firstNonEmptyString([organization.imsOrgId, organization.ims_org_id]);
  const name = firstNonEmptyString([organization.orgName, organization.org_name, organization.organizationName]);
  const id = firstNonEmptyString([tenantId, imsOrgId, organization.id]);
  if (!id && !name) {
    return null;
  }

  return {
    id,
    tenantId,
    imsOrgId,
    name: name || id,
    aepRegion: firstNonEmptyString([organization.aepRegion, organization.aep_region]),
    hasAEP: organization.hasAEP === true,
    aemInstances: Array.isArray(organization.aemInstances)
      ? organization.aemInstances
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => ({
            domain: firstNonEmptyString([entry.domain]),
            environment: firstNonEmptyString([entry.environment]),
            path: firstNonEmptyString([entry.path]),
            rootTemplate: firstNonEmptyString([entry.rootTemplate]),
            title: firstNonEmptyString([entry.title]),
            type: firstNonEmptyString([entry.type])
          }))
      : []
  };
}

function normalizeUnifiedShellOrganizations({ clusters = [], activeOrganization = null, selectedOrg = "" } = {}) {
  const candidateMap = new Map();
  const idIndex = new Map();
  const nameIndex = new Map();
  const normalizedSelectedOrg = normalizeOrganizationIdentifier(selectedOrg);
  const activeIdentifiers = new Set(
    [
      firstNonEmptyString([activeOrganization?.key]),
      firstNonEmptyString([activeOrganization?.id]),
      firstNonEmptyString([activeOrganization?.tenantId]),
      firstNonEmptyString([activeOrganization?.imsOrgId]),
      firstNonEmptyString([activeOrganization?.name])
    ]
      .map((value) => normalizeOrganizationIdentifier(value))
      .filter(Boolean)
  );

  const upsertOrganization = (organization, source, cluster) => {
    if (!organization || typeof organization !== "object") {
      return;
    }

    const id = firstNonEmptyString([organization.id, organization.tenantId, organization.imsOrgId]);
    const name = firstNonEmptyString([organization.name, id ? `Adobe IMS Org ${id}` : ""]);
    if (!id && !name) {
      return;
    }

    const normalizedId = normalizeOrganizationIdentifier(id);
    const normalizedName = normalizeOrganizationIdentifier(name);
    let existingKey = normalizedId ? idIndex.get(normalizedId) : "";
    if (!existingKey && normalizedName) {
      existingKey = nameIndex.get(normalizedName) || "";
    }

    if (!existingKey) {
      const key = buildOrganizationOptionKey({ id, name });
      if (!key) {
        return;
      }

      const nextCandidate = {
        key,
        id,
        tenantId: firstNonEmptyString([organization.tenantId, id]),
        imsOrgId: firstNonEmptyString([organization.imsOrgId]),
        name,
        source,
        sources: source ? [source] : [],
        hinted:
          activeIdentifiers.has(normalizedId) ||
          activeIdentifiers.has(normalizedName) ||
          (normalizedSelectedOrg && normalizedSelectedOrg === normalizeOrganizationIdentifier(organization.tenantId)),
        label: buildOrganizationOptionLabel({ id, name }),
        aepRegion: firstNonEmptyString([organization.aepRegion]),
        hasAEP: organization.hasAEP === true,
        aemInstances: Array.isArray(organization.aemInstances) ? organization.aemInstances : [],
        clusterIndex: Number.isFinite(cluster?.index) ? cluster.index : -1,
        clusterUserId: firstNonEmptyString([cluster?.userId]),
        clusterUserType: firstNonEmptyString([cluster?.userType]),
        clusterRestricted: cluster?.restricted === true,
        consolidatedAccount: cluster?.consolidatedAccount === true
      };

      candidateMap.set(key, nextCandidate);
      if (normalizedId) {
        idIndex.set(normalizedId, key);
      }
      if (normalizedName) {
        nameIndex.set(normalizedName, key);
      }
      return;
    }

    const existingCandidate = candidateMap.get(existingKey);
    if (!existingCandidate) {
      return;
    }

    existingCandidate.id = firstNonEmptyString([existingCandidate.id, id]);
    existingCandidate.tenantId = firstNonEmptyString([existingCandidate.tenantId, organization.tenantId, existingCandidate.id]);
    existingCandidate.imsOrgId = firstNonEmptyString([existingCandidate.imsOrgId, organization.imsOrgId]);
    existingCandidate.name = choosePreferredOrganizationName(existingCandidate.name, name, existingCandidate.id || id);
    existingCandidate.aepRegion = firstNonEmptyString([existingCandidate.aepRegion, organization.aepRegion]);
    existingCandidate.hasAEP = existingCandidate.hasAEP === true || organization.hasAEP === true;
    if ((!Array.isArray(existingCandidate.aemInstances) || existingCandidate.aemInstances.length === 0) && Array.isArray(organization.aemInstances)) {
      existingCandidate.aemInstances = organization.aemInstances;
    }
    existingCandidate.clusterIndex = existingCandidate.clusterIndex >= 0 ? existingCandidate.clusterIndex : Number(cluster?.index || -1);
    existingCandidate.clusterUserId = firstNonEmptyString([existingCandidate.clusterUserId, cluster?.userId]);
    existingCandidate.clusterUserType = firstNonEmptyString([existingCandidate.clusterUserType, cluster?.userType]);
    existingCandidate.clusterRestricted = existingCandidate.clusterRestricted === true || cluster?.restricted === true;
    existingCandidate.consolidatedAccount = existingCandidate.consolidatedAccount === true || cluster?.consolidatedAccount === true;
    existingCandidate.hinted =
      existingCandidate.hinted === true ||
      activeIdentifiers.has(normalizedId) ||
      activeIdentifiers.has(normalizedName) ||
      (normalizedSelectedOrg && normalizedSelectedOrg === normalizeOrganizationIdentifier(organization.tenantId));

    if (source && !existingCandidate.sources.includes(source)) {
      existingCandidate.sources.push(source);
    }
    if (!existingCandidate.source || rankOrganizationSource(source) < rankOrganizationSource(existingCandidate.source)) {
      existingCandidate.source = source;
    }

    existingCandidate.label = buildOrganizationOptionLabel({
      id: existingCandidate.id,
      name: existingCandidate.name
    });
  };

  (Array.isArray(clusters) ? clusters : []).forEach((cluster) => {
    upsertOrganization(cluster?.owningOrg, `unifiedShell.imsExtendedAccountClusterData[${cluster?.index}].owningOrg`, cluster);
    (Array.isArray(cluster?.orgs) ? cluster.orgs : []).forEach((organization, organizationIndex) => {
      upsertOrganization(
        organization,
        `unifiedShell.imsExtendedAccountClusterData[${cluster?.index}].orgs[${organizationIndex}]`,
        cluster
      );
    });
  });

  return Array.from(candidateMap.values());
}

function mergeDetectedOrganizationCandidates({
  existingOrganizations = [],
  additionalOrganizations = [],
  activeOrganizationHint = null
} = {}) {
  const candidateMap = new Map();
  const idIndex = new Map();
  const nameIndex = new Map();
  const activeIdentifiers = new Set(
    [
      firstNonEmptyString([activeOrganizationHint?.key]),
      firstNonEmptyString([activeOrganizationHint?.id]),
      firstNonEmptyString([activeOrganizationHint?.tenantId]),
      firstNonEmptyString([activeOrganizationHint?.imsOrgId]),
      firstNonEmptyString([activeOrganizationHint?.name])
    ]
      .map((value) => normalizeOrganizationIdentifier(value))
      .filter(Boolean)
  );

  const upsert = (organization, defaultSource) => {
    if (!organization || typeof organization !== "object") {
      return;
    }

    const id = firstNonEmptyString([
      organization.id,
      organization.tenantId,
      organization.imsOrgId,
      organization.orgId,
      organization.organizationId
    ]);
    const name = firstNonEmptyString([organization.name, organization.label, id ? `Adobe IMS Org ${id}` : ""]);
    if (!id && !name) {
      return;
    }

    const normalizedId = normalizeOrganizationIdentifier(id);
    const normalizedName = normalizeOrganizationIdentifier(name);
    let existingKey = normalizedId ? idIndex.get(normalizedId) : "";
    if (!existingKey && normalizedName) {
      existingKey = nameIndex.get(normalizedName) || "";
    }

    const source = firstNonEmptyString([
      organization.source,
      Array.isArray(organization.sources) ? organization.sources[0] : "",
      defaultSource
    ]);
    const sources = [];
    [source, ...(Array.isArray(organization.sources) ? organization.sources : [])].forEach((value) => {
      const normalizedSource = String(value || "").trim();
      if (normalizedSource && !sources.includes(normalizedSource)) {
        sources.push(normalizedSource);
      }
    });

    if (!existingKey) {
      const key = firstNonEmptyString([organization.key, buildOrganizationOptionKey({ id, name })]);
      if (!key) {
        return;
      }

      const nextCandidate = {
        key,
        id,
        tenantId: firstNonEmptyString([organization.tenantId, id]),
        imsOrgId: firstNonEmptyString([organization.imsOrgId]),
        name,
        source,
        sources,
        hinted:
          organization.hinted === true ||
          activeIdentifiers.has(normalizedId) ||
          activeIdentifiers.has(normalizedName) ||
          activeIdentifiers.has(normalizeOrganizationIdentifier(organization.key)),
        label: firstNonEmptyString([organization.label, buildOrganizationOptionLabel({ id, name })]),
        aepRegion: firstNonEmptyString([organization.aepRegion]),
        hasAEP: organization.hasAEP === true,
        aemInstances: Array.isArray(organization.aemInstances) ? organization.aemInstances : [],
        clusterIndex: Number.isFinite(organization.clusterIndex) ? organization.clusterIndex : -1,
        clusterUserId: firstNonEmptyString([organization.clusterUserId, organization.userId]),
        clusterUserType: firstNonEmptyString([organization.clusterUserType, organization.userType]),
        clusterRestricted: organization.clusterRestricted === true || organization.restricted === true,
        consolidatedAccount: organization.consolidatedAccount === true
      };

      candidateMap.set(key, nextCandidate);
      if (normalizedId) {
        idIndex.set(normalizedId, key);
      }
      if (normalizedName) {
        nameIndex.set(normalizedName, key);
      }
      return;
    }

    const existingCandidate = candidateMap.get(existingKey);
    if (!existingCandidate) {
      return;
    }

    existingCandidate.id = firstNonEmptyString([existingCandidate.id, id]);
    existingCandidate.tenantId = firstNonEmptyString([existingCandidate.tenantId, organization.tenantId, existingCandidate.id]);
    existingCandidate.imsOrgId = firstNonEmptyString([existingCandidate.imsOrgId, organization.imsOrgId]);
    existingCandidate.name = choosePreferredOrganizationName(existingCandidate.name, name, existingCandidate.id || id);
    existingCandidate.aepRegion = firstNonEmptyString([existingCandidate.aepRegion, organization.aepRegion]);
    existingCandidate.hasAEP = existingCandidate.hasAEP === true || organization.hasAEP === true;
    if ((!Array.isArray(existingCandidate.aemInstances) || existingCandidate.aemInstances.length === 0) && Array.isArray(organization.aemInstances)) {
      existingCandidate.aemInstances = organization.aemInstances;
    }
    existingCandidate.clusterIndex =
      existingCandidate.clusterIndex >= 0 ? existingCandidate.clusterIndex : Number(organization.clusterIndex || -1);
    existingCandidate.clusterUserId = firstNonEmptyString([existingCandidate.clusterUserId, organization.clusterUserId, organization.userId]);
    existingCandidate.clusterUserType = firstNonEmptyString([existingCandidate.clusterUserType, organization.clusterUserType, organization.userType]);
    existingCandidate.clusterRestricted =
      existingCandidate.clusterRestricted === true ||
      organization.clusterRestricted === true ||
      organization.restricted === true;
    existingCandidate.consolidatedAccount =
      existingCandidate.consolidatedAccount === true || organization.consolidatedAccount === true;
    existingCandidate.hinted =
      existingCandidate.hinted === true ||
      organization.hinted === true ||
      activeIdentifiers.has(normalizedId) ||
      activeIdentifiers.has(normalizedName) ||
      activeIdentifiers.has(normalizeOrganizationIdentifier(organization.key));

    sources.forEach((value) => {
      if (!existingCandidate.sources.includes(value)) {
        existingCandidate.sources.push(value);
      }
    });
    if (!existingCandidate.source || rankOrganizationSource(source) < rankOrganizationSource(existingCandidate.source)) {
      existingCandidate.source = source;
    }

    existingCandidate.label = buildOrganizationOptionLabel({
      id: existingCandidate.id,
      name: existingCandidate.name
    });
  };

  (Array.isArray(existingOrganizations) ? existingOrganizations : []).forEach((organization, index) => {
    upsert(organization, `session.detectedOrganizations[${index}]`);
  });
  (Array.isArray(additionalOrganizations) ? additionalOrganizations : []).forEach((organization, index) => {
    upsert(organization, `unifiedShell.organizations[${index}]`);
  });

  return Array.from(candidateMap.values());
}

function extractConsoleErrorMessage(parsedPayload, rawText = "") {
  if (parsedPayload && typeof parsedPayload === "object") {
    const directMessage = firstNonEmptyString([
      parsedPayload.message,
      parsedPayload.error,
      parsedPayload.error_description,
      parsedPayload.detail,
      parsedPayload.reason
    ]);
    if (directMessage) {
      return directMessage;
    }

    if (Array.isArray(parsedPayload.errors)) {
      const firstError = parsedPayload.errors.find((value) => value && typeof value === "object") || parsedPayload.errors[0];
      if (firstError && typeof firstError === "object") {
        return firstNonEmptyString([
          firstError.message,
          firstError.detail,
          firstError.error,
          firstError.reason
        ]);
      }
      return firstNonEmptyString(parsedPayload.errors);
    }
  }

  return firstNonEmptyString([String(rawText || "").trim()]);
}

function normalizeConsoleConfigurationVersion(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === "object") {
    return firstNonEmptyString([
      value.configurationVersion,
      value.version,
      typeof value.value === "number" || typeof value.value === "string" ? String(value.value) : ""
    ]);
  }

  return "";
}

function extractConsoleAuthorities(extendedProfile) {
  if (!extendedProfile || typeof extendedProfile !== "object" || !Array.isArray(extendedProfile.grantedAuthorities)) {
    return [];
  }

  return extendedProfile.grantedAuthorities
    .map((authority) =>
      firstNonEmptyString([
        authority?.authority,
        authority?.name,
        typeof authority === "string" ? authority : ""
      ])
    )
    .filter(Boolean);
}

function computeEntityReferenceId(reference = "") {
  const normalizedReference = String(reference || "").trim();
  if (!normalizedReference) {
    return "";
  }

  const matches = normalizedReference.match(/@[^:]+:(.+)$/);
  return firstNonEmptyString([matches?.[1], normalizedReference]);
}

function normalizeConsoleChannels(payload) {
  const entities = Array.isArray(payload?.entities) ? payload.entities : Array.isArray(payload) ? payload : [];
  const seen = new Set();
  const channels = [];

  entities.forEach((entity, index) => {
    const entityData = entity?.entityData && typeof entity.entityData === "object" ? entity.entityData : entity;
    if (!entityData || typeof entityData !== "object") {
      return;
    }

    const id = firstNonEmptyString([entityData.id, entity?.id, entity?.key]);
    const key = firstNonEmptyString([id, entity?.key, `channel-${index + 1}`]);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    const name = firstNonEmptyString([
      entityData.displayName,
      entityData.name,
      entityData.label,
      entityData.title,
      id ? `Channel ${id}` : `Channel ${index + 1}`
    ]);
    channels.push({
      key,
      id,
      name,
      label:
        id &&
        normalizeOrganizationIdentifier(name) !== normalizeOrganizationIdentifier(id) &&
        normalizeOrganizationIdentifier(name) !== normalizeOrganizationIdentifier(`Channel ${id}`)
          ? `${name} | ${id}`
          : name,
      programmerId: computeEntityReferenceId(entityData.programmer),
      integrationsCount:
        entityData.integrations && typeof entityData.integrations === "object" ? Object.keys(entityData.integrations).length : 0,
      raw: entityData
    });
  });

  return channels.sort((left, right) => {
    const leftLabel = firstNonEmptyString([left?.name, left?.label, left?.id]);
    const rightLabel = firstNonEmptyString([right?.name, right?.label, right?.id]);
    return leftLabel.localeCompare(rightLabel, undefined, {
      sensitivity: "base"
    });
  });
}

function isProbablyJwtToken(value = "") {
  const normalizedValue = String(value || "").trim();
  if (normalizedValue.length < 60) {
    return false;
  }

  const parts = normalizedValue.split(".");
  return parts.length === 3 && /^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(normalizedValue);
}

function extractSoftwareStatementFromApplicationData(applicationData = null) {
  if (!applicationData || typeof applicationData !== "object") {
    return "";
  }

  const directCandidates = [
    applicationData.softwareStatement,
    applicationData.software_statement,
    applicationData.softwarestatement,
    applicationData.software?.statement,
    applicationData.dcr?.softwareStatement,
    applicationData.credentials?.softwareStatement,
    applicationData.client?.softwareStatement,
    applicationData.client?.software_statement,
    applicationData.clientApplication?.softwareStatement,
    applicationData.clientApplication?.software_statement,
    applicationData.registeredClient?.softwareStatement,
    applicationData.registeredClient?.software_statement,
    applicationData.__rawEnvelope?.softwareStatement,
    applicationData.__rawEnvelope?.software_statement,
    applicationData.__rawEnvelope?.entityData?.softwareStatement,
    applicationData.__rawEnvelope?.entityData?.software_statement,
    applicationData.__rawEnvelope?.entityData?.client?.softwareStatement,
    applicationData.__rawEnvelope?.entityData?.client?.software_statement,
    applicationData.__rawEnvelope?.entityData?.clientApplication?.softwareStatement,
    applicationData.__rawEnvelope?.entityData?.clientApplication?.software_statement,
    applicationData.__rawEnvelope?.entityData?.registeredClient?.softwareStatement,
    applicationData.__rawEnvelope?.entityData?.registeredClient?.software_statement,
    applicationData.raw?.softwareStatement,
    applicationData.raw?.software_statement,
    applicationData.raw?.client?.softwareStatement,
    applicationData.raw?.client?.software_statement
  ];

  for (const candidate of directCandidates) {
    const normalizedCandidate = String(candidate || "").trim();
    if (isProbablyJwtToken(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }

  const seenObjects = new Set();
  const stack = [applicationData];

  while (stack.length > 0) {
    const currentNode = stack.pop();
    if (typeof currentNode === "string") {
      const normalizedValue = currentNode.trim();
      if (isProbablyJwtToken(normalizedValue)) {
        return normalizedValue;
      }
      continue;
    }

    if (!currentNode || typeof currentNode !== "object" || seenObjects.has(currentNode)) {
      continue;
    }
    seenObjects.add(currentNode);

    if (Array.isArray(currentNode)) {
      currentNode.forEach((value) => {
        stack.push(value);
      });
      continue;
    }

    Object.values(currentNode).forEach((value) => {
      stack.push(value);
    });
  }

  return "";
}

function extractJwtAndUrlsFromValue(value = null) {
  const seen = new Set();
  const jwtCandidates = [];
  const urlCandidates = [];
  const stack = [{ node: value, path: "" }];

  while (stack.length > 0) {
    const { node, path } = stack.pop();

    if (typeof node === "string") {
      const normalizedNode = node.trim();
      if (isProbablyJwtToken(normalizedNode)) {
        const lowerPath = String(path || "").toLowerCase();
        let score = 0;
        if (lowerPath.includes("software") && lowerPath.includes("statement")) {
          score += 100;
        }
        if (lowerPath.includes("software_statement") || lowerPath.includes("softwarestatement")) {
          score += 100;
        }
        if (lowerPath.includes("jwt")) {
          score += 10;
        }
        jwtCandidates.push({
          score,
          value: normalizedNode
        });
      }

      if (/^https?:\/\//i.test(normalizedNode) && /software/i.test(normalizedNode) && /statement/i.test(normalizedNode)) {
        urlCandidates.push(normalizedNode);
      }
      continue;
    }

    if (!node || typeof node !== "object" || seen.has(node)) {
      continue;
    }
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        stack.push({
          node: item,
          path: `${path}[${index}]`
        });
      });
      continue;
    }

    Object.entries(node).forEach(([key, nested]) => {
      stack.push({
        node: nested,
        path: path ? `${path}.${key}` : key
      });
    });
  }

  jwtCandidates.sort((left, right) => right.score - left.score);
  return {
    jwt: firstNonEmptyString([jwtCandidates[0]?.value]),
    jwtScore: Number(jwtCandidates[0]?.score || 0),
    urls: dedupeCandidateStrings(urlCandidates)
  };
}

function buildRegisteredApplicationScopeLabels(scopes = []) {
  const normalizedScopes = Array.isArray(scopes) ? scopes.map((scope) => String(scope || "").trim()).filter(Boolean) : [];
  return [
    "DEFAULT",
    ...normalizedScopes.map((scope) => REGISTERED_APPLICATION_SCOPE_LABELS[scope] || scope)
  ].filter(Boolean);
}

function buildRegisteredApplicationLabel(name = "", scopeLabels = [], fallbackLabel = "") {
  const normalizedName = firstNonEmptyString([name]);
  const scopeSummary = (Array.isArray(scopeLabels) ? scopeLabels : []).filter(Boolean).join(", ");
  return scopeSummary ? `${normalizedName} | ${scopeSummary}` : firstNonEmptyString([fallbackLabel, normalizedName]);
}

function normalizeRegisteredApplicationDetailPayload(payload = null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const entityData =
    payload.entityData && typeof payload.entityData === "object" && !Array.isArray(payload.entityData)
      ? payload.entityData
      : payload;
  if (!entityData || typeof entityData !== "object" || Array.isArray(entityData)) {
    return null;
  }

  return {
    ...entityData,
    ...(payload !== entityData ? { __rawEnvelope: payload } : {})
  };
}

function buildRegisteredApplicationDetailPaths(applicationId = "") {
  const normalizedApplicationId = String(applicationId || "").trim();
  if (!normalizedApplicationId) {
    return [];
  }

  const encodedApplicationId = encodeURIComponent(normalizedApplicationId);
  return [
    `${CONSOLE_APPLICATIONS_PATH}/${encodedApplicationId}`,
    `/entity/RegisteredApplication/${encodedApplicationId}`
  ];
}

function normalizeRegisteredApplicationEntityRef(value = "") {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  const normalizedValue = rawValue.replace(/^@+/, "");
  const match = normalizedValue.match(/^RegisteredApplication:(.+)$/i);
  const applicationId = String(match ? match[1] : normalizedValue).trim();
  return applicationId ? `RegisteredApplication:${applicationId}` : "";
}

function buildRegisteredApplicationBulkRetrieveRequest(entityRefs = [], configurationVersion = "") {
  const entities = dedupeCandidateStrings((Array.isArray(entityRefs) ? entityRefs : [entityRefs]).map((entityRef) =>
    normalizeRegisteredApplicationEntityRef(entityRef).replace(/^@+/, "")
  )).filter(Boolean);
  if (entities.length === 0) {
    return null;
  }

  const payload = { entities };
  const normalizedConfigurationVersion = Number(configurationVersion || 0);
  if (Number.isFinite(normalizedConfigurationVersion) && normalizedConfigurationVersion > 0) {
    payload.configVersion = normalizedConfigurationVersion;
  }

  return {
    path: "/entity/bulkRetrieve",
    body: JSON.stringify(payload),
    entities
  };
}

function resolveRegisteredApplicationIdFromEntityData(entityData = null) {
  if (!entityData || typeof entityData !== "object") {
    return "";
  }

  return firstNonEmptyString([entityData.id, entityData.key, entityData.guid]);
}

function extractRegisteredApplicationFromBulkPayload(payload = null, applicationId = "") {
  const normalizedApplicationId = String(applicationId || "").trim();
  const entities = Array.isArray(payload?.entities) ? payload.entities : Array.isArray(payload) ? payload : [];
  if (entities.length === 0) {
    return null;
  }

  const normalizedEntities = entities
    .map((entity) => normalizeRegisteredApplicationDetailPayload(entity))
    .filter(Boolean);
  if (!normalizedApplicationId) {
    return normalizedEntities[0] || null;
  }

  return (
    normalizedEntities.find(
      (entity) => resolveRegisteredApplicationIdFromEntityData(entity) === normalizedApplicationId
    ) ||
    normalizedEntities[0] ||
    null
  );
}

async function fetchRegisteredApplicationBulkRetrieve(
  session = null,
  applicationId = "",
  { csrfToken = "NO-TOKEN", pageContextTargetRef = null } = {}
) {
  const currentSession = session && typeof session === "object" ? session : null;
  const consoleContext = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const accessToken = firstNonEmptyString([currentSession?.accessToken]);
  const baseUrl = firstNonEmptyString([consoleContext?.baseUrl]);
  const configurationVersion = firstNonEmptyString([consoleContext?.configurationVersion]);
  const environmentId = firstNonEmptyString([
    consoleContext?.environmentId,
    state.runtimeConfig?.consoleEnvironment,
    CONSOLE_DEFAULT_ENVIRONMENT
  ]);
  const normalizedApplicationId = String(applicationId || "").trim();
  const nextCsrfToken = firstNonEmptyString([csrfToken, consoleContext?.csrfToken, "NO-TOKEN"]);
  const bulkRetrieveRequest = buildRegisteredApplicationBulkRetrieveRequest([normalizedApplicationId], configurationVersion);

  if (!accessToken || !baseUrl || !normalizedApplicationId || !bulkRetrieveRequest) {
    throw new Error("Registered Application bulk detail request is missing console context.");
  }

  const result = await fetchConsoleJsonWithFallback({
    baseUrl,
    path: bulkRetrieveRequest.path,
    accessToken,
    csrfToken: nextCsrfToken,
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: bulkRetrieveRequest.body,
    environmentId,
    pageContextTargetRef
  });

  return {
    application: extractRegisteredApplicationFromBulkPayload(result?.data, normalizedApplicationId),
    csrfToken: firstNonEmptyString([result?.csrfToken, nextCsrfToken]),
    transport: firstNonEmptyString([result?.transport]),
    pageContext: result?.pageContext || null,
    rawText: String(result?.rawText || "")
  };
}

async function fetchTextWithTimeout(resource = "", { headers = {}, timeoutMs = ADOBE_PAGE_CONTEXT_TIMEOUT_MS } = {}) {
  const requestUrl = String(resource || "").trim();
  if (!requestUrl) {
    return "";
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 0) || ADOBE_PAGE_CONTEXT_TIMEOUT_MS));
  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers,
      signal: controller.signal
    });
    if (!response.ok) {
      return "";
    }
    return await response.text().catch(() => "");
  } catch {
    return "";
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function extractSoftwareStatementFromText(text = "") {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    return "";
  }

  if (isProbablyJwtToken(normalizedText)) {
    return normalizedText;
  }

  const parsed = parseJsonText(normalizedText, null);
  if (parsed && typeof parsed === "object") {
    const extracted = extractSoftwareStatementFromApplicationData(parsed);
    if (extracted) {
      return extracted;
    }
    const dereferenced = extractJwtAndUrlsFromValue(parsed);
    if (dereferenced.jwt && dereferenced.jwtScore > 0) {
      return dereferenced.jwt;
    }
  }

  const match = normalizedText.match(/[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/);
  return match && isProbablyJwtToken(match[0]) ? match[0] : "";
}

function mergeHydratedRegisteredApplication(application = null, detailData = null, softwareStatement = "") {
  const baseApplication = application && typeof application === "object" ? application : {};
  const normalizedDetail = detailData && typeof detailData === "object" ? detailData : null;
  const applicationId = firstNonEmptyString([baseApplication.id, baseApplication.key, normalizedDetail?.id]);
  const applicationKey = firstNonEmptyString([baseApplication.key, baseApplication.id, normalizedDetail?.id]);
  const applicationName = firstNonEmptyString([
    normalizedDetail?.displayName,
    normalizedDetail?.name,
    normalizedDetail?.label,
    normalizedDetail?.title,
    baseApplication.name,
    baseApplication.label,
    applicationId
  ]);
  const scopes = Array.isArray(normalizedDetail?.scopes)
    ? normalizedDetail.scopes.filter(Boolean)
    : Array.isArray(baseApplication.scopes)
      ? baseApplication.scopes.filter(Boolean)
      : [];
  const scopeLabels = buildRegisteredApplicationScopeLabels(scopes);
  const normalizedSoftwareStatement = firstNonEmptyString([
    softwareStatement,
    extractSoftwareStatementFromApplicationData(normalizedDetail),
    extractSoftwareStatementFromApplicationData(baseApplication.raw || baseApplication),
    baseApplication.softwareStatement
  ]);

  return {
    key: applicationKey,
    id: applicationId,
    name: applicationName,
    label: buildRegisteredApplicationLabel(applicationName, scopeLabels, baseApplication.label),
    clientId: firstNonEmptyString([
      normalizedDetail?.clientId,
      normalizedDetail?.client_id,
      baseApplication.clientId
    ]),
    scopes,
    scopeLabels,
    type: firstNonEmptyString([
      normalizedDetail?.type,
      normalizedDetail?.applicationType,
      baseApplication.type
    ]),
    softwareStatement: normalizedSoftwareStatement,
    raw: normalizedDetail || baseApplication.raw || null
  };
}

async function fetchRegisteredApplicationDetails(
  session = null,
  applicationId = "",
  { csrfToken = "NO-TOKEN", pageContextTargetRef = null } = {}
) {
  const currentSession = session && typeof session === "object" ? session : null;
  const consoleContext = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const accessToken = firstNonEmptyString([currentSession?.accessToken]);
  const baseUrl = firstNonEmptyString([consoleContext?.baseUrl]);
  const configurationVersion = firstNonEmptyString([consoleContext?.configurationVersion]);
  const environmentId = firstNonEmptyString([
    consoleContext?.environmentId,
    state.runtimeConfig?.consoleEnvironment,
    CONSOLE_DEFAULT_ENVIRONMENT
  ]);
  const normalizedApplicationId = String(applicationId || "").trim();
  const nextCsrfToken = firstNonEmptyString([csrfToken, consoleContext?.csrfToken, "NO-TOKEN"]);

  if (!accessToken || !baseUrl || !normalizedApplicationId) {
    throw new Error("Registered Application detail request is missing console context.");
  }

  const queryParams = configurationVersion ? { configurationVersion } : {};
  const pathCandidates = buildRegisteredApplicationDetailPaths(normalizedApplicationId);
  let lastError = null;

  const bulkResult = await settle(() =>
    fetchRegisteredApplicationBulkRetrieve(session, normalizedApplicationId, {
      csrfToken: nextCsrfToken,
      pageContextTargetRef
    })
  );
  if (bulkResult.ok && bulkResult.value?.application) {
    return {
      application: bulkResult.value.application,
      csrfToken: firstNonEmptyString([bulkResult.value.csrfToken, nextCsrfToken]),
      transport: firstNonEmptyString([bulkResult.value.transport]),
      pageContext: bulkResult.value.pageContext || null,
      rawText: String(bulkResult.value.rawText || "")
    };
  }
  if (!bulkResult.ok) {
    lastError = bulkResult.error;
  }

  for (const path of pathCandidates) {
    const result = await settle(() =>
      fetchConsoleJsonWithFallback({
        baseUrl,
        path,
        accessToken,
        csrfToken: nextCsrfToken,
        queryParams,
        environmentId,
        pageContextTargetRef
      })
    );
    if (!result.ok) {
      lastError = result.error;
      continue;
    }

    const application = normalizeRegisteredApplicationDetailPayload(result.value?.data);
    if (!application) {
      continue;
    }

    return {
      application,
      csrfToken: firstNonEmptyString([result.value?.csrfToken, nextCsrfToken]),
      transport: firstNonEmptyString([result.value?.transport]),
      pageContext: result.value?.pageContext || null,
      rawText: String(result.value?.rawText || "")
    };
  }

  throw lastError || new Error(`Registered Application ${normalizedApplicationId} detail is unavailable.`);
}

async function fetchRegisteredApplicationSoftwareStatement(
  session = null,
  applicationId = "",
  { csrfToken = "NO-TOKEN", pageContextTargetRef = null } = {}
) {
  const currentSession = session && typeof session === "object" ? session : null;
  const consoleContext = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const accessToken = firstNonEmptyString([currentSession?.accessToken]);
  const baseUrl = firstNonEmptyString([consoleContext?.baseUrl]);
  const configurationVersion = firstNonEmptyString([consoleContext?.configurationVersion]);
  const environmentId = firstNonEmptyString([
    consoleContext?.environmentId,
    state.runtimeConfig?.consoleEnvironment,
    CONSOLE_DEFAULT_ENVIRONMENT
  ]);
  const normalizedApplicationId = String(applicationId || "").trim();
  let nextCsrfToken = firstNonEmptyString([csrfToken, consoleContext?.csrfToken, "NO-TOKEN"]);

  if (!accessToken || !baseUrl || !normalizedApplicationId) {
    throw new Error("Registered Application software statement request is missing console context.");
  }

  const queryParams = configurationVersion ? { configurationVersion } : {};
  const pathCandidates = buildRegisteredApplicationDetailPaths(normalizedApplicationId);
  let lastError = null;

  const bulkResult = await settle(() =>
    fetchRegisteredApplicationBulkRetrieve(session, normalizedApplicationId, {
      csrfToken: nextCsrfToken,
      pageContextTargetRef
    })
  );
  if (bulkResult.ok) {
    nextCsrfToken = firstNonEmptyString([bulkResult.value?.csrfToken, nextCsrfToken]);
    const bulkStatement = firstNonEmptyString([
      extractSoftwareStatementFromApplicationData(bulkResult.value?.application),
      extractSoftwareStatementFromText(bulkResult.value?.rawText)
    ]);
    if (bulkStatement) {
      return {
        softwareStatement: bulkStatement,
        csrfToken: nextCsrfToken
      };
    }
  } else {
    lastError = bulkResult.error;
  }

  for (const path of pathCandidates) {
    const result = await settle(() =>
      fetchConsoleJsonWithFallback({
        baseUrl,
        path,
        accessToken,
        csrfToken: nextCsrfToken,
        queryParams,
        environmentId,
        pageContextTargetRef
      })
    );
    if (!result.ok) {
      lastError = result.error;
      continue;
    }

    nextCsrfToken = firstNonEmptyString([result.value?.csrfToken, nextCsrfToken]);
    const directStatement = firstNonEmptyString([
      extractSoftwareStatementFromApplicationData(result.value?.data),
      extractSoftwareStatementFromText(result.value?.rawText)
    ]);
    if (directStatement) {
      return {
        softwareStatement: directStatement,
        csrfToken: nextCsrfToken
      };
    }

    const dereferenced = extractJwtAndUrlsFromValue(result.value?.data);
    if (dereferenced.jwt && dereferenced.jwtScore > 0) {
      return {
        softwareStatement: dereferenced.jwt,
        csrfToken: nextCsrfToken
      };
    }

    for (const candidateUrl of dereferenced.urls) {
      const candidateStatement = extractSoftwareStatementFromText(
        await fetchTextWithTimeout(candidateUrl, {
          headers: {
            Accept: "text/plain, application/json, */*"
          }
        })
      );
      if (candidateStatement) {
        return {
          softwareStatement: candidateStatement,
          csrfToken: nextCsrfToken
        };
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return {
    softwareStatement: "",
    csrfToken: nextCsrfToken
  };
}

async function enrichRegisteredApplicationForHydration(
  session = null,
  application = null,
  { csrfToken = "NO-TOKEN", pageContextTargetRef = null } = {}
) {
  const currentApplication = application && typeof application === "object" ? application : null;
  if (!currentApplication) {
    return {
      application: null,
      csrfToken: firstNonEmptyString([csrfToken, "NO-TOKEN"])
    };
  }

  const normalizedApplicationId = firstNonEmptyString([currentApplication.id, currentApplication.key]);
  if (!normalizedApplicationId || firstNonEmptyString([currentApplication.softwareStatement])) {
    return {
      application: mergeHydratedRegisteredApplication(currentApplication),
      csrfToken: firstNonEmptyString([csrfToken, "NO-TOKEN"])
    };
  }

  let nextApplication = mergeHydratedRegisteredApplication(currentApplication);
  let nextCsrfToken = firstNonEmptyString([csrfToken, "NO-TOKEN"]);

  const detailsResult = await settle(() =>
    fetchRegisteredApplicationDetails(session, normalizedApplicationId, {
      csrfToken: nextCsrfToken,
      pageContextTargetRef
    })
  );
  if (detailsResult.ok && detailsResult.value?.application) {
    nextApplication = mergeHydratedRegisteredApplication(nextApplication, detailsResult.value.application);
    nextCsrfToken = firstNonEmptyString([detailsResult.value.csrfToken, nextCsrfToken]);
  }

  if (!firstNonEmptyString([nextApplication.softwareStatement])) {
    const statementResult = await settle(() =>
      fetchRegisteredApplicationSoftwareStatement(session, normalizedApplicationId, {
        csrfToken: nextCsrfToken,
        pageContextTargetRef
      })
    );
    if (statementResult.ok && statementResult.value?.softwareStatement) {
      nextApplication = mergeHydratedRegisteredApplication(
        nextApplication,
        null,
        statementResult.value.softwareStatement
      );
      nextCsrfToken = firstNonEmptyString([statementResult.value.csrfToken, nextCsrfToken]);
    }
  }

  return {
    application: nextApplication,
    csrfToken: nextCsrfToken
  };
}

function parseDcrResponsePayload(text = "") {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    return null;
  }

  const parsedJson = parseJsonText(normalizedText, null);
  if (parsedJson && typeof parsedJson === "object") {
    return parsedJson;
  }

  const params = new URLSearchParams(normalizedText);
  const entries = Array.from(params.entries());
  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries);
}

function buildVaultCompactRegisteredApplication(application = null) {
  if (!application || typeof application !== "object") {
    return null;
  }

  const normalizedApplication = {
    key: firstNonEmptyString([application.key, application.id]),
    id: firstNonEmptyString([application.id, application.key]),
    name: firstNonEmptyString([application.name]),
    label: firstNonEmptyString([application.label, application.name, application.id]),
    clientId: firstNonEmptyString([application.clientId]),
    scopes: Array.isArray(application.scopes) ? application.scopes.filter(Boolean) : [],
    scopeLabels: Array.isArray(application.scopeLabels) ? application.scopeLabels.filter(Boolean) : [],
    type: firstNonEmptyString([application.type]),
    softwareStatement: extractSoftwareStatementFromApplicationData(application.raw || application)
  };

  return normalizedApplication.id || normalizedApplication.key ? normalizedApplication : null;
}

function resolveVaultDcrServiceDefinition(serviceKey = "") {
  const normalizedServiceKey = String(serviceKey || "").trim();
  if (!normalizedServiceKey) {
    return null;
  }

  return VAULT_DCR_SERVICE_DEFINITIONS.find((definition) => definition.serviceKey === normalizedServiceKey) || null;
}

function registeredApplicationMatchesRequiredScope(application = null, requiredScope = "") {
  const normalizedRequiredScope = String(requiredScope || "").trim();
  if (!application || !normalizedRequiredScope) {
    return false;
  }

  return (Array.isArray(application?.scopes) ? application.scopes : [])
    .map((scope) => String(scope || "").trim())
    .includes(normalizedRequiredScope);
}

function buildCompactRegisteredApplicationIdentity(application = null) {
  return firstNonEmptyString([application?.id, application?.key]);
}

function compactRegisteredApplicationsMatch(left = null, right = null) {
  const leftIdentity = buildCompactRegisteredApplicationIdentity(left);
  const rightIdentity = buildCompactRegisteredApplicationIdentity(right);
  return Boolean(leftIdentity) && leftIdentity === rightIdentity;
}

function resolvePreferredVaultServiceApplication({
  definition = null,
  registeredApplications = [],
  selectedRegisteredApplication = null,
  existingService = null
} = {}) {
  const normalizedDefinition = definition && typeof definition === "object" ? definition : null;
  if (!normalizedDefinition) {
    return null;
  }

  const normalizedApplications = Array.isArray(registeredApplications) ? registeredApplications : [];
  const selectedApplicationMatchesScope = registeredApplicationMatchesRequiredScope(
    selectedRegisteredApplication,
    normalizedDefinition.requiredScope
  );
  const matchingApplication = normalizedApplications.find((application) =>
    registeredApplicationMatchesRequiredScope(application, normalizedDefinition.requiredScope)
  );

  return buildVaultCompactRegisteredApplication(
    selectedApplicationMatchesScope
      ? selectedRegisteredApplication
      : matchingApplication || existingService?.registeredApplication || null
  );
}

function matchProgrammerCmTenants(selectedProgrammer = null, cmTenants = []) {
  if (!selectedProgrammer || typeof selectedProgrammer !== "object") {
    return [];
  }

  const programmerIdentifiers = new Set(
    [
      selectedProgrammer.id,
      selectedProgrammer.name,
      selectedProgrammer.label,
      selectedProgrammer.key,
      selectedProgrammer?.raw?.displayName,
      selectedProgrammer?.raw?.name
    ]
      .map((value) => normalizeOrganizationIdentifier(value))
      .filter(Boolean)
  );
  if (programmerIdentifiers.size === 0) {
    return [];
  }

  return (Array.isArray(cmTenants) ? cmTenants : []).filter((tenant) =>
    [
      tenant?.id,
      tenant?.name,
      tenant?.label,
      tenant?.key,
      tenant?.raw?.payload?.name,
      tenant?.raw?.consoleId
    ]
      .map((value) => normalizeOrganizationIdentifier(value))
      .filter(Boolean)
      .some((identifier) => programmerIdentifiers.has(identifier))
  );
}

function buildProgrammerCmVaultService(selectedProgrammer = null, cmTenants = []) {
  const matchedTenants = matchProgrammerCmTenants(selectedProgrammer, cmTenants).map((tenant) => ({
    key: firstNonEmptyString([tenant?.key, tenant?.id]),
    id: firstNonEmptyString([tenant?.id, tenant?.key]),
    name: firstNonEmptyString([tenant?.name]),
    label: firstNonEmptyString([tenant?.label, tenant?.name, tenant?.id])
  }));

  return {
    key: "cm",
    label: PREMIUM_SERVICE_CONCURRENCY_LABEL,
    available: matchedTenants.length > 0,
    checked: Array.isArray(cmTenants),
    matchedTenantCount: matchedTenants.length,
    matchedTenants,
    status: matchedTenants.length > 0 ? "ready" : Array.isArray(cmTenants) ? "checked" : "pending"
  };
}

function buildProgrammerServiceVaultEntries({
  registeredApplications = [],
  selectedProgrammer = null,
  cmTenants = [],
  existingVaultRecord = null,
  selectedRegisteredApplication = null
} = {}) {
  const normalizedApplications = Array.isArray(registeredApplications) ? registeredApplications : [];
  const services = {};

  VAULT_DCR_SERVICE_DEFINITIONS.forEach((definition) => {
    const existingService = existingVaultRecord?.services?.[definition.serviceKey] || null;
    const registeredApplication = resolvePreferredVaultServiceApplication({
      definition,
      registeredApplications: normalizedApplications,
      selectedRegisteredApplication,
      existingService
    });
    const client =
      compactRegisteredApplicationsMatch(registeredApplication, existingService?.registeredApplication) &&
      existingService?.client &&
      typeof existingService.client === "object"
        ? {
            ...existingService.client
          }
        : null;

    services[definition.serviceKey] = {
      key: definition.serviceKey,
      label: definition.label,
      available: Boolean(registeredApplication),
      requiredScope: definition.requiredScope,
      registeredApplication,
      client,
      status: registeredApplication ? (client?.clientId && client?.clientSecret ? "ready" : "pending") : "unavailable"
    };
  });

  services.cm = buildProgrammerCmVaultService(selectedProgrammer, cmTenants);
  return services;
}

function deriveAccessTokenExpiresAt(accessToken = "", fallbackExpiresAt = "") {
  const tokenClaims = accessToken ? decodeJwtPayload(accessToken) : null;
  const expiresAtSeconds = Number(tokenClaims?.exp || 0);
  if (Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0) {
    return new Date(expiresAtSeconds * 1000).toISOString();
  }

  return firstNonEmptyString([fallbackExpiresAt]);
}

function serviceClientNeedsTokenRefresh(client = null, requiredScope = "") {
  const currentClient = client && typeof client === "object" ? client : {};
  const accessToken = firstNonEmptyString([currentClient.accessToken]);
  if (!accessToken) {
    return true;
  }

  const tokenExpiresAt = deriveAccessTokenExpiresAt(accessToken, currentClient.tokenExpiresAt);
  const expiresAtMs = Date.parse(tokenExpiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + 60 * 1000) {
    return true;
  }

  const accessTokenClaims = decodeJwtPayload(accessToken) || null;
  const grantedScope = firstNonEmptyString([currentClient.tokenScope, accessTokenClaims?.scope]);
  return requiredScope ? !scopeIncludes(grantedScope, requiredScope) : false;
}

async function registerDcrClientWithSoftwareStatement(softwareStatement = "") {
  const normalizedSoftwareStatement = String(softwareStatement || "").trim();
  if (!normalizedSoftwareStatement) {
    throw new Error("Registered application software statement is unavailable.");
  }

  const requestUrl = new URL(DCR_REGISTER_PATH, `${ADOBE_SP_BASE_URL.replace(/\/+$/, "")}/`).toString();
  const attempts = [
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        software_statement: normalizedSoftwareStatement,
        grant_types: ["client_credentials"],
        token_endpoint_auth_method: "client_secret_post"
      })
    },
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        software_statement: normalizedSoftwareStatement
      }).toString()
    }
  ];

  let lastError = "DCR registration failed.";
  for (const attempt of attempts) {
    let response;
    try {
      response = await fetch(requestUrl, {
        method: "POST",
        mode: "cors",
        headers: attempt.headers,
        body: attempt.body
      });
    } catch (error) {
      lastError = serializeError(error);
      continue;
    }

    const text = await response.text().catch(() => "");
    const parsed = parseDcrResponsePayload(text);
    if (!response.ok) {
      lastError = extractConsoleErrorMessage(parsed, text) || `${response.status} ${response.statusText}`;
      continue;
    }

    const clientId = firstNonEmptyString([
      parsed?.client_id,
      parsed?.clientId,
      parsed?.client?.client_id,
      parsed?.client?.clientId
    ]);
    const clientSecret = firstNonEmptyString([
      parsed?.client_secret,
      parsed?.clientSecret,
      parsed?.client?.client_secret,
      parsed?.client?.clientSecret
    ]);
    if (!clientId || !clientSecret) {
      lastError = "DCR response did not return client_id and client_secret.";
      continue;
    }

    return {
      clientId,
      clientSecret
    };
  }

  throw new Error(lastError);
}

async function requestDcrServiceAccessToken(clientId = "", clientSecret = "", requiredScope = "") {
  const normalizedClientId = String(clientId || "").trim();
  const normalizedClientSecret = String(clientSecret || "").trim();
  if (!normalizedClientId || !normalizedClientSecret) {
    throw new Error("DCR token request is missing client credentials.");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: normalizedClientId,
    client_secret: normalizedClientSecret
  });
  const normalizedRequiredScope = String(requiredScope || "").trim();
  if (normalizedRequiredScope) {
    body.set("scope", normalizedRequiredScope);
  }

  const requestUrl = new URL(DCR_TOKEN_PATH, `${ADOBE_SP_BASE_URL.replace(/\/+$/, "")}/`).toString();
  const attempts = [
    {
      url: requestUrl,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    },
    {
      url: `${requestUrl}?${body.toString()}`,
      headers: {
        Accept: "application/json"
      },
      body: undefined
    }
  ];

  let lastError = `Unable to reach ${DCR_TOKEN_PATH}.`;
  for (const attempt of attempts) {
    let response;
    try {
      response = await fetch(attempt.url, {
        method: "POST",
        mode: "cors",
        headers: attempt.headers,
        ...(attempt.body !== undefined ? { body: attempt.body } : {})
      });
    } catch (error) {
      lastError = serializeError(error);
      continue;
    }

    const text = await response.text().catch(() => "");
    const parsed = parseDcrResponsePayload(text);
    if (!response.ok) {
      const message = extractConsoleErrorMessage(parsed, text);
      lastError = `${DCR_TOKEN_PATH} returned ${response.status}${message ? `: ${message}` : ""}`;
      continue;
    }

    const accessToken = firstNonEmptyString([parsed?.access_token, parsed?.accessToken]);
    if (!accessToken) {
      lastError = "DCR token response did not return an access_token.";
      continue;
    }

    const tokenClaims = decodeJwtPayload(accessToken) || null;
    const expiresInSeconds = Number(parsed?.expires_in || 0);
    const fallbackExpiresAt =
      Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
        ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
        : "";

    return {
      accessToken,
      tokenScope: firstNonEmptyString([parsed?.scope, tokenClaims?.scope, normalizedRequiredScope]),
      tokenRequestedScope: normalizedRequiredScope,
      tokenExpiresAt: deriveAccessTokenExpiresAt(accessToken, fallbackExpiresAt)
    };
  }

  throw new Error(lastError);
}

async function ensureVaultServiceClientHydrated(serviceRecord = null, definition = null) {
  return ensureVaultServiceClientHydratedWithContext(serviceRecord, definition, {});
}

async function ensureVaultServiceClientHydratedWithContext(serviceRecord = null, definition = null, hydrationContext = {}) {
  const normalizedDefinition = definition && typeof definition === "object" ? definition : null;
  const currentRecord = serviceRecord && typeof serviceRecord === "object" ? serviceRecord : {};
  let registeredApplication =
    currentRecord.registeredApplication && typeof currentRecord.registeredApplication === "object"
      ? currentRecord.registeredApplication
      : null;
  let nextCsrfToken = firstNonEmptyString([hydrationContext?.csrfToken, "NO-TOKEN"]);
  const nowIso = new Date().toISOString();
  if (!normalizedDefinition || !registeredApplication) {
    return {
      ...currentRecord,
      status: "unavailable"
    };
  }

  const nextClient = currentRecord.client && typeof currentRecord.client === "object"
    ? {
        ...currentRecord.client
      }
    : {};

  nextClient.serviceScope = normalizedDefinition.requiredScope;

  if (!nextClient.clientId || !nextClient.clientSecret) {
    const enrichmentResult = await settle(() =>
      enrichRegisteredApplicationForHydration(hydrationContext?.session, registeredApplication, {
        csrfToken: nextCsrfToken,
        pageContextTargetRef: hydrationContext?.pageContextTargetRef || null
      })
    );
    if (enrichmentResult.ok && enrichmentResult.value?.application) {
      registeredApplication = enrichmentResult.value.application;
      nextCsrfToken = firstNonEmptyString([enrichmentResult.value.csrfToken, nextCsrfToken]);
    }

    const softwareStatement = firstNonEmptyString([registeredApplication.softwareStatement]);
    if (!softwareStatement) {
      return {
        ...currentRecord,
        status: "partial",
        registeredApplication,
        client: {
          ...nextClient,
          updatedAt: nowIso,
          error: `${normalizedDefinition.label} software statement is unavailable.`
        }
      };
    }

    try {
      const registeredClient = await registerDcrClientWithSoftwareStatement(softwareStatement);
      nextClient.clientId = registeredClient.clientId;
      nextClient.clientSecret = registeredClient.clientSecret;
      nextClient.error = "";
    } catch (error) {
      return {
        ...currentRecord,
        status: "partial",
        registeredApplication,
        client: {
          ...nextClient,
          updatedAt: nowIso,
          error: serializeError(error)
        }
      };
    }
  }

  if (serviceClientNeedsTokenRefresh(nextClient, normalizedDefinition.requiredScope)) {
    try {
      const token = await requestDcrServiceAccessToken(
        nextClient.clientId,
        nextClient.clientSecret,
        normalizedDefinition.requiredScope
      );
      Object.assign(nextClient, token, {
        updatedAt: nowIso,
        error: ""
      });
    } catch (error) {
      return {
        ...currentRecord,
        status: "partial",
        registeredApplication,
        client: {
          ...nextClient,
          updatedAt: nowIso,
          error: serializeError(error)
        }
      };
    }
  } else {
    nextClient.updatedAt = firstNonEmptyString([nextClient.updatedAt, nowIso]);
    nextClient.error = "";
  }

  return {
    ...currentRecord,
    status: "ready",
    updatedAt: nowIso,
    registeredApplication,
    client: nextClient
  };
}

async function hydrateProgrammerVaultServiceClients(services = {}, serviceKeys = null, hydrationContext = {}) {
  const nextServices = services && typeof services === "object" ? { ...services } : {};
  const requestedServiceKeys = new Set(
    (Array.isArray(serviceKeys) ? serviceKeys : [])
      .map((serviceKey) => String(serviceKey || "").trim())
      .filter(Boolean)
  );
  const definitionsToHydrate = requestedServiceKeys.size > 0
    ? VAULT_DCR_SERVICE_DEFINITIONS.filter((definition) => requestedServiceKeys.has(definition.serviceKey))
    : VAULT_DCR_SERVICE_DEFINITIONS;
  const pageContextTargetRef =
    hydrationContext?.pageContextTargetRef && typeof hydrationContext.pageContextTargetRef === "object"
      ? hydrationContext.pageContextTargetRef
      : {
          target: null
        };
  let nextCsrfToken = firstNonEmptyString([
    hydrationContext?.csrfToken,
    hydrationContext?.session?.console?.csrfToken,
    "NO-TOKEN"
  ]);

  try {
    for (const definition of definitionsToHydrate) {
      const nextServiceRecord = await ensureVaultServiceClientHydratedWithContext(nextServices[definition.serviceKey], definition, {
        ...hydrationContext,
        csrfToken: nextCsrfToken,
        pageContextTargetRef
      });
      nextServices[definition.serviceKey] = nextServiceRecord;
    }
  } finally {
    await closeTemporaryAdobePageContextTarget(pageContextTargetRef.target?.temporaryTarget);
  }

  return nextServices;
}

function normalizeConsoleProgrammers(payload) {
  const entities = Array.isArray(payload?.entities) ? payload.entities : Array.isArray(payload) ? payload : [];
  const seen = new Set();
  const programmers = [];

  entities.forEach((entity, index) => {
    const entityData = entity?.entityData && typeof entity.entityData === "object" ? entity.entityData : entity;
    if (!entityData || typeof entityData !== "object") {
      return;
    }

    const id = firstNonEmptyString([entityData.id, entity?.id, entity?.key]);
    const name = firstNonEmptyString([
      entityData.displayName,
      entityData.name,
      entityData.label,
      entityData.title,
      id ? `Programmer ${id}` : `Programmer ${index + 1}`
    ]);
    const key = firstNonEmptyString([id, entity?.key, `programmer-${index + 1}`]);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    programmers.push({
      key,
      id,
      name,
      label:
        id &&
        normalizeOrganizationIdentifier(name) !== normalizeOrganizationIdentifier(id) &&
        normalizeOrganizationIdentifier(name) !== normalizeOrganizationIdentifier(`Programmer ${id}`)
          ? `${name} | ${id}`
          : name,
      owner: firstNonEmptyString([
        entityData.owner,
        entityData.organizationName,
        entityData.organizationId,
        entityData.orgId
      ]),
      requestorIds: Array.isArray(entityData.serviceProviders)
        ? entityData.serviceProviders.map((reference) => computeEntityReferenceId(reference)).filter(Boolean)
        : [],
      requestorCount: Array.isArray(entityData.serviceProviders) ? entityData.serviceProviders.filter(Boolean).length : 0,
      raw: entityData
    });
  });

  return programmers.sort((left, right) => {
    const leftLabel = firstNonEmptyString([left?.name, left?.label, left?.id]);
    const rightLabel = firstNonEmptyString([right?.name, right?.label, right?.id]);
    return leftLabel.localeCompare(rightLabel, undefined, {
      sensitivity: "base"
    });
  });
}

function normalizeConsoleRegisteredApplications(payload) {
  const entities = Array.isArray(payload?.entities) ? payload.entities : Array.isArray(payload) ? payload : [];
  const seen = new Set();
  const applications = [];

  entities.forEach((entity, index) => {
    const entityData = entity?.entityData && typeof entity.entityData === "object" ? entity.entityData : entity;
    if (!entityData || typeof entityData !== "object") {
      return;
    }

    const id = firstNonEmptyString([entityData.id, entity?.id, entity?.key]);
    const key = firstNonEmptyString([id, entity?.key, `registered-application-${index + 1}`]);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    const name = firstNonEmptyString([
      entityData.displayName,
      entityData.name,
      entityData.clientId,
      entityData.label,
      entityData.title,
      id ? `Registered Application ${id}` : `Registered Application ${index + 1}`
    ]);
    const clientId = firstNonEmptyString([entityData.clientId, entityData.client_id]);
    const rawScopes = Array.isArray(entityData.scopes) ? entityData.scopes.filter(Boolean) : [];
    const scopeLabels = buildRegisteredApplicationScopeLabels(rawScopes);
    applications.push({
      key,
      id,
      name,
      label: buildRegisteredApplicationLabel(name, scopeLabels, name),
      clientId,
      scopes: rawScopes,
      scopeLabels,
      type: firstNonEmptyString([entityData.type, entityData.applicationType]),
      softwareStatement: extractSoftwareStatementFromApplicationData(entityData),
      raw: entityData
    });
  });

  return applications.sort((left, right) => {
    const leftLabel = firstNonEmptyString([left?.name, left?.label, left?.id]);
    const rightLabel = firstNonEmptyString([right?.name, right?.label, right?.id]);
    return leftLabel.localeCompare(rightLabel, undefined, {
      sensitivity: "base"
    });
  });
}

function programmerMatchesCmTenant(selectedProgrammer = null, cmTenants = []) {
  if (!selectedProgrammer || typeof selectedProgrammer !== "object") {
    return false;
  }

  const programmerIdentifiers = new Set(
    [
      selectedProgrammer.id,
      selectedProgrammer.name,
      selectedProgrammer.label,
      selectedProgrammer.key,
      selectedProgrammer?.raw?.displayName,
      selectedProgrammer?.raw?.name
    ]
      .map((value) => normalizeOrganizationIdentifier(value))
      .filter(Boolean)
  );

  if (programmerIdentifiers.size === 0) {
    return false;
  }

  return (Array.isArray(cmTenants) ? cmTenants : []).some((tenant) =>
    [
      tenant?.id,
      tenant?.name,
      tenant?.label,
      tenant?.key,
      tenant?.raw?.payload?.name,
      tenant?.raw?.consoleId
    ]
      .map((value) => normalizeOrganizationIdentifier(value))
      .filter(Boolean)
      .some((identifier) => programmerIdentifiers.has(identifier))
  );
}

function derivePremiumServicesSummary({
  selectedProgrammer = null,
  registeredApplications = [],
  registeredApplicationLoading = false,
  cmTenants = [],
  selectedRegisteredApplication = null,
  vaultRecord = null
} = {}) {
  if (!selectedProgrammer || typeof selectedProgrammer !== "object") {
    return {
      labels: [],
      items: [],
      loading: false,
      summary: "Choose a Programmer first"
    };
  }

  if (registeredApplicationLoading) {
    return {
      labels: [],
      items: [],
      loading: true,
      summary: "Loading premium services…"
    };
  }

  const normalizedApplications = Array.isArray(registeredApplications) ? registeredApplications : [];
  const items = [];
  const labels = [];

  PREMIUM_SERVICE_SCOPE_RULES.forEach((rule) => {
    const vaultServiceDefinition = VAULT_DCR_SERVICE_DEFINITIONS.find(
      (definition) => definition.requiredScope === rule.scope
    );
    const vaultServiceRecord = vaultServiceDefinition ? vaultRecord?.services?.[vaultServiceDefinition.serviceKey] : null;
    const vaultRegisteredApplication =
      vaultServiceRecord?.registeredApplication && typeof vaultServiceRecord.registeredApplication === "object"
        ? vaultServiceRecord.registeredApplication
        : null;
    const matchingApplication = normalizedApplications.find((application) =>
      registeredApplicationMatchesRequiredScope(application, rule.scope)
    );
    if (!matchingApplication && !vaultRegisteredApplication) {
      return;
    }

    const selectedApplicationMatchesScope = registeredApplicationMatchesRequiredScope(
      selectedRegisteredApplication,
      rule.scope
    );
    const effectiveApplication = selectedApplicationMatchesScope
      ? selectedRegisteredApplication
      : matchingApplication || vaultRegisteredApplication;

    const applicationName = firstNonEmptyString([
      effectiveApplication?.name,
      effectiveApplication?.label,
      effectiveApplication?.id,
      rule.label
    ]);
    const selectedApplicationName = selectedApplicationMatchesScope
      ? firstNonEmptyString([
          selectedRegisteredApplication?.name,
          selectedRegisteredApplication?.label,
          selectedRegisteredApplication?.id
        ])
      : firstNonEmptyString([
          vaultRegisteredApplication?.name,
          vaultRegisteredApplication?.label,
          vaultRegisteredApplication?.id
    ]);
    labels.push(rule.label);
    items.push({
      key: `${firstNonEmptyString([vaultServiceDefinition?.serviceKey, rule.scope])}:${applicationName}`,
      serviceKey: firstNonEmptyString([vaultServiceDefinition?.serviceKey]),
      label: rule.label,
      requiredScope: rule.scope,
      registeredApplicationId: firstNonEmptyString([effectiveApplication?.id, effectiveApplication?.key]),
      applicationName,
      selectedApplicationName,
      serviceStatus: firstNonEmptyString([vaultServiceRecord?.status, effectiveApplication ? "pending" : "unavailable"])
    });
  });

  const matchedCmTenants = matchProgrammerCmTenants(selectedProgrammer, cmTenants);
  const vaultCmService = vaultRecord?.services?.cm && typeof vaultRecord.services.cm === "object" ? vaultRecord.services.cm : null;
  if (matchedCmTenants.length > 0 || vaultCmService?.available === true) {
    const fallbackApplicationName = firstNonEmptyString([
      normalizedApplications[0]?.name,
      normalizedApplications[0]?.label,
      normalizedApplications[0]?.id,
      selectedProgrammer?.name,
      selectedProgrammer?.id,
      PREMIUM_SERVICE_CONCURRENCY_LABEL
    ]);
    const selectedApplicationName = firstNonEmptyString([
      selectedRegisteredApplication?.name,
      selectedRegisteredApplication?.label,
      selectedRegisteredApplication?.id
    ]);
    labels.push(PREMIUM_SERVICE_CONCURRENCY_LABEL);
    items.push({
      key: `${PREMIUM_SERVICE_CONCURRENCY_LABEL}:${fallbackApplicationName}`,
      serviceKey: "cm",
      label: PREMIUM_SERVICE_CONCURRENCY_LABEL,
      applicationName: fallbackApplicationName,
      selectedApplicationName,
      serviceStatus: firstNonEmptyString([vaultCmService?.status, matchedCmTenants.length > 0 ? "ready" : "pending"]),
      matchedTenantCount: Math.max(
        matchedCmTenants.length,
        Number(vaultCmService?.matchedTenantCount || 0)
      )
    });
  }

  return {
    labels,
    items,
    loading: false,
    summary: labels.length > 0 ? labels.join(" | ") : "No premium services detected"
  };
}

function normalizeCmTenants(payload) {
  const entities = Array.isArray(payload) ? payload : [];
  const seen = new Set();
  const tenants = [];

  entities.forEach((entity, index) => {
    if (!entity || typeof entity !== "object") {
      return;
    }

    const payloadData = entity?.payload && typeof entity.payload === "object" ? entity.payload : {};
    const id = firstNonEmptyString([entity.consoleId, payloadData.id, payloadData.name]);
    const key = firstNonEmptyString([id, `cm-tenant-${index + 1}`]);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    const name = firstNonEmptyString([payloadData.name, id, `CM Tenant ${index + 1}`]);
    tenants.push({
      key,
      id,
      name,
      label:
        id &&
        normalizeOrganizationIdentifier(name) !== normalizeOrganizationIdentifier(id) &&
        normalizeOrganizationIdentifier(name) !== normalizeOrganizationIdentifier(`CM Tenant ${id}`)
          ? `${name} | ${id}`
          : name,
      type: firstNonEmptyString([payloadData.type]),
      ownerId: firstNonEmptyString([entity.consoleOwnerId]),
      raw: entity
    });
  });

  return tenants.sort((left, right) => {
    const leftLabel = firstNonEmptyString([left?.name, left?.label, left?.id]);
    const rightLabel = firstNonEmptyString([right?.name, right?.label, right?.id]);
    return leftLabel.localeCompare(rightLabel, undefined, {
      sensitivity: "base"
    });
  });
}

function render() {
  const session = state.session;
  const ready = state.ready === true;
  const activeTheme = normalizeThemePreference(state.theme);
  const activeAccent = getThemeAccentMeta(activeTheme.accent);
  const hasRuntimeConfig = Boolean(firstNonEmptyString([state.runtimeConfig?.clientId]));
  const hasSession = Boolean(session?.accessToken);
  const profile = session?.profile && typeof session.profile === "object" ? session.profile : null;
  const idClaims = session?.idTokenClaims || null;
  const authenticatedDataContext = buildAuthenticatedUserDataContext(session);
  const detectedOrganizationContext = buildAuthenticatedOrganizationPickerContext(session);
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
  const activeOrganization = authenticatedDataContext.activeOrganization;
  const nextThemeStop = getNextThemeStop(activeTheme.stop);
  const isThemeProcessing = isThemeActivityActive();
  const initials = deriveInitials(name, email);
  const flow = session?.flow && typeof session.flow === "object" ? session.flow : {};
  const avatarMenuAvailable = hasSession;
  const isAvatarMenuVisible = avatarMenuAvailable && state.avatarMenuOpen;
  const statusLabel = getStatusLabel(hasSession, expired, flow);

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
  setupView.hidden = hasRuntimeConfig;
  loggedOutView.hidden = !hasRuntimeConfig || hasSession;
  authenticatedView.hidden = !hasRuntimeConfig || !hasSession;
  zipKeyDropSurface.classList.toggle("is-drag-active", state.dragActive);
  zipKeyDropOverlay.hidden = !state.dragActive;

  zipKeyStatus.textContent = state.configStatus.message || DEFAULT_CONFIG_STATUS_MESSAGE;
  zipKeyStatus.classList.toggle("is-error", state.configStatus.tone === "error");
  zipKeyStatus.classList.toggle("is-ok", state.configStatus.tone === "ok");

  loginButton.disabled = !hasRuntimeConfig;
  loginButton.setAttribute("aria-busy", state.busy ? "true" : "false");
  loginButton.classList.toggle("is-busy", state.busy);
  loginButtonLabel.textContent = state.busy
    ? state.silentAuthInFlight
      ? "REFRESHING…"
      : "SIGNING IN…"
    : "SIGN IN";
  if (loginStatus) {
    loginStatus.textContent = "";
    loginStatus.hidden = true;
  }
  avatarMenuButton.disabled = !avatarMenuAvailable;
  avatarMenuButton.setAttribute("aria-expanded", isAvatarMenuVisible ? "true" : "false");
  avatarMenu.hidden = !isAvatarMenuVisible;
  loadZipKeyButton.disabled = state.busy;
  syncAvatarMenuUpdateAction();
  logoutButton.disabled = state.busy || !hasSession;
  if (exportVaultButton) {
    exportVaultButton.disabled = state.busy || state.vaultTransferBusy;
    exportVaultButton.setAttribute("aria-busy", state.vaultTransferBusy ? "true" : "false");
  }
  if (importVaultButton) {
    importVaultButton.disabled = state.busy || state.vaultTransferBusy;
    importVaultButton.setAttribute("aria-busy", state.vaultTransferBusy ? "true" : "false");
  }
  if (vaultTransferStatus) {
    vaultTransferStatus.textContent = firstNonEmptyString([
      state.vaultTransferStatus?.message,
      DEFAULT_VAULT_TRANSFER_STATUS_MESSAGE
    ]);
    vaultTransferStatus.classList.toggle("is-ok", state.vaultTransferStatus?.tone === "ok");
    vaultTransferStatus.classList.toggle("is-error", state.vaultTransferStatus?.tone === "error");
  }
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

  if (identityHeadlineLabel) {
    identityHeadlineLabel.textContent = "Logged in Adobe user";
  }
  if (mainIdentityCopy) {
    mainIdentityCopy.hidden = true;
  }
  displayNameLink.textContent = name;
  displayNameLink.href = buildExperienceOrgUrl(activeOrganization);
  displayNameLink.title = buildExperienceOrgTitle(activeOrganization);
  displayEmail.textContent = authenticatedDataContext.identityMeta || "Adobe account";
  if (avatarMenuIdentityLabel) {
    avatarMenuIdentityLabel.textContent = "Logged in Adobe user";
  }
  if (avatarMenuDisplayName) {
    avatarMenuDisplayName.textContent = name;
    avatarMenuDisplayName.href = buildExperienceOrgUrl(activeOrganization);
    avatarMenuDisplayName.title = buildExperienceOrgTitle(activeOrganization);
  }
  if (avatarMenuDisplayMeta) {
    avatarMenuDisplayMeta.textContent = authenticatedDataContext.identityMeta || "Adobe account";
  }
  if (organizationListSummary) {
    organizationListSummary.textContent = authenticatedDataContext.cardSummary;
  }
  if (organizationPickerMeta) {
    organizationPickerMeta.textContent = authenticatedDataContext.panelMeta;
  }
  if (organizationSwitchHelp) {
    organizationSwitchHelp.textContent = detectedOrganizationContext.help;
  }
  syncAuthenticatedMainContentLayout(authenticatedDataContext);
  syncAuthenticatedSummaryCards(authenticatedDataContext.summaryCards);
  syncDetectedOrganizationPicker(detectedOrganizationContext);
  syncCmuTokenRow(authenticatedDataContext);
  syncCmTenantPicker(authenticatedDataContext);
  syncProgrammerPicker(authenticatedDataContext);
  syncRegisteredApplicationPicker(authenticatedDataContext);
  syncRequestorPicker(authenticatedDataContext);
  syncPremiumServicesSummary(authenticatedDataContext);
  syncAuthenticatedFieldGroups();
  syncHarpoSection(authenticatedDataContext);
  syncUserDataList(authenticatedDataContext.userDataEntries, authenticatedDataContext.userDataSummary);
  syncAvatarMenuDetails(authenticatedDataContext, statusLabel);

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

function buildAuthenticatedUserDataContext(session = state.session) {
  const currentSession = session && typeof session === "object" ? session : null;
  const profile = currentSession?.profile && typeof currentSession.profile === "object" ? currentSession.profile : null;
  const idClaims = currentSession?.idTokenClaims || null;
  const imsSession = currentSession?.imsSession && typeof currentSession.imsSession === "object" ? currentSession.imsSession : {};
  const organizationContext = buildOrganizationContextFromSession(currentSession);
  const activeOrganization = organizationContext.activeOrganization;
  const consoleContext = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const cmContext = currentSession?.cm && typeof currentSession.cm === "object" ? currentSession.cm : {};
  const unifiedShellContext =
    currentSession?.unifiedShell && typeof currentSession.unifiedShell === "object" ? currentSession.unifiedShell : {};
  const programmerAccess = consoleContext?.programmerAccess || resolveProgrammerAccessContext(currentSession);
  const adobePassWorkflowActive = programmerAccess.activeIsAdobePass === true;
  const roles = Array.isArray(consoleContext.roles) ? consoleContext.roles.filter(Boolean) : [];
  const channels = Array.isArray(consoleContext.channels) ? consoleContext.channels.filter(Boolean) : [];
  const applicationsByProgrammer =
    consoleContext?.applicationsByProgrammer && typeof consoleContext.applicationsByProgrammer === "object"
      ? consoleContext.applicationsByProgrammer
      : {};
  const cmuTokenHeaderName = programmerAccess.eligible
    ? firstNonEmptyString([cmContext.cmuTokenHeaderName, CMU_TOKEN_HEADER_NAME])
    : "";
  const cmuTokenHeaderValue = programmerAccess.eligible ? firstNonEmptyString([cmContext.cmuTokenHeaderValue]) : "";
  const cmTenants = programmerAccess.eligible && Array.isArray(cmContext.tenants) ? cmContext.tenants : [];
  const selectedCmTenant = programmerAccess.eligible ? resolveSelectedCmTenant(cmTenants, state.selectedCmTenantId) : null;
  const programmers = programmerAccess.eligible && Array.isArray(consoleContext.programmers) ? consoleContext.programmers : [];
  const selectedProgrammer = programmerAccess.eligible ? resolveSelectedProgrammer(programmers, state.selectedProgrammerId) : null;
  const selectedProgrammerVaultRecord =
    selectedProgrammer &&
    String(state.selectedProgrammerVaultRecord?.programmerId || "").trim() === String(selectedProgrammer?.id || "").trim()
      ? state.selectedProgrammerVaultRecord
      : null;
  const registeredApplications = programmerAccess.eligible
    ? resolveSelectedProgrammerApplications(applicationsByProgrammer, selectedProgrammer)
    : [];
  const selectedRegisteredApplication = programmerAccess.eligible
    ? resolveSelectedRegisteredApplication(registeredApplications, state.selectedRegisteredApplicationId)
    : null;
  const premiumServices = programmerAccess.eligible
    ? derivePremiumServicesSummary({
        selectedProgrammer,
        registeredApplications,
        registeredApplicationLoading:
          Boolean(selectedProgrammer) &&
          normalizeOrganizationIdentifier(state.programmerApplicationsLoadingFor) === normalizeOrganizationIdentifier(selectedProgrammer?.id),
        cmTenants,
        selectedRegisteredApplication,
        vaultRecord: selectedProgrammerVaultRecord
      })
    : { labels: [], loading: false, summary: "" };
  const requestors = programmerAccess.eligible ? deriveProgrammerRequestorOptions(channels, selectedProgrammer) : [];
  const selectedRequestor = programmerAccess.eligible ? resolveSelectedRequestor(requestors, state.selectedRequestorId) : null;
  const name =
    firstNonEmptyString([
      profile?.name,
      profile?.displayName,
      profile?.given_name && profile?.family_name ? `${profile.given_name} ${profile.family_name}` : "",
      idClaims?.name
    ]) || "Adobe user";
  const email =
    firstNonEmptyString([
      profile?.email,
      profile?.user_email,
      profile?.emailAddress,
      profile?.additional_info?.email,
      idClaims?.email
    ]) || "Email not returned";
  const identityMeta = firstNonEmptyString([activeOrganization.name, "Adobe organization unavailable"]);
  const menuMeta = [
    activeOrganization.id ? `Org ID ${activeOrganization.id}` : firstNonEmptyString([activeOrganization.meta]),
    firstNonEmptyString([consoleContext.environmentLabel]),
    programmerAccess.eligible ? (cmuTokenHeaderValue ? "CMU token ready" : "CMU token pending") : "",
    programmerAccess.eligible && cmTenants.length > 0 ? `${cmTenants.length} CM tenant${cmTenants.length === 1 ? "" : "s"}` : "",
    programmerAccess.eligible && programmers.length > 0 ? `${programmers.length} programmer${programmers.length === 1 ? "" : "s"}` : "",
    programmerAccess.eligible && registeredApplications.length > 0
      ? `${registeredApplications.length} registered app${registeredApplications.length === 1 ? "" : "s"}`
      : "",
    programmerAccess.eligible && requestors.length > 0 ? `${requestors.length} requestor${requestors.length === 1 ? "" : "s"}` : "",
    !programmerAccess.eligible ? `Programmers require ${programmerAccess.requiredLabel}` : "",
    roles.length > 0 ? roles.join(", ") : ""
  ]
    .filter(Boolean)
    .join(" | ");
  const panelMeta = adobePassWorkflowActive
    ? [
        consoleContext.transport ? "Adobe Pass console live" : "Adobe Pass console pending",
        cmuTokenHeaderValue ? "CMU token ready" : "CMU token pending",
        cmTenants.length > 0 ? `CM tenants ${cmTenants.length}` : firstNonEmptyString([cmContext.status, "CM pending"]),
        programmers.length > 0 ? `Programmers ${programmers.length}` : firstNonEmptyString([consoleContext.status, "Programmers pending"]),
        selectedProgrammer
          ? state.programmerApplicationsLoadingFor === selectedProgrammer.id
            ? "Registered Applications loading"
            : `Registered Applications ${registeredApplications.length}`
          : "Choose a programmer to load registered applications",
        selectedProgrammer ? `Content providers ${requestors.length}` : "Choose a programmer to load content providers"
      ]
        .filter(Boolean)
        .join(" | ")
    : "";

  return {
    activeOrganization,
    consoleContext,
    cmContext,
    unifiedShellContext,
    programmerAccess,
    cmuTokenHeaderName,
    cmuTokenHeaderValue,
    selectedCmTenant,
    selectedProgrammer,
    selectedRegisteredApplication,
    selectedRequestor,
    cmuTokenVisible: programmerAccess.eligible,
    cmTenantOptions: cmTenants,
    cmTenantPickerVisible: programmerAccess.eligible,
    programmerOptions: programmers,
    programmerPickerVisible: programmerAccess.eligible,
    registeredApplicationOptions: registeredApplications,
    registeredApplicationPickerVisible: programmerAccess.eligible,
    registeredApplicationLoading:
      Boolean(selectedProgrammer) &&
      normalizeOrganizationIdentifier(state.programmerApplicationsLoadingFor) === normalizeOrganizationIdentifier(selectedProgrammer?.id),
    premiumServicesVisible: programmerAccess.eligible,
    premiumServicesSummary: firstNonEmptyString([premiumServices?.summary]),
    premiumServiceItems: Array.isArray(premiumServices?.items) ? premiumServices.items : [],
    requestorOptions: requestors,
    requestorPickerVisible: programmerAccess.eligible,
    workflowMode: adobePassWorkflowActive ? "adobe-pass" : "org-switch-only",
    showHero: true,
    showOrganizationMeta: false,
    identityMeta,
    menuMeta: menuMeta || "Awaiting Adobe organization context.",
    panelMeta: panelMeta || "Awaiting session.",
    programmerHelp: buildProgrammerHelpText(consoleContext, programmers, programmerAccess),
    cardSummary: "",
    summaryCards: [],
    userDataEntries: [],
    userDataSummary: ""
  };
}

function buildAuthenticatedSummaryCards({
  currentSession,
  profile,
  name,
  email,
  imsSession,
  activeOrganization,
  organizationContext,
  consoleContext,
  cmContext,
  unifiedShellContext,
  programmerAccess,
  roles,
  channels,
  cmuTokenHeaderName,
  cmuTokenHeaderValue,
  cmTenants,
  selectedCmTenant,
  requestors,
  selectedRequestor,
  selectedProgrammer,
  programmers
}) {
  const accountType = firstNonEmptyString([
    profile?.additional_info?.account_type,
    profile?.account_type,
    profile?.accountType
  ]);
  const jobFunction = firstNonEmptyString([
    profile?.additional_info?.job_function,
    profile?.job_function,
    profile?.jobFunction
  ]);

  return [
    {
      title: "IMS Identity",
      items: [
        { label: "Name", value: name },
        { label: "Email", value: email },
        { label: "User ID", value: firstNonEmptyString([imsSession.userId, currentSession?.accessTokenClaims?.sub, currentSession?.idTokenClaims?.sub, "Not returned"]) },
        { label: "Auth ID", value: firstNonEmptyString([imsSession.authId, "Not returned"]) }
      ]
    },
    {
      title: "Avatar",
      items: [
        { label: "Loaded as image", value: state.avatarAsset.displayUrl ? "Yes" : "No" },
        { label: "Mode", value: firstNonEmptyString([state.avatarAsset.mode, "fallback"]) },
        { label: "Source URL", value: firstNonEmptyString([state.avatarAsset.sourceUrl, currentSession?.avatarUrl, "Not returned"]) },
        { label: "Display URL", value: firstNonEmptyString([state.avatarAsset.displayUrl, "Not returned"]) }
      ]
    },
    {
      title: "Scope + Org",
      items: [
        { label: "Requested scope", value: firstNonEmptyString([currentSession?.flow?.scope, IMS_SCOPE]) },
        { label: "Granted scope", value: firstNonEmptyString([currentSession?.scope, "Not returned"]) },
        { label: "Active org", value: firstNonEmptyString([activeOrganization.name, "Not resolved"]) },
        { label: "Detected orgs", value: String(Array.isArray(organizationContext?.options) ? organizationContext.options.length : 0) }
      ]
    },
    {
      title: "Unified Shell",
      items: [
        { label: "Status", value: firstNonEmptyString([unifiedShellContext.status, "Not loaded"]) },
        { label: "Selected org", value: firstNonEmptyString([unifiedShellContext.selectedOrg, "Not returned"]) },
        { label: "Cluster rows", value: String(Number(unifiedShellContext.clusterCount || 0)) },
        {
          label: "Shell user profile",
          value: unifiedShellContext.userProfile && typeof unifiedShellContext.userProfile === "object" ? "Returned" : "Not returned"
        }
      ]
    },
    {
      title: "Profile Extras",
      items: [
        { label: "Account type", value: firstNonEmptyString([accountType, "Not returned"]) },
        { label: "Job function", value: firstNonEmptyString([jobFunction, "Not returned"]) },
        {
          label: "Profile source",
          value: currentSession?.profile ? "Merged userinfo + IMS profile" : "Not returned"
        },
        { label: "Session expires", value: firstNonEmptyString([currentSession?.expiresAt, "Not returned"]) }
      ]
    },
    {
      title: "Console Access",
      items: [
        { label: "Environment", value: firstNonEmptyString([consoleContext.environmentLabel, "Not loaded"]) },
        { label: "Base URL", value: firstNonEmptyString([consoleContext.baseUrl, "Not loaded"]) },
        { label: "Transport", value: firstNonEmptyString([consoleContext.transport, "Not loaded"]) },
        { label: "Frame origin", value: firstNonEmptyString([consoleContext.pageContextOrigin, "Not returned"]) },
        { label: "Config version", value: firstNonEmptyString([consoleContext.configurationVersion, "Unavailable"]) },
        { label: "Roles", value: roles.length > 0 ? roles.join(", ") : "No roles returned" }
      ]
    },
    {
      title: "Channels + CM",
      items: [
        { label: "Adobe Pass channels", value: String(channels.length) },
        {
          label: "CMU token",
          value: programmerAccess?.eligible ? (cmuTokenHeaderValue ? "Ready" : "Not returned") : "Hidden until Adobe Pass org is active"
        },
        {
          label: "CMU header",
          value: programmerAccess?.eligible ? firstNonEmptyString([cmuTokenHeaderName, CMU_TOKEN_HEADER_NAME]) : "Unavailable"
        },
        {
          label: "CMU reports",
          value: programmerAccess?.eligible ? firstNonEmptyString([cmContext?.reportsStatus, "Not verified"]) : "Unavailable"
        },
        { label: "CM tenants", value: programmerAccess?.eligible ? String(cmTenants.length) : "Hidden until Adobe Pass org is active" },
        {
          label: "Selected CM tenant",
          value: programmerAccess?.eligible ? firstNonEmptyString([selectedCmTenant?.label, "Not selected"]) : "Unavailable"
        },
        { label: "CM status", value: programmerAccess?.eligible ? firstNonEmptyString([cmContext?.status, "Not loaded"]) : "Unavailable" }
      ]
    },
    {
      title: "Programmers",
      items: [
        {
          label: "Availability",
          value: programmerAccess?.eligible
            ? "Adobe Pass org selected"
            : firstNonEmptyString([programmerAccess?.requiredLabel, ADOBE_PASS_DISPLAY_NAME])
        },
        {
          label: "Count",
          value: programmerAccess?.eligible ? String(programmers.length) : "Hidden until Adobe Pass org is active"
        },
        {
          label: "Selected",
          value: programmerAccess?.eligible ? firstNonEmptyString([selectedProgrammer?.label, "Not selected"]) : "Unavailable"
        },
        {
          label: "Programmer ID",
          value: programmerAccess?.eligible ? firstNonEmptyString([selectedProgrammer?.id, "Not selected"]) : "Unavailable"
        },
        {
          label: "RequestorIds",
          value:
            programmerAccess?.eligible && selectedProgrammer
              ? String(requestors.length)
              : programmerAccess?.eligible
                ? "Choose a programmer first"
                : "Unavailable"
        },
        {
          label: "Selected RequestorId",
          value:
            programmerAccess?.eligible && selectedProgrammer
              ? firstNonEmptyString([selectedRequestor?.label, "Not selected"])
              : programmerAccess?.eligible
                ? "Choose a programmer first"
                : "Unavailable"
        }
      ]
    }
  ];
}

function buildProgrammerHelpText(consoleContext = {}, programmers = [], programmerAccess = {}) {
  if (programmerAccess?.eligible !== true) {
    return firstNonEmptyString([
      programmerAccess?.reason,
      `Switch Adobe Org to ${firstNonEmptyString([programmerAccess?.requiredLabel, ADOBE_PASS_DISPLAY_NAME])} to load programmers.`
    ]);
  }
  if (consoleContext?.errors?.programmers) {
    return `Programmers could not be loaded from ${firstNonEmptyString([consoleContext.baseUrl, "the configured console endpoint"])}: ${consoleContext.errors.programmers}`;
  }
  if (programmers.length === 0) {
    return `No programmers were returned from ${firstNonEmptyString([consoleContext.baseUrl, "the configured console endpoint"])}.`;
  }

  return `Programmers load from ${firstNonEmptyString([consoleContext.baseUrl, "Adobe Pass console"])} using the live console contract: /user/extendedProfile, /config/latestActivatedConsoleConfigurationVersion, and /entity/Programmer?configurationVersion=<version>.`;
}

function resolveSelectedProgrammer(programmers = [], selectedProgrammerId = "") {
  const options = Array.isArray(programmers) ? programmers : [];
  const selectedId = String(selectedProgrammerId || "").trim();
  return options.find((option) => option.key === selectedId || option.id === selectedId) || null;
}

function resolveSelectedCmTenant(cmTenants = [], selectedCmTenantId = "") {
  const options = Array.isArray(cmTenants) ? cmTenants : [];
  const selectedId = String(selectedCmTenantId || "").trim();
  return options.find((option) => option.key === selectedId || option.id === selectedId) || options[0] || null;
}

function resolveSelectedProgrammerApplications(applicationsByProgrammer = {}, selectedProgrammer = null) {
  if (!selectedProgrammer || typeof selectedProgrammer !== "object") {
    return [];
  }

  const normalizedProgrammerId = String(firstNonEmptyString([selectedProgrammer.id, selectedProgrammer.key]) || "").trim();
  if (!normalizedProgrammerId || !applicationsByProgrammer || typeof applicationsByProgrammer !== "object") {
    return [];
  }

  return Array.isArray(applicationsByProgrammer[normalizedProgrammerId]) ? applicationsByProgrammer[normalizedProgrammerId] : [];
}

function resolveSelectedRegisteredApplication(applications = [], selectedApplicationId = "") {
  const options = Array.isArray(applications) ? applications : [];
  const selectedId = String(selectedApplicationId || "").trim();
  return options.find((option) => option.key === selectedId || option.id === selectedId) || null;
}

function deriveProgrammerRequestorOptions(channels = [], selectedProgrammer = null) {
  if (!selectedProgrammer || typeof selectedProgrammer !== "object") {
    return [];
  }

  const normalizedProgrammerId = normalizeOrganizationIdentifier(selectedProgrammer.id);
  const channelOptions = Array.isArray(channels) ? channels : [];
  const rawServiceProviders = Array.isArray(selectedProgrammer?.raw?.serviceProviders)
    ? selectedProgrammer.raw.serviceProviders
    : Array.isArray(selectedProgrammer?.requestorIds)
      ? selectedProgrammer.requestorIds
      : [];
  const referencedRequestorIds = new Set(
    rawServiceProviders
      .map((reference) => computeEntityReferenceId(reference))
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  const seen = new Set();
  const requestors = [];

  const pushRequestor = (option) => {
    if (!option || typeof option !== "object") {
      return;
    }

    const id = String(firstNonEmptyString([option.id, option.key]) || "").trim();
    const key = String(firstNonEmptyString([option.key, id]) || "").trim();
    if (!id || !key) {
      return;
    }

    const dedupeKey = key.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    requestors.push({
      key,
      id,
      name: firstNonEmptyString([option.name, option.label, id]) || id,
      label: firstNonEmptyString([option.label, option.name, id]) || id,
      programmerId: firstNonEmptyString([option.programmerId, selectedProgrammer.id]),
      raw: option.raw || option
    });
  };

  channelOptions.forEach((channel) => {
    const channelProgrammerId = normalizeOrganizationIdentifier(channel?.programmerId);
    const channelId = String(channel?.id || "").trim();
    const matchesProgrammer =
      normalizedProgrammerId && channelProgrammerId && channelProgrammerId === normalizedProgrammerId;
    const matchesReference = channelId && referencedRequestorIds.has(channelId);
    if (matchesProgrammer || matchesReference) {
      pushRequestor(channel);
    }
  });

  referencedRequestorIds.forEach((requestorId) => {
    pushRequestor({
      key: requestorId,
      id: requestorId,
      name: requestorId,
      label: requestorId,
      programmerId: selectedProgrammer.id,
      raw: {
        id: requestorId,
        programmer: selectedProgrammer.id
      }
    });
  });

  return requestors.sort((left, right) =>
    firstNonEmptyString([left?.label, left?.name, left?.id]).localeCompare(
      firstNonEmptyString([right?.label, right?.name, right?.id]),
      undefined,
      { sensitivity: "base" }
    )
  );
}

function resolveSelectedRequestor(requestors = [], selectedRequestorId = "") {
  const options = Array.isArray(requestors) ? requestors : [];
  const selectedId = String(selectedRequestorId || "").trim();
  return options.find((option) => option.key === selectedId || option.id === selectedId) || null;
}

function buildProgrammerVaultLookupContext(session = null, programmerId = "") {
  const normalizedProgrammerId = String(programmerId || "").trim();
  const currentSession = session && typeof session === "object" ? session : null;
  const consoleContext = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const programmers = Array.isArray(consoleContext.programmers) ? consoleContext.programmers : [];
  const selectedProgrammer = resolveSelectedProgrammer(programmers, normalizedProgrammerId);
  const environmentId = firstNonEmptyString([
    consoleContext.environmentId,
    state.runtimeConfig?.consoleEnvironment,
    CONSOLE_DEFAULT_ENVIRONMENT
  ]);
  if (!selectedProgrammer || !environmentId || !normalizedProgrammerId) {
    return null;
  }

  return {
    environmentId,
    programmerId: normalizedProgrammerId,
    configurationVersion: firstNonEmptyString([consoleContext.configurationVersion]),
    consoleBaseUrl: firstNonEmptyString([consoleContext.baseUrl]),
    programmerFingerprint: buildProgrammerVaultFingerprint(selectedProgrammer)
  };
}

function buildProgrammerVaultSnapshotContext(session = null, programmerId = "", { registeredApplications = null } = {}) {
  const normalizedProgrammerId = String(programmerId || "").trim();
  const currentSession = session && typeof session === "object" ? session : null;
  const consoleContext = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const cmContext = currentSession?.cm && typeof currentSession.cm === "object" ? currentSession.cm : {};
  const programmers = Array.isArray(consoleContext.programmers) ? consoleContext.programmers : [];
  const selectedProgrammer = resolveSelectedProgrammer(programmers, normalizedProgrammerId);
  if (!selectedProgrammer) {
    return null;
  }

  const applicationsByProgrammer =
    consoleContext?.applicationsByProgrammer && typeof consoleContext.applicationsByProgrammer === "object"
      ? consoleContext.applicationsByProgrammer
      : {};
  const hasHydratedApplications =
    Array.isArray(registeredApplications)
      || Object.prototype.hasOwnProperty.call(applicationsByProgrammer, normalizedProgrammerId);
  const effectiveRegisteredApplications = Array.isArray(registeredApplications)
    ? registeredApplications
    : resolveSelectedProgrammerApplications(applicationsByProgrammer, selectedProgrammer);
  const channels = Array.isArray(consoleContext.channels) ? consoleContext.channels : [];
  const requestors = deriveProgrammerRequestorOptions(channels, selectedProgrammer);
  const cmTenants = Array.isArray(cmContext.tenants) ? cmContext.tenants : [];
  const selectedRegisteredApplication = resolveSelectedRegisteredApplication(
    effectiveRegisteredApplications,
    state.selectedRegisteredApplicationId
  );
  const premiumServices = derivePremiumServicesSummary({
    selectedProgrammer,
    registeredApplications: effectiveRegisteredApplications,
    cmTenants,
    selectedRegisteredApplication
  });

  return {
    currentSession,
    consoleContext,
    cmContext,
    selectedProgrammer,
    selectedRegisteredApplication,
    registeredApplicationsHydrated: hasHydratedApplications,
    registeredApplications: effectiveRegisteredApplications,
    requestors,
    premiumServices,
    environmentId: firstNonEmptyString([
      consoleContext.environmentId,
      state.runtimeConfig?.consoleEnvironment,
      CONSOLE_DEFAULT_ENVIRONMENT
    ]),
    environmentLabel: firstNonEmptyString([
      consoleContext.environmentLabel,
      getConsoleEnvironmentMeta(
        firstNonEmptyString([
          consoleContext.environmentId,
          state.runtimeConfig?.consoleEnvironment,
          CONSOLE_DEFAULT_ENVIRONMENT
        ])
      ).label
    ])
  };
}

function resolveVaultSelectedRegisteredApplicationId(applications = [], selectedApplicationId = "") {
  const persistedSelection = resolvePersistedSelectionId(applications, selectedApplicationId);
  if (persistedSelection) {
    return persistedSelection;
  }

  const firstApplication = Array.isArray(applications) ? applications[0] : null;
  return firstNonEmptyString([firstApplication?.key, firstApplication?.id]);
}

async function buildProgrammerVaultSnapshotInput(
  session = null,
  programmerId = "",
  { registeredApplications = null, source = "network", serviceKeys = null } = {}
) {
  const snapshotContext = buildProgrammerVaultSnapshotContext(session, programmerId, {
    registeredApplications
  });
  if (!snapshotContext?.selectedProgrammer || !snapshotContext.environmentId || !snapshotContext.registeredApplicationsHydrated) {
    return null;
  }

  const vaultLookupContext = buildProgrammerVaultLookupContext(snapshotContext.currentSession, programmerId);
  const existingVaultRecord = vaultLookupContext ? await readProgrammerVaultRecord(vaultLookupContext) : null;
  const services = await hydrateProgrammerVaultServiceClients(
    buildProgrammerServiceVaultEntries({
      registeredApplications: snapshotContext.registeredApplications,
      selectedProgrammer: snapshotContext.selectedProgrammer,
      cmTenants: Array.isArray(snapshotContext.cmContext?.tenants) ? snapshotContext.cmContext.tenants : [],
      existingVaultRecord,
      selectedRegisteredApplication: snapshotContext.selectedRegisteredApplication
    }),
    serviceKeys,
    {
      session: snapshotContext.currentSession,
      csrfToken: firstNonEmptyString([snapshotContext.consoleContext?.csrfToken, "NO-TOKEN"])
    }
  );
  const selectedApplications = VAULT_DCR_SERVICE_DEFINITIONS.map((definition) => services?.[definition.serviceKey]?.registeredApplication)
    .filter(Boolean);
  const selectedCmTenantId = resolvePersistedSelectionId(
    Array.isArray(snapshotContext.cmContext?.tenants) ? snapshotContext.cmContext.tenants : [],
    state.selectedCmTenantId
  );

  return {
    environmentId: snapshotContext.environmentId,
    environmentLabel: snapshotContext.environmentLabel,
    programmerId: firstNonEmptyString([snapshotContext.selectedProgrammer.id, snapshotContext.selectedProgrammer.key]),
    programmerKey: firstNonEmptyString([snapshotContext.selectedProgrammer.key, snapshotContext.selectedProgrammer.id]),
    programmerName: firstNonEmptyString([snapshotContext.selectedProgrammer.name]),
    programmerLabel: firstNonEmptyString([
      snapshotContext.selectedProgrammer.label,
      snapshotContext.selectedProgrammer.name,
      snapshotContext.selectedProgrammer.id
    ]),
    consoleBaseUrl: firstNonEmptyString([snapshotContext.consoleContext.baseUrl]),
    configurationVersion: firstNonEmptyString([snapshotContext.consoleContext.configurationVersion]),
    programmerFingerprint: buildProgrammerVaultFingerprint(snapshotContext.selectedProgrammer),
    source,
    maxAgeMs: LOGINBUTTON_VAULT_PROGRAMMER_RECORD_TTL_MS,
    selectedRegisteredApplicationId: resolveVaultSelectedRegisteredApplicationId(
      selectedApplications,
      state.selectedRegisteredApplicationId
    ),
    selectedRequestorId: resolvePersistedSelectionId(snapshotContext.requestors, state.selectedRequestorId),
    selectedCmTenantId,
    selectedApplications,
    services
  };
}

async function persistProgrammerVaultSnapshot(
  session = null,
  programmerId = "",
  { registeredApplications = null, source = "network", serviceKeys = null } = {}
) {
  const snapshotInput = await buildProgrammerVaultSnapshotInput(session, programmerId, {
    registeredApplications,
    source,
    serviceKeys
  });
  if (!snapshotInput) {
    return null;
  }

  const writtenRecord = await writeProgrammerVaultRecord(snapshotInput);
  if (String(state.selectedProgrammerId || "").trim() === String(writtenRecord?.programmerId || "").trim()) {
    state.selectedProgrammerVaultRecord = writtenRecord;
  }
  return writtenRecord;
}

async function persistSelectedProgrammerVaultSelections(programmerId = state.selectedProgrammerId) {
  const snapshotContext = buildProgrammerVaultSnapshotContext(state.session, programmerId);
  if (!snapshotContext?.selectedProgrammer || !snapshotContext.environmentId) {
    return null;
  }

  const nextSelections = {
    environmentId: snapshotContext.environmentId,
    programmerId: firstNonEmptyString([snapshotContext.selectedProgrammer.id, snapshotContext.selectedProgrammer.key]),
    selectedRegisteredApplicationId: resolvePersistedSelectionId(
      snapshotContext.registeredApplications,
      state.selectedRegisteredApplicationId
    ),
    selectedRequestorId: resolvePersistedSelectionId(snapshotContext.requestors, state.selectedRequestorId),
    selectedCmTenantId: resolvePersistedSelectionId(
      Array.isArray(snapshotContext.cmContext?.tenants) ? snapshotContext.cmContext.tenants : [],
      state.selectedCmTenantId
    )
  };

  const mergedSelections = await mergeProgrammerVaultSelections(nextSelections);
  if (mergedSelections && String(state.selectedProgrammerId || "").trim() === String(mergedSelections?.programmerId || "").trim()) {
    state.selectedProgrammerVaultRecord = mergedSelections;
  }
  if (!snapshotContext.registeredApplicationsHydrated) {
    return mergedSelections;
  }

  const selectedRegisteredApplication = resolveSelectedRegisteredApplication(
    snapshotContext.registeredApplications,
    nextSelections.selectedRegisteredApplicationId
  );
  const selectedServiceKeys = VAULT_DCR_SERVICE_DEFINITIONS.filter((definition) =>
    registeredApplicationMatchesRequiredScope(selectedRegisteredApplication, definition.requiredScope)
  ).map((definition) => definition.serviceKey);
  if (selectedServiceKeys.length > 0) {
    return persistProgrammerVaultSnapshot(state.session, programmerId, {
      source: "selection",
      serviceKeys: selectedServiceKeys
    });
  }
  if (mergedSelections) {
    return mergedSelections;
  }

  return persistProgrammerVaultSnapshot(state.session, programmerId, {
    source: "selection"
  });
}

function hydrateSelectedProgrammerFromVaultRecord(vaultRecord = null, programmerId = "", { restoreSelections = false } = {}) {
  const normalizedProgrammerId = String(programmerId || vaultRecord?.programmerId || "").trim();
  const currentSession = state.session && typeof state.session === "object" ? state.session : null;
  if (!currentSession || !normalizedProgrammerId || !vaultRecord) {
    return false;
  }

  const mergedSession = mergeProgrammerApplicationsIntoSession(currentSession, normalizedProgrammerId, {
    applications: hydrateProgrammerApplicationsFromVault(vaultRecord)
  });
  state.session = mergedSession;
  state.selectedProgrammerVaultRecord = vaultRecord;

  if (restoreSelections) {
    applyPersistedProgrammerSelections(vaultRecord, normalizedProgrammerId);
  }

  render();
  return true;
}

function applyPersistedProgrammerSelections(vaultRecord = null, programmerId = "") {
  const snapshotContext = buildProgrammerVaultSnapshotContext(state.session, programmerId);
  if (!snapshotContext?.selectedProgrammer) {
    return;
  }

  const hydratedApplications = hydrateProgrammerApplicationsFromVault(vaultRecord);
  state.selectedRegisteredApplicationId = resolvePersistedSelectionId(
    snapshotContext.registeredApplications,
    firstNonEmptyString([
      vaultRecord?.selectedRegisteredApplicationId,
      hydratedApplications[0]?.key,
      hydratedApplications[0]?.id
    ])
  );
  state.selectedRequestorId = resolvePersistedSelectionId(
    snapshotContext.requestors,
    firstNonEmptyString([vaultRecord?.selectedRequestorId])
  );
  state.selectedCmTenantId = resolvePersistedSelectionId(
    Array.isArray(snapshotContext.cmContext?.tenants) ? snapshotContext.cmContext.tenants : [],
    firstNonEmptyString([vaultRecord?.selectedCmTenantId])
  );
}

function mergeProgrammerApplicationsIntoSession(session = null, programmerId = "", resultValue = {}) {
  const currentSession = session && typeof session === "object" ? session : null;
  const normalizedProgrammerId = String(programmerId || "").trim();
  if (!currentSession || !normalizedProgrammerId) {
    return currentSession;
  }

  const liveConsole = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const liveApplicationsByProgrammer =
    liveConsole?.applicationsByProgrammer && typeof liveConsole.applicationsByProgrammer === "object"
      ? liveConsole.applicationsByProgrammer
      : {};
  const liveApplicationErrorsByProgrammer =
    liveConsole?.applicationErrorsByProgrammer && typeof liveConsole.applicationErrorsByProgrammer === "object"
      ? liveConsole.applicationErrorsByProgrammer
      : {};

  return {
    ...currentSession,
    console: {
      ...liveConsole,
      transport: firstNonEmptyString([resultValue?.transport, liveConsole?.transport]),
      csrfToken: firstNonEmptyString([resultValue?.csrfToken, liveConsole?.csrfToken]),
      pageContextOrigin: firstNonEmptyString([resultValue?.pageContext?.origin, liveConsole?.pageContextOrigin]),
      pageContextUrl: firstNonEmptyString([resultValue?.pageContext?.url, liveConsole?.pageContextUrl]),
      applicationsByProgrammer: {
        ...liveApplicationsByProgrammer,
        [normalizedProgrammerId]: Array.isArray(resultValue?.applications) ? resultValue.applications : []
      },
      applicationErrorsByProgrammer: {
        ...liveApplicationErrorsByProgrammer,
        [normalizedProgrammerId]: ""
      }
    }
  };
}

function mergeProgrammerApplicationsErrorIntoSession(
  session = null,
  programmerId = "",
  error = null,
  { preserveExistingApplications = false } = {}
) {
  const currentSession = session && typeof session === "object" ? session : null;
  const normalizedProgrammerId = String(programmerId || "").trim();
  if (!currentSession || !normalizedProgrammerId) {
    return currentSession;
  }

  const liveConsole = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const liveApplicationsByProgrammer =
    liveConsole?.applicationsByProgrammer && typeof liveConsole.applicationsByProgrammer === "object"
      ? liveConsole.applicationsByProgrammer
      : {};
  const liveApplicationErrorsByProgrammer =
    liveConsole?.applicationErrorsByProgrammer && typeof liveConsole.applicationErrorsByProgrammer === "object"
      ? liveConsole.applicationErrorsByProgrammer
      : {};

  return {
    ...currentSession,
    console: {
      ...liveConsole,
      applicationErrorsByProgrammer: {
        ...liveApplicationErrorsByProgrammer,
        [normalizedProgrammerId]: serializeError(error)
      },
      applicationsByProgrammer: preserveExistingApplications
        ? liveApplicationsByProgrammer
        : {
            ...liveApplicationsByProgrammer,
            [normalizedProgrammerId]: []
          }
    }
  };
}

function buildProgrammerVaultFingerprint(programmer = null) {
  if (!programmer || typeof programmer !== "object") {
    return "";
  }

  return JSON.stringify({
    id: firstNonEmptyString([programmer.id, programmer.key]),
    owner: firstNonEmptyString([programmer.owner]),
    requestorIds: Array.isArray(programmer.requestorIds) ? [...programmer.requestorIds].filter(Boolean).sort() : []
  });
}

function buildPersistableProgrammer(programmer = null) {
  if (!programmer || typeof programmer !== "object") {
    return null;
  }

  return {
    key: firstNonEmptyString([programmer.key, programmer.id]),
    id: firstNonEmptyString([programmer.id, programmer.key]),
    name: firstNonEmptyString([programmer.name]),
    label: firstNonEmptyString([programmer.label, programmer.name, programmer.id]),
    owner: firstNonEmptyString([programmer.owner]),
    requestorIds: Array.isArray(programmer.requestorIds) ? programmer.requestorIds.filter(Boolean) : [],
    requestorCount: Number(programmer.requestorCount || 0)
  };
}

function buildPersistableRegisteredApplications(applications = []) {
  return (Array.isArray(applications) ? applications : []).map((application) => ({
    key: firstNonEmptyString([application?.key, application?.id]),
    id: firstNonEmptyString([application?.id, application?.key]),
    name: firstNonEmptyString([application?.name]),
    label: firstNonEmptyString([application?.label, application?.name, application?.id]),
    clientId: firstNonEmptyString([application?.clientId]),
    scopes: Array.isArray(application?.scopes) ? application.scopes.filter(Boolean) : [],
    scopeLabels: Array.isArray(application?.scopeLabels) ? application.scopeLabels.filter(Boolean) : [],
    type: firstNonEmptyString([application?.type]),
    softwareStatement: firstNonEmptyString([
      application?.softwareStatement,
      extractSoftwareStatementFromApplicationData(application?.raw || application)
    ])
  }));
}

function buildPersistableRequestors(requestors = []) {
  return (Array.isArray(requestors) ? requestors : []).map((requestor) => ({
    key: firstNonEmptyString([requestor?.key, requestor?.id]),
    id: firstNonEmptyString([requestor?.id, requestor?.key]),
    name: firstNonEmptyString([requestor?.name, requestor?.label, requestor?.id]),
    label: firstNonEmptyString([requestor?.label, requestor?.name, requestor?.id]),
    programmerId: firstNonEmptyString([requestor?.programmerId])
  }));
}

function buildPersistablePremiumServiceItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    key: firstNonEmptyString([item?.key]),
    label: firstNonEmptyString([item?.label]),
    applicationName: firstNonEmptyString([item?.applicationName]),
    selectedApplicationName: firstNonEmptyString([item?.selectedApplicationName]),
    placeholderMessage: firstNonEmptyString([item?.placeholderMessage])
  }));
}

function hydrateProgrammerApplicationsFromVault(vaultRecord = null) {
  const selectedApplications = Array.isArray(vaultRecord?.selectedApplications)
    ? vaultRecord.selectedApplications
    : [];
  const fallbackApplications = VAULT_DCR_SERVICE_DEFINITIONS.map(
    (definition) => vaultRecord?.services?.[definition.serviceKey]?.registeredApplication
  ).filter(Boolean);
  const seen = new Set();
  const dedupedApplications = [];

  (selectedApplications.length > 0 ? selectedApplications : fallbackApplications).forEach((application) => {
    const applicationKey = firstNonEmptyString([application?.key, application?.id]);
    if (!applicationKey || seen.has(applicationKey)) {
      return;
    }
    seen.add(applicationKey);
    dedupedApplications.push(application);
  });

  return buildPersistableRegisteredApplications(dedupedApplications);
}

function resolvePersistedSelectionId(options = [], selectedId = "") {
  const normalizedSelectedId = String(selectedId || "").trim();
  if (!normalizedSelectedId) {
    return "";
  }

  const match = (Array.isArray(options) ? options : []).find((option) => option?.key === normalizedSelectedId || option?.id === normalizedSelectedId);
  return match ? firstNonEmptyString([match.key, match.id]) : "";
}

function buildInspectableUserPayload({
  currentSession,
  profile,
  imsSession,
  activeOrganization,
  organizationContext,
  consoleContext,
  cmContext,
  unifiedShellContext,
  programmerAccess,
  roles,
  channels,
  cmuTokenHeaderName,
  cmuTokenHeaderValue,
  cmTenants,
  selectedCmTenant,
  requestors,
  selectedRequestor,
  selectedProgrammer
}) {
  return {
    identity: {
      name: firstNonEmptyString([profile?.name, profile?.displayName, currentSession?.idTokenClaims?.name]),
      email: firstNonEmptyString([profile?.email, profile?.user_email, profile?.emailAddress, currentSession?.idTokenClaims?.email]),
      avatarUrl: firstNonEmptyString([state.avatarAsset.sourceUrl, currentSession?.avatarUrl]),
      activeOrganization: sanitizeInspectableOrganization(activeOrganization)
    },
    imsProfile: profile,
    imsSession,
    accessTokenClaims: currentSession?.accessTokenClaims || null,
    idTokenClaims: currentSession?.idTokenClaims || null,
    organizations: {
      detected: Array.isArray(organizationContext?.options)
        ? organizationContext.options.map((option) => sanitizeInspectableOrganization(option))
        : []
    },
    avatar: {
      mode: firstNonEmptyString([state.avatarAsset.mode]),
      sourceUrl: firstNonEmptyString([state.avatarAsset.sourceUrl, currentSession?.avatarUrl]),
      displayUrl: firstNonEmptyString([state.avatarAsset.displayUrl]),
      loaded: Boolean(state.avatarAsset.displayUrl)
    },
    console: {
      environmentId: firstNonEmptyString([consoleContext.environmentId]),
      environmentLabel: firstNonEmptyString([consoleContext.environmentLabel]),
      baseUrl: firstNonEmptyString([consoleContext.baseUrl]),
      transport: firstNonEmptyString([consoleContext.transport]),
      pageContextOrigin: firstNonEmptyString([consoleContext.pageContextOrigin]),
      pageContextUrl: firstNonEmptyString([consoleContext.pageContextUrl]),
      configurationVersion: firstNonEmptyString([consoleContext.configurationVersion]),
      status: firstNonEmptyString([consoleContext.status]),
      roles,
      channels: Array.isArray(channels) ? channels.map((channel) => channel.raw || channel) : [],
      extendedProfile: consoleContext.extendedProfile || null,
      programmerAccess: programmerAccess || null,
      selectedProgrammer: selectedProgrammer?.raw || selectedProgrammer || null
    },
    cm: {
      baseUrl: firstNonEmptyString([cmContext.baseUrl]),
      reportsBaseUrl: firstNonEmptyString([cmContext.reportsBaseUrl]),
      checkTokenEndpoint: firstNonEmptyString([cmContext.checkTokenEndpoint]),
      validateTokenEndpoint: firstNonEmptyString([cmContext.validateTokenEndpoint]),
      status: firstNonEmptyString([cmContext.status]),
      tenantAuthModel: firstNonEmptyString([cmContext.tenantAuthModel]),
      cmuAuthModel: firstNonEmptyString([cmContext.cmuAuthModel]),
      reportsStatus: firstNonEmptyString([cmContext.reportsStatus]),
      cmuTokenSource: firstNonEmptyString([cmContext.cmuTokenSource]),
      cmuTokenClientId: firstNonEmptyString([cmContext.cmuTokenClientId]),
      cmuTokenScope: firstNonEmptyString([cmContext.cmuTokenScope]),
      cmuTokenUserId: firstNonEmptyString([cmContext.cmuTokenUserId]),
      cmuTokenExpiresAt: firstNonEmptyString([cmContext.cmuTokenExpiresAt]),
      cmuTokenHeaderName: firstNonEmptyString([cmuTokenHeaderName]),
      cmuTokenPresent: Boolean(cmuTokenHeaderValue),
      selectedTenant: selectedCmTenant?.raw || selectedCmTenant || null,
      tenants: Array.isArray(cmTenants) ? cmTenants.map((tenant) => tenant.raw || tenant) : [],
      requestors: Array.isArray(requestors) ? requestors.map((requestor) => requestor.raw || requestor) : [],
      selectedRequestor: selectedRequestor?.raw || selectedRequestor || null,
      errors: cmContext.errors || null
    },
    unifiedShell: {
      status: firstNonEmptyString([unifiedShellContext.status]),
      selectedOrg: firstNonEmptyString([unifiedShellContext.selectedOrg]),
      clusterCount: Number(unifiedShellContext.clusterCount || 0),
      next: firstNonEmptyString([unifiedShellContext.next]),
      timestamp: firstNonEmptyString([unifiedShellContext.timestamp]),
      preferredLanguages: Array.isArray(unifiedShellContext.preferredLanguages)
        ? unifiedShellContext.preferredLanguages.filter(Boolean)
        : [],
      organizations: Array.isArray(unifiedShellContext.organizations)
        ? unifiedShellContext.organizations.map((organization) => sanitizeInspectableOrganization(organization))
        : [],
      userProfile: unifiedShellContext.userProfile || null,
      errors: unifiedShellContext.errors || null
    }
  };
}

function sanitizeInspectableOrganization(organization = null) {
  if (!organization || typeof organization !== "object") {
    return null;
  }

  return {
    id: firstNonEmptyString([organization.id]),
    tenantId: firstNonEmptyString([organization.tenantId]),
    imsOrgId: firstNonEmptyString([organization.imsOrgId]),
    name: firstNonEmptyString([organization.name, organization.label]),
    source: firstNonEmptyString([organization.source]),
    sources: Array.isArray(organization.sources) ? organization.sources.filter(Boolean) : [],
    hinted: organization.hinted === true,
    aepRegion: firstNonEmptyString([organization.aepRegion]),
    hasAEP: organization.hasAEP === true,
    clusterUserId: firstNonEmptyString([organization.clusterUserId]),
    clusterUserType: firstNonEmptyString([organization.clusterUserType]),
    clusterRestricted: organization.clusterRestricted === true,
    consolidatedAccount: organization.consolidatedAccount === true,
    aemInstances: Array.isArray(organization.aemInstances) ? organization.aemInstances : []
  };
}

function flattenInspectableEntries(value, path = "", entries = [], seen = new WeakSet()) {
  if (value === undefined || value === null) {
    return entries;
  }

  if (typeof value === "string") {
    const normalized = redactSensitiveTokenValues(value).trim();
    if (normalized) {
      entries.push({
        path,
        value: normalized
      });
    }
    return entries;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    entries.push({
      path,
      value: String(value)
    });
    return entries;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      flattenInspectableEntries(entry, `${path}[${index}]`, entries, seen);
    });
    return entries;
  }

  if (typeof value !== "object") {
    return entries;
  }

  if (seen.has(value)) {
    return entries;
  }
  seen.add(value);

  Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => {
      flattenInspectableEntries(value[key], path ? `${path}.${key}` : key, entries, seen);
    });

  return entries;
}

function renderSummaryCardsInto(
  container,
  cards = [],
  emptyTitleText = "No post-login data yet",
  emptyBodyText = "Sign in to enumerate the Adobe user and Adobe Pass console data."
) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!Array.isArray(cards) || cards.length === 0) {
    const emptyCard = document.createElement("article");
    emptyCard.className = "org-card org-card--empty data-card";
    emptyCard.setAttribute("role", "listitem");

    const emptyTitle = document.createElement("p");
    emptyTitle.className = "spectrum-Heading spectrum-Heading--sizeS org-cardEmptyTitle";
    emptyTitle.textContent = emptyTitleText || "No post-login data yet";

    const emptyBody = document.createElement("p");
    emptyBody.className = "spectrum-Body spectrum-Body--sizeS org-cardEmptyBody";
    emptyBody.textContent = emptyBodyText || "Sign in to enumerate the Adobe user and Adobe Pass console data.";

    emptyCard.append(emptyTitle, emptyBody);
    container.appendChild(emptyCard);
    return;
  }

  cards.forEach((card) => {
    const cardElement = document.createElement("article");
    cardElement.className = "org-card data-card";
    cardElement.setAttribute("role", "listitem");

    const title = document.createElement("p");
    title.className = "spectrum-Heading spectrum-Heading--sizeS data-cardTitle";
    title.textContent = firstNonEmptyString([card?.title, "Data group"]);

    const items = document.createElement("div");
    items.className = "data-cardItems";

    (Array.isArray(card?.items) ? card.items : []).forEach((item) => {
      const row = document.createElement("div");
      row.className = "data-cardItem";

      const label = document.createElement("p");
      label.className = "spectrum-Detail spectrum-Detail--sizeM data-cardLabel";
      label.textContent = firstNonEmptyString([item?.label, "Field"]);

      const value = document.createElement("p");
      value.className = "spectrum-Body spectrum-Body--sizeS data-cardValue";
      value.textContent = firstNonEmptyString([item?.value, "Not returned"]);
      value.title = value.textContent;

      row.append(label, value);
      items.appendChild(row);
    });

    cardElement.append(title, items);
    container.appendChild(cardElement);
  });
}

function syncAuthenticatedSummaryCards(cards = []) {
  renderSummaryCardsInto(organizationCardList, cards);
}

function syncDetectedOrganizationPicker(organizationContext = {}) {
  if (!detectedOrganizationPicker) {
    return;
  }

  const options = Array.isArray(organizationContext?.options) ? organizationContext.options : [];
  const shouldOfferInteractiveSwitch = organizationContext?.shouldOfferInteractiveSwitch === true;
  const activeOrganizationKey = String(organizationContext?.activeOrganization?.key || "").trim();
  const recommendedOrganizationKey = String(organizationContext?.recommendedOrgKey || "").trim();
  const switchableOptionCount = options.filter((option) => String(option?.key || "").trim() !== activeOrganizationKey).length;
  const hasStoredSelection = options.some((option) => option.key === state.selectedOrganizationSwitchKey);
  const nextValue = hasStoredSelection
    ? state.selectedOrganizationSwitchKey
    : firstNonEmptyString([organizationContext?.pickerValue, options[0]?.key, ORG_PICKER_UNAVAILABLE_VALUE]);
  const signature = `${options
    .map((option) => {
      const optionKey = String(option?.key || "").trim();
      const optionLabel =
        optionKey && optionKey === recommendedOrganizationKey && optionKey !== activeOrganizationKey
          ? `${option.label} (Recommended for Adobe Pass)`
          : option.label;
      return `${option.key}:${optionLabel}`;
    })
    .join("|")}|interactive=${shouldOfferInteractiveSwitch ? "yes" : "no"}`;

  if (detectedOrganizationPicker.dataset.optionsSignature !== signature) {
    detectedOrganizationPicker.innerHTML = "";

    if (options.length > 0) {
      options.forEach((option) => {
        const optionKey = String(option?.key || "").trim();
        const optionElement = document.createElement("option");
        optionElement.value = option.key;
        optionElement.textContent =
          optionKey && optionKey === recommendedOrganizationKey && optionKey !== activeOrganizationKey
            ? `${option.label} (Recommended for Adobe Pass)`
            : option.label;
        detectedOrganizationPicker.appendChild(optionElement);
      });
    } else {
      const unavailableOption = document.createElement("option");
      unavailableOption.value = ORG_PICKER_UNAVAILABLE_VALUE;
      unavailableOption.textContent = firstNonEmptyString([
        organizationContext?.emptyLabel,
        "No other available Adobe orgs"
      ]);
      detectedOrganizationPicker.appendChild(unavailableOption);
    }

    if (shouldOfferInteractiveSwitch) {
      const reauthOption = document.createElement("option");
      reauthOption.value = ORG_PICKER_REAUTH_VALUE;
      reauthOption.textContent = "Sign In Again To Choose Another Adobe Org";
      detectedOrganizationPicker.appendChild(reauthOption);
    }

    detectedOrganizationPicker.dataset.optionsSignature = signature;
  }

  if (!hasStoredSelection) {
    state.selectedOrganizationSwitchKey = "";
  }

  detectedOrganizationPicker.value = nextValue;
  detectedOrganizationPicker.disabled = state.busy || (switchableOptionCount === 0 && !shouldOfferInteractiveSwitch);
}

function syncCmTenantPicker(authenticatedDataContext = {}) {
  if (!cmTenantPicker) {
    return;
  }

  const pickerVisible = authenticatedDataContext?.cmTenantPickerVisible === true;
  if (cmTenantPickerSection) {
    cmTenantPickerSection.hidden = !pickerVisible;
  }
  if (!pickerVisible) {
    cmTenantPicker.disabled = true;
    cmTenantPicker.value = CM_TENANT_PICKER_UNAVAILABLE_VALUE;
    return;
  }

  const options = Array.isArray(authenticatedDataContext?.cmTenantOptions) ? authenticatedDataContext.cmTenantOptions : [];
  const nextValue = firstNonEmptyString([
    authenticatedDataContext?.selectedCmTenant?.key,
    authenticatedDataContext?.selectedCmTenant?.id,
    options.length > 0 ? CM_TENANT_PICKER_PLACEHOLDER_VALUE : CM_TENANT_PICKER_UNAVAILABLE_VALUE
  ]);
  const signature = options.map((option) => `${option.key}:${option.label}`).join("|");

  if (cmTenantPicker.dataset.optionsSignature !== signature) {
    cmTenantPicker.innerHTML = "";

    if (options.length > 0) {
      const placeholderOption = document.createElement("option");
      placeholderOption.value = CM_TENANT_PICKER_PLACEHOLDER_VALUE;
      placeholderOption.textContent = "Choose a CM tenant";
      cmTenantPicker.appendChild(placeholderOption);

      options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.key;
        optionElement.textContent = option.label;
        cmTenantPicker.appendChild(optionElement);
      });
    } else {
      const unavailableOption = document.createElement("option");
      unavailableOption.value = CM_TENANT_PICKER_UNAVAILABLE_VALUE;
      unavailableOption.textContent = state.postLoginHydrationInFlight ? "Loading CM tenants…" : "No CM tenants returned";
      cmTenantPicker.appendChild(unavailableOption);
    }

    cmTenantPicker.dataset.optionsSignature = signature;
  }

  cmTenantPicker.value = nextValue;
  cmTenantPicker.disabled = state.busy || options.length === 0;
}

function syncCmuTokenRow(authenticatedDataContext = {}) {
  if (!cmuTokenSection || !cmuTokenHeaderValue) {
    return;
  }

  const rowVisible = authenticatedDataContext?.cmuTokenVisible === true;
  cmuTokenSection.hidden = !rowVisible;
  if (!rowVisible) {
    cmuTokenHeaderValue.value = "";
    cmuTokenHeaderValue.removeAttribute("title");
    cmuTokenHeaderValue.classList.remove("is-empty");
    return;
  }

  const nextHeaderValue = firstNonEmptyString([
    normalizeBearerTokenValue(authenticatedDataContext?.cmuTokenHeaderValue),
    state.postLoginHydrationInFlight ? "Loading…" : "Not returned"
  ]);

  cmuTokenHeaderValue.value = nextHeaderValue;
  cmuTokenHeaderValue.title = nextHeaderValue;
  cmuTokenHeaderValue.classList.toggle("is-empty", nextHeaderValue === "Not returned");
}

function syncProgrammerPicker(authenticatedDataContext = {}) {
  if (!organizationPicker) {
    return;
  }

  const pickerVisible = authenticatedDataContext?.programmerPickerVisible === true;
  if (programmerPickerSection) {
    programmerPickerSection.hidden = !pickerVisible;
  }
  if (!pickerVisible) {
    organizationPicker.disabled = true;
    organizationPicker.value = PROGRAMMER_PICKER_UNAVAILABLE_VALUE;
    return;
  }

  const options = Array.isArray(authenticatedDataContext?.programmerOptions)
    ? authenticatedDataContext.programmerOptions
    : [];
  const nextValue = firstNonEmptyString([
    authenticatedDataContext?.selectedProgrammer?.key,
    authenticatedDataContext?.selectedProgrammer?.id,
    options.length > 0 ? PROGRAMMER_PICKER_PLACEHOLDER_VALUE : PROGRAMMER_PICKER_UNAVAILABLE_VALUE
  ]);
  const signature = options.map((option) => `${option.key}:${option.label}`).join("|");

  if (organizationPicker.dataset.optionsSignature !== signature) {
    organizationPicker.innerHTML = "";

    if (options.length > 0) {
      const placeholderOption = document.createElement("option");
      placeholderOption.value = PROGRAMMER_PICKER_PLACEHOLDER_VALUE;
      placeholderOption.textContent = "Choose a programmer";
      organizationPicker.appendChild(placeholderOption);

      options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.key;
        optionElement.textContent = option.label;
        organizationPicker.appendChild(optionElement);
      });
    } else {
      const unavailableOption = document.createElement("option");
      unavailableOption.value = PROGRAMMER_PICKER_UNAVAILABLE_VALUE;
      unavailableOption.textContent = state.postLoginHydrationInFlight ? "Loading programmers…" : "No programmers returned";
      organizationPicker.appendChild(unavailableOption);
    }

    organizationPicker.dataset.optionsSignature = signature;
  }

  organizationPicker.value = nextValue;
  organizationPicker.disabled = state.busy || options.length === 0;
}

function syncRegisteredApplicationPicker(authenticatedDataContext = {}) {
  if (!registeredApplicationPicker) {
    return;
  }

  const pickerVisible = authenticatedDataContext?.registeredApplicationPickerVisible === true;
  if (registeredApplicationPickerSection) {
    registeredApplicationPickerSection.hidden = !pickerVisible;
  }
  if (!pickerVisible) {
    registeredApplicationPicker.disabled = true;
    registeredApplicationPicker.value = REGISTERED_APPLICATION_PICKER_UNAVAILABLE_VALUE;
    return;
  }

  const options = Array.isArray(authenticatedDataContext?.registeredApplicationOptions)
    ? authenticatedDataContext.registeredApplicationOptions
    : [];
  const nextValue = firstNonEmptyString([
    authenticatedDataContext?.selectedRegisteredApplication?.key,
    authenticatedDataContext?.selectedRegisteredApplication?.id,
    options.length > 0 ? REGISTERED_APPLICATION_PICKER_PLACEHOLDER_VALUE : REGISTERED_APPLICATION_PICKER_UNAVAILABLE_VALUE
  ]);
  const signature = options.map((option) => `${option.key}:${option.label}`).join("|");

  if (registeredApplicationPicker.dataset.optionsSignature !== signature) {
    registeredApplicationPicker.innerHTML = "";

    if (options.length > 0) {
      const placeholderOption = document.createElement("option");
      placeholderOption.value = REGISTERED_APPLICATION_PICKER_PLACEHOLDER_VALUE;
      placeholderOption.textContent = "Choose a Registered Application";
      registeredApplicationPicker.appendChild(placeholderOption);

      options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.key;
        optionElement.textContent = option.label;
        registeredApplicationPicker.appendChild(optionElement);
      });
    } else {
      const unavailableOption = document.createElement("option");
      unavailableOption.value = REGISTERED_APPLICATION_PICKER_UNAVAILABLE_VALUE;
      unavailableOption.textContent = authenticatedDataContext?.selectedProgrammer
        ? authenticatedDataContext?.registeredApplicationLoading
          ? "Loading Registered Applications…"
          : "No Registered Applications returned"
        : "Choose a Programmer first";
      registeredApplicationPicker.appendChild(unavailableOption);
    }

    registeredApplicationPicker.dataset.optionsSignature = signature;
  }

  registeredApplicationPicker.value = nextValue;
  registeredApplicationPicker.disabled =
    state.busy ||
    authenticatedDataContext?.registeredApplicationLoading === true ||
    !authenticatedDataContext?.selectedProgrammer ||
    options.length === 0;
}

function syncPremiumServicesSummary(authenticatedDataContext = {}) {
  if (!premiumServicesSection || !premiumServicesList) {
    return;
  }

  const items = Array.isArray(authenticatedDataContext?.premiumServiceItems)
    ? authenticatedDataContext.premiumServiceItems
    : [];
  const rowVisible = authenticatedDataContext?.premiumServicesVisible === true && items.length > 0;
  premiumServicesSection.hidden = !rowVisible;
  if (!rowVisible) {
    premiumServicesList.hidden = true;
    premiumServicesList.innerHTML = "";
    return;
  }

  premiumServicesList.innerHTML = "";
  premiumServicesList.hidden = items.length === 0;
  if (items.length === 0) {
    return;
  }

  const expandedKeys = new Set(
    Array.isArray(state.premiumServiceExpandedKeys) ? state.premiumServiceExpandedKeys.map((value) => String(value || "").trim()) : []
  );

  items.forEach((item, index) => {
    const itemKey = String(firstNonEmptyString([item?.key, item?.label, `premium-service-${index + 1}`]) || "").trim();
    const domToken =
      itemKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || `premium-service-${index + 1}`;
    const panelId = `premium-service-panel-${domToken}`;
    const isExpanded = expandedKeys.has(itemKey);

    const card = document.createElement("article");
    card.className = "premium-serviceCard";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "premium-serviceToggle";
    toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    toggle.setAttribute("aria-controls", panelId);

    const headerCopy = document.createElement("span");
    headerCopy.className = "premium-serviceHeaderCopy";

    const title = document.createElement("span");
    title.className = "premium-serviceTitle";
    title.textContent = firstNonEmptyString([item?.label, "Premium Service"]);

    const meta = document.createElement("span");
    meta.className = "premium-serviceMeta";
    meta.textContent = item?.selectedApplicationName
      ? `Using ${item.selectedApplicationName}`
      : `Ready through ${firstNonEmptyString([item?.applicationName, "Registered Application"])}`;

    const icon = document.createElement("span");
    icon.className = "premium-serviceIcon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "▼";

    headerCopy.append(title, meta);
    toggle.append(headerCopy, icon);

    const body = document.createElement("div");
    body.id = panelId;
    body.className = "premium-serviceBody";
    body.hidden = !isExpanded;

    const actionRow = document.createElement("div");
    actionRow.className = "premium-serviceActionRow";

    const cheatSheetButton = document.createElement("button");
    cheatSheetButton.type = "button";
    cheatSheetButton.className =
      "spectrum-Button spectrum-Button--outline spectrum-Button--primary spectrum-Button--sizeM premium-serviceCheatSheetButton";

    const cheatSheetButtonLabel = document.createElement("span");
    cheatSheetButtonLabel.className = "spectrum-Button-label";
    cheatSheetButtonLabel.textContent = "CHEAT SHEET";
    cheatSheetButton.appendChild(cheatSheetButtonLabel);
    cheatSheetButton.addEventListener("click", async () => {
      cheatSheetButton.disabled = true;
      cheatSheetButton.setAttribute("aria-busy", "true");
      try {
        const cheatSheetMessage = await buildPremiumServiceCheatSheetMessage(item);
        window.alert(cheatSheetMessage);
      } catch (error) {
        window.alert(`Unable to hydrate ${firstNonEmptyString([item?.label, "this premium service"])}: ${serializeError(error)}`);
      } finally {
        cheatSheetButton.disabled = false;
        cheatSheetButton.setAttribute("aria-busy", "false");
      }
    });

    actionRow.appendChild(cheatSheetButton);
    body.appendChild(actionRow);
    toggle.addEventListener("click", () => {
      const nextExpanded = !expandedKeys.has(itemKey);
      const nextKeys = nextExpanded
        ? [...expandedKeys, itemKey]
        : Array.from(expandedKeys).filter((value) => value !== itemKey);
      state.premiumServiceExpandedKeys = nextKeys;
      render();
    });

    card.append(toggle, body);
    premiumServicesList.appendChild(card);
  });
}

function buildPremiumServiceApplicationDisplayName(application = null, fallbackLabel = "Registered Application") {
  return firstNonEmptyString([
    application?.name,
    application?.label,
    application?.id,
    fallbackLabel
  ]);
}

function buildPremiumServiceClientReadyMessage(definition = null, serviceRecord = null, fallbackApplicationName = "") {
  const normalizedDefinition = definition && typeof definition === "object" ? definition : null;
  const normalizedServiceRecord = serviceRecord && typeof serviceRecord === "object" ? serviceRecord : {};
  const registeredApplication =
    normalizedServiceRecord?.registeredApplication && typeof normalizedServiceRecord.registeredApplication === "object"
      ? normalizedServiceRecord.registeredApplication
      : null;
  const client = normalizedServiceRecord?.client && typeof normalizedServiceRecord.client === "object"
    ? normalizedServiceRecord.client
    : {};
  const applicationName = buildPremiumServiceApplicationDisplayName(registeredApplication, fallbackApplicationName);
  const clientId = firstNonEmptyString([client.clientId]);
  const clientSecret = firstNonEmptyString([client.clientSecret]);
  const accessToken = firstNonEmptyString([client.accessToken]);
  const tokenScope = firstNonEmptyString([
    client.tokenScope,
    client.tokenRequestedScope,
    normalizedDefinition?.requiredScope
  ]);

  if (!normalizedDefinition || !clientId || !clientSecret || !accessToken) {
    return [
      `${firstNonEmptyString([normalizedDefinition?.label, "Premium service"])} hydration failed.`,
      `Registered Application: ${applicationName}`,
      `Required scope: ${firstNonEmptyString([normalizedDefinition?.requiredScope, "Unavailable"])}`,
      `Hydration path: DCR /register + client_credentials token.`,
      `DCR client: not created`,
      `Result: ${firstNonEmptyString([
        client.error,
        "LoginButton did not mint a DCR client_id for this premium service yet."
      ])}`
    ].join("\n");
  }

  return [
    `${normalizedDefinition.label} is fully hydrated and ready.`,
    `Registered Application: ${applicationName}`,
    `Required scope: ${firstNonEmptyString([normalizedDefinition.requiredScope])}`,
    `Hydration path: DCR /register + client_credentials token.`,
    `DCR client: ${clientId}`,
    `Token scope: ${tokenScope}`,
    `Result: Make cheatsheet for ${normalizedDefinition.label} using ${applicationName} client ${clientId}.`
  ].join("\n");
}

function buildConcurrencyMonitoringReadyMessage(authenticatedDataContext = {}, matchedTenants = []) {
  const cmContext =
    authenticatedDataContext?.cmContext && typeof authenticatedDataContext.cmContext === "object"
      ? authenticatedDataContext.cmContext
      : {};
  const selectedCmTenant = authenticatedDataContext?.selectedCmTenant || matchedTenants[0] || null;
  const tenantLabel = firstNonEmptyString([
    selectedCmTenant?.label,
    selectedCmTenant?.name,
    selectedCmTenant?.id,
    matchedTenants[0]?.label,
    matchedTenants[0]?.name,
    matchedTenants[0]?.id
  ]);
  const cmuClientId = firstNonEmptyString([cmContext.cmuTokenClientId, CM_CONSOLE_IMS_CLIENT_ID]);
  const cmuTokenHeaderValue = firstNonEmptyString([authenticatedDataContext?.cmuTokenHeaderValue]);
  if (!cmuTokenHeaderValue || matchedTenants.length === 0) {
    return [
      `${PREMIUM_SERVICE_CONCURRENCY_LABEL} is not fully hydrated yet.`,
      `Hydration path: Adobe IMS CMU token (no DCR /register step).`,
      `Matched CM tenants: ${String(matchedTenants.length)}`,
      `Result: ${firstNonEmptyString([cmContext?.errors?.cmuToken, cmContext?.errors?.tenants, cmContext?.status, "LoginButton still needs the CMU token + tenant match before it can use Concurrency Monitoring."])}`
    ].join("\n");
  }

  return [
    `${PREMIUM_SERVICE_CONCURRENCY_LABEL} is fully hydrated and ready.`,
    `Hydration path: Adobe IMS CMU token (no DCR /register step).`,
    `CMU client: ${cmuClientId}`,
    `Header: ${firstNonEmptyString([cmContext.cmuTokenHeaderName, CMU_TOKEN_HEADER_NAME])}`,
    `CM tenant: ${tenantLabel}`,
    `Result: Make cheatsheet for ${PREMIUM_SERVICE_CONCURRENCY_LABEL} using ${cmuClientId}.`
  ].join("\n");
}

async function buildPremiumServiceCheatSheetMessage(item = null) {
  const currentSession = state.session && typeof state.session === "object" ? state.session : null;
  if (!currentSession?.accessToken) {
    throw new Error("Sign in to Adobe first.");
  }

  let authenticatedDataContext = buildAuthenticatedUserDataContext(currentSession);
  const selectedProgrammer = authenticatedDataContext?.selectedProgrammer;
  const programmerId = firstNonEmptyString([selectedProgrammer?.id, selectedProgrammer?.key]);
  if (!programmerId) {
    throw new Error("Choose a Programmer first.");
  }

  await ensureSelectedProgrammerApplicationsLoaded(programmerId);
  authenticatedDataContext = buildAuthenticatedUserDataContext(state.session);
  const refreshedProgrammer = authenticatedDataContext?.selectedProgrammer;
  if (!refreshedProgrammer) {
    throw new Error("LoginButton could not restore the selected Programmer.");
  }

  const normalizedServiceKey = String(item?.serviceKey || "").trim();
  if (normalizedServiceKey === "cm") {
    let matchedTenants = matchProgrammerCmTenants(refreshedProgrammer, authenticatedDataContext.cmTenantOptions);
    if (!authenticatedDataContext?.cmuTokenHeaderValue || matchedTenants.length === 0) {
      await refreshSessionPostLoginContextInBackground(state.session, {
        reason: "premium-service-cheat-sheet"
      });
      authenticatedDataContext = buildAuthenticatedUserDataContext(state.session);
      matchedTenants = matchProgrammerCmTenants(
        authenticatedDataContext?.selectedProgrammer,
        authenticatedDataContext.cmTenantOptions
      );
    }
    return buildConcurrencyMonitoringReadyMessage(authenticatedDataContext, matchedTenants);
  }

  const definition = resolveVaultDcrServiceDefinition(normalizedServiceKey);
  if (!definition) {
    throw new Error(`LoginButton could not resolve the ${firstNonEmptyString([item?.label, "selected"])} premium service.`);
  }

  const snapshot = await persistProgrammerVaultSnapshot(state.session, programmerId, {
    registeredApplications: authenticatedDataContext.registeredApplicationOptions,
    source: "cheat-sheet",
    serviceKeys: [definition.serviceKey]
  });
  const serviceRecord = snapshot?.services?.[definition.serviceKey] || null;

  return buildPremiumServiceClientReadyMessage(
    definition,
    serviceRecord,
    firstNonEmptyString([
      serviceRecord?.registeredApplication?.name,
      serviceRecord?.registeredApplication?.label,
      item?.selectedApplicationName,
      item?.applicationName,
      definition.label
    ])
  );
}

function syncAuthenticatedFieldGroups() {
  if (cmFieldGroup) {
    cmFieldGroup.hidden = [cmuTokenSection, cmTenantPickerSection].every((section) => section?.hidden !== false);
  }

  if (programmerFieldGroup) {
    programmerFieldGroup.hidden = [programmerPickerSection, registeredApplicationPickerSection, requestorPickerSection, premiumServicesSection].every(
      (section) => section?.hidden !== false
    );
  }
}

function syncRequestorPicker(authenticatedDataContext = {}) {
  if (!requestorPicker) {
    return;
  }

  const pickerVisible = authenticatedDataContext?.requestorPickerVisible === true;
  if (requestorPickerSection) {
    requestorPickerSection.hidden = !pickerVisible;
  }
  if (!pickerVisible) {
    requestorPicker.disabled = true;
    requestorPicker.value = REQUESTOR_PICKER_UNAVAILABLE_VALUE;
    return;
  }

  const options = Array.isArray(authenticatedDataContext?.requestorOptions) ? authenticatedDataContext.requestorOptions : [];
  const nextValue = firstNonEmptyString([
    authenticatedDataContext?.selectedRequestor?.key,
    authenticatedDataContext?.selectedRequestor?.id,
    options.length > 0 ? REQUESTOR_PICKER_PLACEHOLDER_VALUE : REQUESTOR_PICKER_UNAVAILABLE_VALUE
  ]);
  const signature = options.map((option) => `${option.key}:${option.label}`).join("|");

  if (requestorPicker.dataset.optionsSignature !== signature) {
    requestorPicker.innerHTML = "";

    if (options.length > 0) {
      const placeholderOption = document.createElement("option");
      placeholderOption.value = REQUESTOR_PICKER_PLACEHOLDER_VALUE;
      placeholderOption.textContent = "Choose a Content Provider";
      requestorPicker.appendChild(placeholderOption);

      options.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.key;
        optionElement.textContent = option.label;
        requestorPicker.appendChild(optionElement);
      });
    } else {
      const unavailableOption = document.createElement("option");
      unavailableOption.value = REQUESTOR_PICKER_UNAVAILABLE_VALUE;
      unavailableOption.textContent = authenticatedDataContext?.selectedProgrammer
        ? "No Content Providers returned"
        : "Choose a Programmer first";
      requestorPicker.appendChild(unavailableOption);
    }

    requestorPicker.dataset.optionsSignature = signature;
  }

  requestorPicker.value = nextValue;
  requestorPicker.disabled = state.busy || !authenticatedDataContext?.selectedProgrammer || options.length === 0;
}

function renderUserDataEntriesInto(container, entries = [], emptyMessage = "No enumerated user fields are available yet.") {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!Array.isArray(entries) || entries.length === 0) {
    const emptyRow = document.createElement("div");
    emptyRow.className = "user-dataRow user-dataRow--empty";
    emptyRow.setAttribute("role", "listitem");

    const emptyValue = document.createElement("p");
    emptyValue.className = "spectrum-Body spectrum-Body--sizeS user-dataValue";
    emptyValue.textContent = emptyMessage;

    emptyRow.appendChild(emptyValue);
    container.appendChild(emptyRow);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "user-dataRow";
    row.setAttribute("role", "listitem");

    const path = document.createElement("p");
    path.className = "spectrum-Detail spectrum-Detail--sizeM user-dataPath";
    path.textContent = firstNonEmptyString([entry?.path, "field"]);

    const value = document.createElement("p");
    value.className = "spectrum-Body spectrum-Body--sizeS user-dataValue";
    value.textContent = firstNonEmptyString([entry?.value, ""]);
    value.title = value.textContent;

    row.append(path, value);
    container.appendChild(row);
  });
}

function syncUserDataList(entries = [], summaryText = "") {
  if (userDataSummary) {
    userDataSummary.textContent = summaryText || "Awaiting session.";
  }
  renderUserDataEntriesInto(userDataList, entries);
}

function syncAuthenticatedMainContentLayout(authenticatedDataContext = {}) {
  const showHero = authenticatedDataContext?.showHero === true;
  const showOrganizationMeta = authenticatedDataContext?.showOrganizationMeta === true;
  const showDetectedOrganizationPicker = authenticatedDataContext?.workflowMode !== "adobe-pass";

  if (authenticatedHero) {
    authenticatedHero.hidden = !showHero;
  }
  if (detectedOrganizationPickerSection) {
    detectedOrganizationPickerSection.hidden = !showDetectedOrganizationPicker;
  }
  if (organizationPickerMeta) {
    organizationPickerMeta.hidden = !showOrganizationMeta;
  }

  if (authenticatedPanelHeader) {
    authenticatedPanelHeader.hidden = true;
  }
  if (authenticatedSummarySection) {
    authenticatedSummarySection.hidden = true;
  }
  if (authenticatedUserDataSection) {
    authenticatedUserDataSection.hidden = true;
  }
}

function syncAvatarMenuDetails(authenticatedDataContext = {}, statusLabel = "") {
  if (avatarMenuOverview) {
    avatarMenuOverview.textContent = [
      firstNonEmptyString([authenticatedDataContext?.activeOrganization?.name, "Adobe organization unavailable"]),
      `Build ${BUILD_VERSION}`,
      statusLabel,
      firstNonEmptyString([authenticatedDataContext?.panelMeta])
    ]
      .filter(Boolean)
      .join(" | ");
  }

  if (avatarMenuSummary) {
    avatarMenuSummary.textContent = firstNonEmptyString([authenticatedDataContext?.cardSummary, "Awaiting session."]);
  }
  renderSummaryCardsInto(
    avatarMenuCardList,
    Array.isArray(authenticatedDataContext?.summaryCards) ? authenticatedDataContext.summaryCards : [],
    "No enumerated summary cards yet",
    "Login Button will mirror the authenticated summary cards here after Adobe user data is available."
  );

  if (avatarMenuUserDataSummary) {
    avatarMenuUserDataSummary.textContent = firstNonEmptyString([authenticatedDataContext?.userDataSummary, "Awaiting session."]);
  }
  renderUserDataEntriesInto(
    avatarMenuUserDataList,
    Array.isArray(authenticatedDataContext?.userDataEntries) ? authenticatedDataContext.userDataEntries : []
  );
}

function syncAvatarMenuUpdateAction() {
  if (!getLatestButton) {
    return;
  }

  const updateAvailable = state.updateAvailable === true;
  const currentVersion = String(chrome.runtime.getManifest()?.version || "").trim();
  const latestVersion = String(state.latestVersion || "").trim();
  const buttonLabel = getLatestButton.querySelector(".spectrum-Button-label");
  const title = state.updateCheckPending
    ? "Checking for the latest LoginButton package."
    : updateAvailable
      ? `Open LoginButton ${latestVersion ? `v${latestVersion}` : "latest"} from GitHub and chrome://extensions${currentVersion ? ` (current v${currentVersion})` : ""}`
      : `Download the latest LoginButton package and open chrome://extensions${currentVersion ? ` (current v${currentVersion})` : ""}`;

  getLatestButton.hidden = false;
  getLatestButton.disabled = state.busy || state.updateCheckPending;
  getLatestButton.title = title;
  getLatestButton.setAttribute("aria-label", title);
  if (buttonLabel) {
    buttonLabel.textContent = "GET LATEST";
  } else {
    getLatestButton.textContent = "GET LATEST";
  }
}

function applyAvatarMenuUpdateState(updateInfo = null) {
  const info = updateInfo && typeof updateInfo === "object" ? updateInfo : null;
  if (!info) {
    return;
  }

  state.updateAvailable = info?.updateAvailable === true;
  state.latestVersion = String(info?.latestVersion || "").trim();
  state.latestCommitSha = String(info?.latestCommitSha || "").trim();
  state.updateCheckError = String(info?.checkError || "").trim();
}

async function loadAvatarMenuUpdateState(force = false) {
  state.updateCheckPending = true;
  render();

  try {
    const response = await sendRuntimeMessageSafe({
      type: LOGINBUTTON_GET_UPDATE_STATE_REQUEST_TYPE,
      force: force === true
    });
    applyAvatarMenuUpdateState(response || null);
    return response || null;
  } catch {
    return null;
  } finally {
    state.updateCheckPending = false;
    render();
  }
}

async function triggerGetLatestWorkflow() {
  if (state.busy || state.updateCheckPending) {
    return;
  }

  setAvatarMenuOpen(false);
  log("Starting latest LoginButton download and opening chrome://extensions.");

  try {
    const response = await sendRuntimeMessageSafe({
      type: LOGINBUTTON_GET_LATEST_REQUEST_TYPE
    });
    if (response?.ok === false) {
      throw new Error(firstNonEmptyString([response?.error, "Unknown error"]));
    }

    applyAvatarMenuUpdateState(response || null);
    render();

    const downloadLabel = firstNonEmptyString([response?.downloadFileName, "latest LoginButton package"]);
    if (response?.downloadStarted === true && response?.extensionsOpened === true) {
      log(`Started ${downloadLabel} download and opened chrome://extensions.`);
      return;
    }
    if (response?.downloadStarted === true) {
      log(`Started ${downloadLabel} download. Open chrome://extensions to finish the update.`);
      return;
    }
    if (response?.downloadTabOpened === true && response?.extensionsOpened === true) {
      log("Opened latest LoginButton package tab and chrome://extensions.");
      return;
    }
    if (response?.downloadTabOpened === true) {
      log("Opened latest LoginButton package tab. Open chrome://extensions to finish the update.");
      return;
    }
    if (response?.extensionsOpened === true) {
      log("Opened chrome://extensions. Start the latest LoginButton download to finish the update.");
      return;
    }

    throw new Error("Unable to open update links");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Get Latest failed: ${message}`);
    window.alert(`Get Latest failed: ${message}`);
  }
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

function setAvatarMenuOpen(open) {
  const nextValue = open === true;
  if (state.avatarMenuOpen === nextValue) {
    return;
  }

  state.avatarMenuOpen = nextValue;
  if (nextValue) {
    void loadAvatarMenuUpdateState();
  }
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
      state.postLoginHydrationInFlight ||
      state.silentAuthInFlight ||
      state.interactiveAuthInFlight ||
      state.avatarAsset.loading ||
      state.programmerApplicationsLoadingFor
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

function buildAuthenticatedOrganizationPickerContext(session = state.session) {
  const detectedOrganizationContext = buildOrganizationContextFromSession(session);
  const activeOrganization = detectedOrganizationContext.activeOrganization;
  const recommendedOrganization = !isAdobePassOrganization(activeOrganization)
    ? findAdobePassOrganizationCandidate(detectedOrganizationContext.options)
    : null;
  const allDetectedOptions = sortOrganizationOptionsForPicker(
    detectedOrganizationContext.options,
    activeOrganization,
    recommendedOrganization
  );
  const options = allDetectedOptions;
  const verification =
    session?.orgVerification && typeof session.orgVerification === "object" ? session.orgVerification : null;
  const shouldOfferInteractiveSwitch = shouldOfferInteractiveOrgSwitch(
    {
      ...detectedOrganizationContext,
      options,
      allDetectedOptions
    },
    session
  );
  const otherOrgCount = allDetectedOptions.filter((option) => option.key !== activeOrganization.key).length;
  const metaParts = [
    activeOrganization.id ? `Current org ${activeOrganization.id}` : activeOrganization.meta,
    verification?.status !== "not-applicable" ? verification?.message : "",
    otherOrgCount > 1
      ? `${otherOrgCount} other Adobe orgs available.`
      : otherOrgCount === 1
        ? "1 other Adobe org available."
        : "No other Adobe orgs available."
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return {
    mode: "detected",
    options,
    allDetectedOptions,
    activeOrganization,
    displayOrganization: activeOrganization,
    experienceOrganization: activeOrganization,
    meta: Array.from(new Set(metaParts)).join(" | ") || activeOrganization.meta,
    listSummary: buildOrganizationListSummary({
      activeOrganization,
      allDetectedOptions
    }),
    help: buildOrganizationPickerHelpText(
      {
        ...detectedOrganizationContext,
        options,
        allDetectedOptions,
        activeOrganization,
        recommendedOrganization
      },
      verification,
      session
    ),
    recommendedOrganization,
    recommendedOrgKey: firstNonEmptyString([recommendedOrganization?.key]),
    shouldOfferInteractiveSwitch,
    emptyLabel: "No available Adobe orgs",
    pickerValue: firstNonEmptyString([activeOrganization.key, options[0]?.key, ORG_PICKER_UNAVAILABLE_VALUE])
  };
}

function buildOrganizationListSummary({ activeOrganization = null, allDetectedOptions = [] } = {}) {
  const totalDetectedCount = Array.isArray(allDetectedOptions) ? allDetectedOptions.length : 0;
  if (totalDetectedCount === 0) {
    return "No additional Adobe orgs are currently available in this session.";
  }

  const activeKey = String(activeOrganization?.key || "").trim();
  const otherOrgCount = allDetectedOptions.filter((option) => String(option?.key || "").trim() !== activeKey).length;
  if (otherOrgCount === 0) {
    return "Showing the current Adobe org only.";
  }

  return `Showing ${totalDetectedCount} available Adobe orgs, including ${otherOrgCount} other org${otherOrgCount === 1 ? "" : "s"}.`;
}

function sortOrganizationOptionsForPicker(options = [], activeOrganization = null, recommendedOrganization = null) {
  const activeKey = String(activeOrganization?.key || "").trim();
  const recommendedKey = String(recommendedOrganization?.key || "").trim();
  return [...(Array.isArray(options) ? options : [])].sort((left, right) => {
    const leftKey = String(left?.key || "").trim();
    const rightKey = String(right?.key || "").trim();
    if (leftKey === activeKey && rightKey !== activeKey) {
      return -1;
    }
    if (rightKey === activeKey && leftKey !== activeKey) {
      return 1;
    }
    if (recommendedKey && leftKey === recommendedKey && rightKey !== recommendedKey && rightKey !== activeKey) {
      return -1;
    }
    if (recommendedKey && rightKey === recommendedKey && leftKey !== recommendedKey && leftKey !== activeKey) {
      return 1;
    }

    return String(left?.label || left?.name || "").localeCompare(String(right?.label || right?.name || ""), undefined, {
      sensitivity: "base"
    });
  });
}

function normalizeRequestedTargetOrganization(targetOrganization = null) {
  if (!targetOrganization || typeof targetOrganization !== "object") {
    return null;
  }

  const tenantId = firstNonEmptyString([
    targetOrganization.tenantId,
    targetOrganization.tenant_id,
    extractTenantOrganizationId(targetOrganization)
  ]);
  const imsOrgId = firstNonEmptyString([
    targetOrganization.imsOrgId,
    targetOrganization.ims_org_id,
    extractImsOrganizationId(targetOrganization)
  ]);
  const id = firstNonEmptyString([
    targetOrganization.id,
    targetOrganization.orgId,
    targetOrganization.organizationId,
    tenantId,
    imsOrgId,
    extractOrganizationId(targetOrganization)
  ]);
  const name =
    firstNonEmptyString([
      targetOrganization.name,
      targetOrganization.orgName,
      targetOrganization.organizationName,
      targetOrganization.label,
      extractOrganizationName(targetOrganization),
      id ? `Adobe IMS Org ${id}` : ""
    ]) || "Adobe organization";
  const label = firstNonEmptyString([
    targetOrganization.label,
    buildOrganizationOptionLabel({ id, name }),
    name
  ]);
  const key = firstNonEmptyString([targetOrganization.key, buildOrganizationOptionKey({ id, name: label })]);
  if (!key) {
    return null;
  }

  return {
    key,
    id,
    tenantId: firstNonEmptyString([tenantId, id && !/@adobeorg$/i.test(id) ? id : ""]),
    imsOrgId: firstNonEmptyString([imsOrgId, /@adobeorg$/i.test(id) ? id : ""]),
    name,
    label,
    userId: firstNonEmptyString([targetOrganization.userId, targetOrganization.clusterUserId]),
    clusterUserId: firstNonEmptyString([targetOrganization.clusterUserId, targetOrganization.userId]),
    clusterUserType: firstNonEmptyString([targetOrganization.clusterUserType, targetOrganization.userType]),
    hinted: targetOrganization.hinted === true,
    isAdobePass: isAdobePassOrganization(targetOrganization),
    source: firstNonEmptyString([targetOrganization.source, "session-picker"])
  };
}

function attachTargetOrganizationToSession(session, targetOrganization) {
  const nextSession = session && typeof session === "object" ? { ...session } : {};
  const normalizedTargetOrganization = normalizeRequestedTargetOrganization(targetOrganization);
  if (normalizedTargetOrganization) {
    nextSession.targetOrganization = normalizedTargetOrganization;
  } else {
    delete nextSession.targetOrganization;
  }
  return nextSession;
}

function verifyTargetOrganizationSelection(session, targetOrganization) {
  const normalizedTargetOrganization = normalizeRequestedTargetOrganization(targetOrganization);
  if (!normalizedTargetOrganization?.key) {
    return {
      status: "not-applicable",
      source: "n/a",
      expectedOrgId: "",
      expectedOrgKey: "",
      verifiedOrgId: "",
      resolvedOrgId: "",
      resolvedOrgKey: "",
      message: "No Adobe IMS org switch was requested before sign-in."
    };
  }

  const requestedLabel = firstNonEmptyString([
    normalizedTargetOrganization.label,
    normalizedTargetOrganization.name,
    normalizedTargetOrganization.id,
    "selected Adobe IMS org"
  ]);
  const expectedOrgId = normalizeOrganizationIdentifier(
    firstNonEmptyString([
      normalizedTargetOrganization.imsOrgId,
      normalizedTargetOrganization.tenantId,
      normalizedTargetOrganization.id
    ])
  );
  const expectedOrgKey = String(normalizedTargetOrganization.key || "").trim();
  const expectedOrgIdentifiers = collectOrganizationIdentifierSet(normalizedTargetOrganization);
  const verifiedClaim = extractVerifiedCustomerOrganizationClaim(session);
  const resolvedActiveOrganization = buildOrganizationContextFromSession(session).activeOrganization;
  const resolvedOrgIdentifiers = collectOrganizationIdentifierSet(resolvedActiveOrganization);
  const resolvedOrgId = normalizeOrganizationIdentifier(resolvedActiveOrganization.id);
  const resolvedOrgKey = String(resolvedActiveOrganization.key || "").trim();

  if (verifiedClaim.id) {
    const verifiedMatch = expectedOrgIdentifiers.has(verifiedClaim.id);
    return {
      status: verifiedMatch ? "verified-match" : "verified-mismatch",
      source: verifiedClaim.source,
      expectedOrgId,
      expectedOrgKey,
      verifiedOrgId: verifiedClaim.id,
      resolvedOrgId,
      resolvedOrgKey,
      message:
        verifiedMatch
          ? `Adobe returned the requested Adobe IMS org ${requestedLabel} via ${verifiedClaim.source}.`
          : `Adobe returned verified org ${firstNonEmptyString([verifiedClaim.rawId, verifiedClaim.id])} via ${verifiedClaim.source} instead of ${requestedLabel}.`
    };
  }

  if (resolvedOrgKey) {
    const resolvedMatch =
      resolvedOrgIdentifiers.size > 0 && hasIdentifierIntersection(expectedOrgIdentifiers, resolvedOrgIdentifiers);
    return {
      status: resolvedMatch ? "derived-match" : "derived-mismatch",
      source: "resolved-payload",
      expectedOrgId,
      expectedOrgKey,
      verifiedOrgId: "",
      resolvedOrgId,
      resolvedOrgKey,
      message:
        resolvedMatch
          ? `Resolved the requested Adobe IMS org ${requestedLabel} from the returned payloads.`
          : `Adobe returned ${firstNonEmptyString([resolvedActiveOrganization.label, resolvedActiveOrganization.name, resolvedActiveOrganization.id, "another Adobe IMS org"])} instead of ${requestedLabel}.`
    };
  }

  return {
    status: "no-org-claim",
    source: "unavailable",
    expectedOrgId,
    expectedOrgKey,
    verifiedOrgId: "",
    resolvedOrgId: "",
    resolvedOrgKey: "",
    message: `Adobe did not return enough org data to verify the requested Adobe IMS org ${requestedLabel}.`
  };
}

function extractVerifiedCustomerOrganizationClaim(session) {
  const idTokenClaims = session?.idTokenClaims && typeof session.idTokenClaims === "object" ? session.idTokenClaims : {};
  const accessTokenClaims = session?.accessTokenClaims && typeof session.accessTokenClaims === "object" ? session.accessTokenClaims : {};
  const candidatePairs = [
    { value: idTokenClaims.org_id, source: "id_token.org_id" },
    { value: idTokenClaims.orgId, source: "id_token.orgId" },
    { value: idTokenClaims.organizationId, source: "id_token.organizationId" },
    { value: idTokenClaims.organization_id, source: "id_token.organization_id" },
    { value: accessTokenClaims.org_id, source: "access_token.org_id" },
    { value: accessTokenClaims.orgId, source: "access_token.orgId" },
    { value: accessTokenClaims.organizationId, source: "access_token.organizationId" },
    { value: accessTokenClaims.organization_id, source: "access_token.organization_id" }
  ];

  for (const pair of candidatePairs) {
    const normalized = normalizeOrganizationIdentifier(pair.value);
    if (normalized) {
      return {
        id: normalized,
        rawId: String(pair.value || "").trim(),
        source: pair.source
      };
    }
  }

  return {
    id: "",
    rawId: "",
    source: ""
  };
}

function isSuccessfulTargetOrganizationVerification(verification = null) {
  const status = String(verification?.status || "").trim();
  return status === "verified-match" || status === "derived-match";
}

function syncDetectedOrganizationList(organizationContext) {
  if (!organizationCardList || !organizationListSummary || !organizationReauthButton) {
    return;
  }

  const activeOrganization = organizationContext?.activeOrganization || null;
  const allDetectedOptions = Array.isArray(organizationContext?.allDetectedOptions) ? organizationContext.allDetectedOptions : [];
  const switchableKeys = new Set(
    (Array.isArray(organizationContext?.options) ? organizationContext.options : []).map((option) => String(option?.key || "").trim())
  );
  const activeKey = String(activeOrganization?.key || "").trim();

  organizationListSummary.textContent = firstNonEmptyString([
    organizationContext?.listSummary,
    "Adobe did not return a detected org list for this session."
  ]);
  organizationCardList.innerHTML = "";

  if (allDetectedOptions.length === 0) {
    const emptyCard = document.createElement("article");
    emptyCard.className = "org-card org-card--empty";
    emptyCard.setAttribute("role", "listitem");

    const emptyTitle = document.createElement("p");
    emptyTitle.className = "spectrum-Heading spectrum-Heading--sizeS org-cardEmptyTitle";
    emptyTitle.textContent = "No detected orgs returned";

    const emptyBody = document.createElement("p");
    emptyBody.className = "spectrum-Body spectrum-Body--sizeS org-cardEmptyBody";
    emptyBody.textContent = firstNonEmptyString([
      organizationContext?.help,
      "Adobe did not return any org memberships in the current session payloads."
    ]);

    emptyCard.append(emptyTitle, emptyBody);
    organizationCardList.appendChild(emptyCard);
  } else {
    allDetectedOptions.forEach((option) => {
      const isActive = String(option?.key || "").trim() === activeKey;
      const isSwitchable = switchableKeys.has(String(option?.key || "").trim());
      const card = document.createElement("article");
      card.className = `org-card${isActive ? " is-active" : ""}`;
      card.setAttribute("role", "listitem");
      if (isActive) {
        card.setAttribute("aria-current", "true");
      }

      const header = document.createElement("div");
      header.className = "org-cardHeader";

      const identity = document.createElement("div");
      identity.className = "org-cardIdentity";

      const name = document.createElement("p");
      name.className = "spectrum-Heading spectrum-Heading--sizeS org-cardName";
      name.textContent = firstNonEmptyString([option?.name, option?.label, "Adobe organization"]);

      const caption = document.createElement("p");
      caption.className = "spectrum-Body spectrum-Body--sizeS org-cardCaption";
      caption.textContent = isActive ? "Active in the current Adobe IMS session." : "Detected in Adobe session data.";

      identity.append(name, caption);

      const status = document.createElement("span");
      status.className = `spectrum-Detail spectrum-Detail--sizeS org-cardStatus${isActive ? " is-active" : ""}`;
      status.textContent = isActive ? "Current org" : "Detected org";

      header.append(identity, status);

      const meta = document.createElement("div");
      meta.className = "org-cardMeta";

      const idField = document.createElement("div");
      idField.className = "org-cardField";

      const idLabel = document.createElement("p");
      idLabel.className = "spectrum-Detail spectrum-Detail--sizeM org-cardFieldLabel";
      idLabel.textContent = "Org ID";

      const idValue = document.createElement("p");
      idValue.className = "spectrum-Body spectrum-Body--sizeS org-cardFieldValue";
      idValue.textContent = firstNonEmptyString([option?.id, "Not returned"]);

      idField.append(idLabel, idValue);

      const sourceField = document.createElement("div");
      sourceField.className = "org-cardField";

      const sourceLabel = document.createElement("p");
      sourceLabel.className = "spectrum-Detail spectrum-Detail--sizeM org-cardFieldLabel";
      sourceLabel.textContent = "Detected from";

      const sourceValue = document.createElement("p");
      sourceValue.className = "spectrum-Body spectrum-Body--sizeS org-cardFieldValue";
      const sourceLabels = normalizeOrganizationSourceLabels(option);
      sourceValue.textContent = sourceLabels[0] || "Unavailable";
      if (sourceLabels.length > 1) {
        sourceValue.textContent = `${sourceLabels[0]} + ${sourceLabels.length - 1} more`;
        sourceValue.title = sourceLabels.join(" | ");
      }

      sourceField.append(sourceLabel, sourceValue);
      meta.append(idField, sourceField);
      card.append(header, meta);

      if (!isActive && isSwitchable) {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "spectrum-Button spectrum-Button--outline spectrum-Button--primary spectrum-Button--sizeM org-cardAction";
        action.disabled = state.busy;

        const label = document.createElement("span");
        label.className = "spectrum-Button-label";
        label.textContent = "SWITCH TO THIS ORG";

        action.appendChild(label);
        action.addEventListener("click", async () => {
          await requestOrganizationSwitch(option.key);
        });
        card.appendChild(action);
      }

      organizationCardList.appendChild(card);
    });
  }

  organizationReauthButton.hidden = !Boolean(organizationContext?.shouldOfferInteractiveSwitch);
  organizationReauthButton.disabled = state.busy || !state.session?.accessToken;
}

function normalizeOrganizationSourceLabels(option = {}) {
  const rawSources = Array.isArray(option?.sources) ? option.sources : [];
  const primarySource = firstNonEmptyString([option?.source]);
  const orderedSources = [];

  [primarySource, ...rawSources].forEach((source) => {
    const normalized = String(source || "").trim();
    if (normalized && !orderedSources.includes(normalized)) {
      orderedSources.push(normalized);
    }
  });

  return orderedSources.map((source) => formatOrganizationSourceLabel(source));
}

function formatOrganizationSourceLabel(source = "") {
  const normalizedSource = String(source || "").trim();
  if (!normalizedSource) {
    return "";
  }
  if (/^runtimeConfig\.organizations\[\d+\]/.test(normalizedSource)) {
    return "ZIP.KEY configured organizations";
  }
  if (/^unifiedShell\.imsExtendedAccountClusterData\[\d+\]\.owningOrg/.test(normalizedSource)) {
    return "Unified Shell owning org";
  }
  if (/^unifiedShell\.imsExtendedAccountClusterData\[\d+\]\.orgs\[\d+\]/.test(normalizedSource)) {
    return "Unified Shell org cluster";
  }
  if (/^unifiedShell\.organizations\[\d+\]/.test(normalizedSource)) {
    return "Unified Shell organizations";
  }
  if (/^organizations\[\d+\]/.test(normalizedSource)) {
    return "Adobe organizations endpoint";
  }
  if (/^profile\.additional_info\.projectedProductContext/i.test(normalizedSource)) {
    return "IMS profile projected product context";
  }
  if (/^profile\.projectedProductContext/i.test(normalizedSource)) {
    return "Profile projected product context";
  }
  if (/^profile\.additional_info/i.test(normalizedSource)) {
    return "IMS profile additional info";
  }
  if (/^profile/i.test(normalizedSource)) {
    return "Adobe profile";
  }
  if (/^idClaims/i.test(normalizedSource)) {
    return "ID token claims";
  }
  if (/^accessClaims/i.test(normalizedSource)) {
    return "Access token claims";
  }
  if (/^session\.organizations\[\d+\]/.test(normalizedSource)) {
    return "Stored session organizations";
  }
  if (/^session\.detectedOrganizations\[\d+\]/.test(normalizedSource)) {
    return "Stored detected organizations";
  }

  return normalizedSource;
}

function syncOrganizationPicker(organizationContext) {
  if (!organizationPicker) {
    return;
  }

  const options = Array.isArray(organizationContext?.options) ? organizationContext.options : [];
  const shouldOfferInteractiveSwitch = organizationContext?.shouldOfferInteractiveSwitch === true;
  const optionsSignature = buildOrganizationPickerOptionsSignature({
    mode: organizationContext?.mode,
    options,
    includeUnavailablePlaceholder: options.length === 0,
    includeInteractiveSwitch: shouldOfferInteractiveSwitch
  });
  const nextValue = firstNonEmptyString([
    organizationContext?.pickerValue,
    options.length > 0 ? ORG_PICKER_PLACEHOLDER_VALUE : "",
    ORG_PICKER_UNAVAILABLE_VALUE
  ]);

  if (organizationPicker.dataset.optionsSignature !== optionsSignature) {
    organizationPicker.innerHTML = "";

    if (options.length > 0) {
      const placeholderOption = document.createElement("option");
      placeholderOption.value = ORG_PICKER_PLACEHOLDER_VALUE;
      placeholderOption.textContent = firstNonEmptyString([organizationContext?.placeholderLabel, "Choose another Adobe org"]);
      organizationPicker.appendChild(placeholderOption);
    } else {
      const unavailableOption = document.createElement("option");
      unavailableOption.value = ORG_PICKER_UNAVAILABLE_VALUE;
      unavailableOption.textContent = firstNonEmptyString([organizationContext?.emptyLabel, "No other detected Adobe orgs"]);
      organizationPicker.appendChild(unavailableOption);
    }

    options.forEach((option) => {
      const optionElement = document.createElement("option");
      optionElement.value = option.key;
      optionElement.textContent = option.label;
      organizationPicker.appendChild(optionElement);
    });

    if (shouldOfferInteractiveSwitch) {
      const reauthOption = document.createElement("option");
      reauthOption.value = ORG_PICKER_REAUTH_VALUE;
      reauthOption.textContent = "Sign in again to discover more Adobe orgs";
      organizationPicker.appendChild(reauthOption);
    }

    organizationPicker.dataset.optionsSignature = optionsSignature;
  }

  organizationPicker.value = nextValue;
  organizationPicker.disabled = state.busy || (options.length === 0 && !shouldOfferInteractiveSwitch);
}

function buildOrganizationPickerOptionsSignature({
  mode = "detected",
  options = [],
  includeUnavailablePlaceholder = false,
  includeInteractiveSwitch = false
} = {}) {
  if (!Array.isArray(options) || options.length === 0) {
    return `${mode}|unavailable=${includeUnavailablePlaceholder ? "yes" : "no"}|interactive=${includeInteractiveSwitch ? "yes" : "no"}|empty`;
  }

  return `${mode}|unavailable=${includeUnavailablePlaceholder ? "yes" : "no"}|interactive=${includeInteractiveSwitch ? "yes" : "no"}|${options.map((option) => `${option.key}:${option.label}`).join("|")}`;
}

async function requestOrganizationSwitch(nextKey = "") {
  const normalizedKey = String(nextKey || "").trim();
  if (!normalizedKey || normalizedKey === ORG_PICKER_PLACEHOLDER_VALUE || state.busy) {
    render();
    return;
  }
  if (normalizedKey === ORG_PICKER_REAUTH_VALUE) {
    log("Starting Sign In Again so Adobe can reopen the account chooser for a different org.");
    await switchAdobeOrganization();
    return;
  }

  const organizationPickerContext = buildAuthenticatedOrganizationPickerContext(state.session);
  const nextOrganization = organizationPickerContext.options.find((option) => option.key === normalizedKey) || null;
  if (!nextOrganization) {
    render();
    return;
  }

  if (nextOrganization.key === organizationPickerContext.activeOrganization.key) {
    render();
    return;
  }

  log(
    `Switching Adobe IMS org to ${nextOrganization.label}. Login Button will reopen Adobe sign-in, let the user choose the org explicitly, and then verify the returned profile.`
  );
  await switchAdobeOrganization(nextOrganization);
}

async function switchAdobeOrganization(targetOrganization = null) {
  if (!state.session?.accessToken || state.busy) {
    return;
  }

  const normalizedTargetOrganization = normalizeRequestedTargetOrganization(targetOrganization);
  await login({
    forceInteractive: true,
    forceBrowserLogout: true,
    prompt: "login",
    intent: "org-switch",
    targetOrganization: normalizedTargetOrganization
  });
}

function getCurrentOrganizationScope(session = state.session) {
  return normalizeScopeList(
    firstNonEmptyString([session?.scope, state.runtimeConfig?.scope, IMS_SCOPE]),
    IMS_SCOPE
  );
}

function shouldOfferInteractiveOrgSwitch(organizationContext, session = state.session) {
  const optionCount = Array.isArray(organizationContext?.options) ? organizationContext.options.length : 0;
  if (!session?.accessToken) {
    return false;
  }

  if (!isAdobePassOrganization(organizationContext?.activeOrganization)) {
    return true;
  }

  return optionCount === 0 || !scopeIncludes(getCurrentOrganizationScope(session), IMS_ORG_DISCOVERY_SCOPE);
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
      ? "color-mix(in srgb, var(--spectrum-accent-color-400) 24%, var(--spectrum-gray-400) 76%)"
      : "color-mix(in srgb, var(--spectrum-accent-color-900) 34%, var(--spectrum-gray-600) 66%)"
  );
  body.style.setProperty("--login-button-theme-shell", "var(--login-button-surface-background)");
}

function composeDebugConsoleOutput({ ready, hasSession, flow, expired }) {
  const lines = [];
  const session = state.session;
  const activeTheme = normalizeThemePreference(state.theme);
  const activeAccent = getThemeAccentMeta(activeTheme.accent);
  const hasRuntimeConfig = Boolean(firstNonEmptyString([state.runtimeConfig?.clientId]));
  const currentView = getCurrentView({ ready, hasSession, hasRuntimeConfig });
  const profile = session?.profile && typeof session.profile === "object" ? session.profile : null;
  const idClaims = session?.idTokenClaims || null;
  const organizationContext = buildOrganizationContextFromSession(session);
  const authenticatedDataContext = buildAuthenticatedUserDataContext(session);
  const consoleContext =
    authenticatedDataContext?.consoleContext && typeof authenticatedDataContext.consoleContext === "object"
      ? authenticatedDataContext.consoleContext
      : {};
  const unifiedShellContext =
    authenticatedDataContext?.unifiedShellContext && typeof authenticatedDataContext.unifiedShellContext === "object"
      ? authenticatedDataContext.unifiedShellContext
      : {};
  const cmContext =
    authenticatedDataContext?.cmContext && typeof authenticatedDataContext.cmContext === "object"
      ? authenticatedDataContext.cmContext
      : {};
  const programmerAccess =
    consoleContext?.programmerAccess && typeof consoleContext.programmerAccess === "object"
      ? consoleContext.programmerAccess
      : resolveProgrammerAccessContext(session);
  const selectedCmTenant = authenticatedDataContext?.selectedCmTenant || null;
  const selectedProgrammer = authenticatedDataContext?.selectedProgrammer || null;
  const selectedRegisteredApplication = authenticatedDataContext?.selectedRegisteredApplication || null;
  const selectedRequestor = authenticatedDataContext?.selectedRequestor || null;
  const activeOrganization = organizationContext.activeOrganization;
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
    `programmer_count=${Array.isArray(consoleContext?.programmers) ? consoleContext.programmers.length : 0}`,
    `requestor_count=${Array.isArray(authenticatedDataContext?.requestorOptions) ? authenticatedDataContext.requestorOptions.length : 0}`,
    `registered_application_count=${Array.isArray(authenticatedDataContext?.registeredApplicationOptions) ? authenticatedDataContext.registeredApplicationOptions.length : 0}`,
    `programmer_gate=${programmerAccess?.eligible ? "adobepass-active" : "adobepass-required"}`,
    `cm_tenant_count=${Array.isArray(cmContext?.tenants) ? cmContext.tenants.length : 0}`,
    `selected_cm_tenant=${firstNonEmptyString([selectedCmTenant?.label, "n/a"])}`,
    `selected_cm_tenant_id=${firstNonEmptyString([selectedCmTenant?.id, "n/a"])}`,
    `selected_programmer=${firstNonEmptyString([selectedProgrammer?.label, "n/a"])}`,
    `selected_programmer_id=${firstNonEmptyString([selectedProgrammer?.id, "n/a"])}`,
    `selected_registered_application=${firstNonEmptyString([selectedRegisteredApplication?.label, "n/a"])}`,
    `selected_registered_application_id=${firstNonEmptyString([selectedRegisteredApplication?.id, "n/a"])}`,
    `selected_requestor=${firstNonEmptyString([selectedRequestor?.label, "n/a"])}`,
    `selected_requestor_id=${firstNonEmptyString([selectedRequestor?.id, "n/a"])}`,
    `stored_detected_org_count=${Array.isArray(session?.detectedOrganizations) ? session.detectedOrganizations.length : 0}`,
    `raw_org_object_count=${flattenOrganizations(session?.organizations).length}`,
    `detected_org_option_count=${organizationContext.options.length}`,
    `unified_shell_org_count=${Array.isArray(unifiedShellContext?.organizations) ? unifiedShellContext.organizations.length : 0}`,
    `active_org_key=${firstNonEmptyString([activeOrganization.key, "n/a"])}`,
    `requested_org_label=${firstNonEmptyString([session?.targetOrganization?.label, "n/a"])}`,
    `requested_org_id=${firstNonEmptyString([session?.targetOrganization?.id, "n/a"])}`,
    `requested_org_key=${firstNonEmptyString([session?.targetOrganization?.key, "n/a"])}`,
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
    `ims_auth_id=${firstNonEmptyString([imsSession?.authId, "n/a"])}`,
    `org_verification_status=${firstNonEmptyString([session?.orgVerification?.status, "n/a"])}`,
    `org_verification_source=${firstNonEmptyString([session?.orgVerification?.source, "n/a"])}`,
    `org_verification_message=${firstNonEmptyString([session?.orgVerification?.message, "n/a"])}`
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
    `effective_auth_redirect_uri=${firstNonEmptyString([getEffectiveAuthRedirectUri(), "unavailable"])}`,
    `browser_language=${firstNonEmptyString([navigator.language, "unavailable"])}`,
    `browser_timezone=${firstNonEmptyString([Intl.DateTimeFormat().resolvedOptions().timeZone, "unavailable"])}`
  ]);

  pushDebugSection(lines, "credential", [
    `zip_key_loaded=${hasRuntimeConfig ? "yes" : "no"}`,
    `zip_key_client_id=${firstNonEmptyString([state.runtimeConfig?.clientId, "not-loaded"])}`,
    `zip_key_scope=${zipKeyScope}`,
    `zip_key_raw_scope=${firstNonEmptyString([state.runtimeConfig?.rawScope, "n/a"])}`,
    `zip_key_redirect_uri=${firstNonEmptyString([state.runtimeConfig?.redirectUri, "n/a"])}`,
    `zip_key_dropped_scopes=${droppedScopes}`,
    `zip_key_console_environment=${firstNonEmptyString([state.runtimeConfig?.consoleEnvironment, "n/a"])}`,
    `zip_key_console_base_url=${firstNonEmptyString([state.runtimeConfig?.consoleBaseUrl, "n/a"])}`,
    `zip_key_source=${firstNonEmptyString([state.runtimeConfig?.source, "defaults"])}`,
    `zip_key_imported_at=${firstNonEmptyString([state.runtimeConfig?.importedAt, "not-imported"])}`
  ]);

  pushDebugSection(lines, "console", [
    `console_status=${firstNonEmptyString([consoleContext?.status, "n/a"])}`,
    `console_environment=${firstNonEmptyString([consoleContext?.environmentId, "n/a"])}`,
    `console_environment_label=${firstNonEmptyString([consoleContext?.environmentLabel, "n/a"])}`,
    `console_expected_ims=${firstNonEmptyString([consoleContext?.expectedImsEnvironment, "n/a"])}`,
    `console_base_url=${firstNonEmptyString([consoleContext?.baseUrl, "n/a"])}`,
    `console_transport=${firstNonEmptyString([consoleContext?.transport, "n/a"])}`,
    `console_page_context_origin=${firstNonEmptyString([consoleContext?.pageContextOrigin, "n/a"])}`,
    `console_page_context_url=${firstNonEmptyString([consoleContext?.pageContextUrl, "n/a"])}`,
    `console_configuration_version=${firstNonEmptyString([consoleContext?.configurationVersion, "n/a"])}`,
    `console_role_count=${Array.isArray(consoleContext?.roles) ? consoleContext.roles.length : 0}`,
    `console_roles=${Array.isArray(consoleContext?.roles) && consoleContext.roles.length > 0 ? consoleContext.roles.join(" ") : "n/a"}`,
    `console_channel_count=${Array.isArray(consoleContext?.channels) ? consoleContext.channels.length : 0}`,
    `console_programmer_count=${Array.isArray(consoleContext?.programmers) ? consoleContext.programmers.length : 0}`,
    `console_registered_application_count=${Array.isArray(authenticatedDataContext?.registeredApplicationOptions) ? authenticatedDataContext.registeredApplicationOptions.length : 0}`,
    `console_requestor_count=${Array.isArray(authenticatedDataContext?.requestorOptions) ? authenticatedDataContext.requestorOptions.length : 0}`,
    `console_premium_service_count=${Array.isArray(authenticatedDataContext?.premiumServiceItems) ? authenticatedDataContext.premiumServiceItems.length : 0}`,
    `console_premium_services_summary=${firstNonEmptyString([authenticatedDataContext?.premiumServicesSummary, "n/a"])}`,
    `console_programmer_gate_reason=${firstNonEmptyString([programmerAccess?.reason, "n/a"])}`,
    `console_extended_profile_error=${firstNonEmptyString([consoleContext?.errors?.extendedProfile, "n/a"])}`,
    `console_channels_error=${firstNonEmptyString([consoleContext?.errors?.channels, "n/a"])}`,
    `console_programmers_error=${firstNonEmptyString([consoleContext?.errors?.programmers, "n/a"])}`,
    `console_registered_applications_error=${firstNonEmptyString([consoleContext?.applicationErrorsByProgrammer?.[selectedProgrammer?.id], "n/a"])}`,
    `console_hydrated_at=${firstNonEmptyString([consoleContext?.hydratedAt, "n/a"])}`
  ]);

  pushDebugSection(lines, "cm", [
    `cm_status=${firstNonEmptyString([cmContext?.status, "n/a"])}`,
    `cm_base_url=${firstNonEmptyString([cmContext?.baseUrl, "n/a"])}`,
    `cm_reports_base_url=${firstNonEmptyString([cmContext?.reportsBaseUrl, "n/a"])}`,
    `cm_check_token_endpoint=${firstNonEmptyString([cmContext?.checkTokenEndpoint, "n/a"])}`,
    `cm_validate_token_endpoint=${firstNonEmptyString([cmContext?.validateTokenEndpoint, "n/a"])}`,
    `cm_tenant_auth_model=${firstNonEmptyString([cmContext?.tenantAuthModel, "n/a"])}`,
    `cm_cmu_auth_model=${firstNonEmptyString([cmContext?.cmuAuthModel, "n/a"])}`,
    `cm_cmu_token_source=${firstNonEmptyString([cmContext?.cmuTokenSource, "n/a"])}`,
    `cm_cmu_token_client_id=${firstNonEmptyString([cmContext?.cmuTokenClientId, "n/a"])}`,
    `cm_cmu_token_scope=${firstNonEmptyString([cmContext?.cmuTokenScope, "n/a"])}`,
    `cm_cmu_token_user_id=${firstNonEmptyString([cmContext?.cmuTokenUserId, "n/a"])}`,
    `cm_cmu_token_expires_at=${firstNonEmptyString([cmContext?.cmuTokenExpiresAt, "n/a"])}`,
    `cm_cmu_token_header=${firstNonEmptyString([cmContext?.cmuTokenHeaderName, "n/a"])}`,
    `cm_cmu_token_present=${cmContext?.cmuTokenHeaderValue ? "yes" : "no"}`,
    `cm_reports_status=${firstNonEmptyString([cmContext?.reportsStatus, "n/a"])}`,
    `cm_tenant_count=${Array.isArray(cmContext?.tenants) ? cmContext.tenants.length : 0}`,
    `cm_selected_tenant=${firstNonEmptyString([selectedCmTenant?.label, "n/a"])}`,
    `cm_selected_tenant_id=${firstNonEmptyString([selectedCmTenant?.id, "n/a"])}`,
    `cm_cmu_token_error=${firstNonEmptyString([cmContext?.errors?.cmuToken, "n/a"])}`,
    `cm_reports_error=${firstNonEmptyString([cmContext?.errors?.reports, "n/a"])}`,
    `cm_tenants_error=${firstNonEmptyString([cmContext?.errors?.tenants, "n/a"])}`,
    `cm_hydrated_at=${firstNonEmptyString([cmContext?.hydratedAt, "n/a"])}`
  ]);

  pushDebugSection(lines, "unified_shell", [
    `unified_shell_status=${firstNonEmptyString([unifiedShellContext?.status, "n/a"])}`,
    `unified_shell_selected_org=${firstNonEmptyString([unifiedShellContext?.selectedOrg, "n/a"])}`,
    `unified_shell_cluster_count=${Number(unifiedShellContext?.clusterCount || 0)}`,
    `unified_shell_organization_count=${Array.isArray(unifiedShellContext?.organizations) ? unifiedShellContext.organizations.length : 0}`,
    `unified_shell_timestamp=${firstNonEmptyString([unifiedShellContext?.timestamp, "n/a"])}`,
    `unified_shell_user_profile=${unifiedShellContext?.userProfile ? "returned" : "n/a"}`,
    `unified_shell_error=${firstNonEmptyString([unifiedShellContext?.errors?.init, "n/a"])}`,
    `unified_shell_hydrated_at=${firstNonEmptyString([unifiedShellContext?.hydratedAt, "n/a"])}`
  ]);

  pushDebugSection(lines, "endpoints", [
    `authorize_endpoint=${firstNonEmptyString([flow?.authorizationEndpoint, state.authConfiguration?.authorization_endpoint, "n/a"])}`,
    `token_endpoint=${firstNonEmptyString([flow?.tokenEndpoint, state.authConfiguration?.token_endpoint, "n/a"])}`,
    `userinfo_endpoint=${firstNonEmptyString([flow?.userInfoEndpoint, state.authConfiguration?.userinfo_endpoint, "n/a"])}`,
    `organizations_endpoint=${firstNonEmptyString([flow?.organizationsEndpoint, IMS_ORGS_URL])}`,
    `console_extended_profile_endpoint=${firstNonEmptyString([consoleContext?.baseUrl ? `${consoleContext.baseUrl}${CONSOLE_USER_EXTENDED_PROFILE_PATH}` : "", "n/a"])}`,
    `console_channels_endpoint=${firstNonEmptyString([consoleContext?.baseUrl ? `${consoleContext.baseUrl}${CONSOLE_CHANNELS_PATH}` : "", "n/a"])}`,
    `console_programmers_endpoint=${firstNonEmptyString([consoleContext?.baseUrl ? `${consoleContext.baseUrl}${CONSOLE_PROGRAMMERS_PATH}` : "", "n/a"])}`,
    `console_registered_applications_endpoint=${firstNonEmptyString([
      consoleContext?.baseUrl && consoleContext?.configurationVersion && selectedProgrammer?.id
        ? `${consoleContext.baseUrl}${CONSOLE_APPLICATIONS_PATH}?programmer=${encodeURIComponent(selectedProgrammer.id)}&configurationVersion=${encodeURIComponent(consoleContext.configurationVersion)}`
        : "",
      "n/a"
    ])}`,
    `cmu_token_endpoint=${firstNonEmptyString([
      cmContext?.checkTokenEndpoint
        ? `${cmContext.checkTokenEndpoint}?client_id=${encodeURIComponent(CM_CONSOLE_IMS_CLIENT_ID)}&scope=${encodeURIComponent(CM_CONSOLE_IMS_SCOPE)}&user_id=${encodeURIComponent(firstNonEmptyString([cmContext?.cmuTokenUserId, session?.imsSession?.userId, ""]))}`
        : "",
      "n/a"
    ])}`,
    `cmu_validate_endpoint=${firstNonEmptyString([cmContext?.validateTokenEndpoint, "n/a"])}`,
    `cmu_reports_endpoint=${CM_REPORTS_BASE_URL}${CM_REPORTS_SUMMARY_PATH}?format=json`,
    `cm_tenants_endpoint=${CM_BASE_URL}${CM_TENANTS_PATH}?orgId=${CM_TENANTS_OWNER_ORG_ID}`,
    `unified_shell_graphql_endpoint=${UNIFIED_SHELL_GRAPHQL_URL}`
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

function getChromeIdentityRedirectUri() {
  return normalizeImsRedirectUri(firstNonEmptyString([state.runtime.redirectUri, getExtensionRedirectUri()]));
}

function getEffectiveAuthRedirectUri(runtimeConfig = state.runtimeConfig) {
  return normalizeImsRedirectUri(
    firstNonEmptyString([runtimeConfig?.redirectUri, state.runtime.redirectUri, getExtensionRedirectUri()])
  );
}

function shouldUseChromeIdentityRedirectTransport(redirectUri = "") {
  const normalizedRedirectUri = normalizeImsRedirectUri(redirectUri);
  const chromeIdentityRedirectUri = getChromeIdentityRedirectUri();
  return Boolean(normalizedRedirectUri && chromeIdentityRedirectUri && normalizedRedirectUri === chromeIdentityRedirectUri);
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

  if (/missing client_secret parameter|client_secret/i.test(message)) {
    return "Adobe accepted the redirect but rejected the token exchange. This client ID looks like a confidential Web App credential, not a public PKCE credential for a Chrome extension.";
  }
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
    return "Login Button never received the final callback. Check Adobe-side validation, project access, or redirect handling.";
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
      `Login Button requested this redirect URI: ${getEffectiveAuthRedirectUri() || "unavailable"}.`
    );
    if (getEffectiveAuthRedirectUri() !== getChromeIdentityRedirectUri()) {
      notes.push(
        `Chrome identity on this install is bound to ${getChromeIdentityRedirectUri() || "unavailable"}, so Login Button fell back to popup tab monitoring for the Adobe-registered callback.`
      );
    }
    notes.push(
      "If Adobe Console is already registered with that exact URI and pattern, this error does not prove the redirect is wrong. It means Login Button never received the final callback it was waiting for."
    );
    notes.push(
      "Common causes are an Adobe-side error page after sign-in, a credential/user access restriction, or another validation failure that prevented Adobe from redirecting back to the extension."
    );
  } else if (/missing client_secret parameter|client_secret/i.test(message)) {
    notes.push(
      "Adobe already redirected back to the extension with an authorization code, so this is not a redirect-URI mismatch."
    );
    notes.push(
      "The failure is at the token exchange step. Login Button is using a public authorization-code PKCE flow and does not send a client secret from the extension."
    );
    notes.push(
      "This Adobe client ID is most likely an OAuth Web App credential. For this Chrome extension, use an OAuth Single Page App or other public-client-compatible Adobe credential, or move token exchange to a backend that can hold the client secret."
    );
  } else if (/redirect|invalid_request/i.test(message)) {
    notes.push(`Verify this redirect URI is allowed in Adobe Developer Console: ${getEffectiveAuthRedirectUri() || "unavailable"}.`);
  }

  if (/unsupported_response_type|code_challenge|pkce/i.test(message)) {
    notes.push("The Adobe credential may still be configured for an older flow. Use an authorization-code PKCE-compatible credential.");
  }

  if (!state.runtime.hasManifestKey) {
    notes.push(
      "This unpacked extension still has no manifest key, so Chrome identity redirect URIs are not guaranteed to stay stable across installs. Login Button can still use the Adobe-registered redirect when ZIP.KEY provides one."
    );
  }

  notes.push(
    "If some teammates can sign in and others cannot, verify the Adobe credential is in Production or that their email addresses are listed as beta users."
  );

  return [message, ...notes].filter(Boolean).join("\n\n");
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
  lines.push(`chrome_identity_redirect_uri=${firstNonEmptyString([authContext?.chromeIdentityRedirectUri, "unavailable"])}`);
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

function buildOrganizationContextFromSession(session) {
  const currentSession = session && typeof session === "object" ? session : null;
  const configuredOrganizations = getConfiguredOrganizationCandidates();
  const storedOrganizations = hasCanonicalStoredOrganizations(currentSession?.detectedOrganizations)
    ? normalizeStoredOrganizationCandidates(currentSession?.detectedOrganizations)
    : hasCanonicalStoredOrganizations(currentSession?.organizations)
      ? normalizeStoredOrganizationCandidates(currentSession?.organizations)
    : [];
  if (storedOrganizations.length > 0) {
    const mergedOrganizations = mergeDetectedOrganizationCandidates({
      existingOrganizations: storedOrganizations,
      additionalOrganizations: configuredOrganizations
    });
    return {
      options: mergedOrganizations,
      activeOrganization: resolveActiveOrganization({
        organizationCandidates: mergedOrganizations,
        session: currentSession
      })
    };
  }

  const resolvedContext = buildOrganizationContext({
    session: currentSession,
    profile: currentSession?.profile && typeof currentSession.profile === "object" ? currentSession.profile : null,
    accessClaims: currentSession?.accessTokenClaims || null,
    idClaims: currentSession?.idTokenClaims || null,
    organizations: flattenOrganizations(currentSession?.organizations)
  });
  const mergedOrganizations = mergeDetectedOrganizationCandidates({
    existingOrganizations: resolvedContext.options,
    additionalOrganizations: configuredOrganizations,
    activeOrganizationHint: resolvedContext.activeOrganization
  });

  return {
    options: mergedOrganizations,
    activeOrganization: resolveActiveOrganization({
      organizationCandidates: mergedOrganizations,
      session: currentSession
    })
  };
}

function getConfiguredOrganizationCandidates(runtimeConfig = state.runtimeConfig) {
  const configuredOrganizations = Array.isArray(runtimeConfig?.organizations) ? runtimeConfig.organizations : [];
  return normalizeStoredOrganizationCandidates(
    configuredOrganizations.map((organization, index) => ({
      ...organization,
      source: firstNonEmptyString([organization?.source, `runtimeConfig.organizations[${index}]`]),
      sources: Array.isArray(organization?.sources) ? organization.sources : []
    }))
  );
}

function hasCanonicalStoredOrganizations(organizations = []) {
  return Array.isArray(organizations) && organizations.some((organization) => {
    if (!organization || typeof organization !== "object") {
      return false;
    }

    return ["key", "label", "source", "sources", "hinted"].some((field) =>
      Object.prototype.hasOwnProperty.call(organization, field)
    );
  });
}

function normalizeStoredOrganizationCandidates(organizations = []) {
  if (!Array.isArray(organizations)) {
    return [];
  }

  const normalizedOrganizations = [];
  const seenKeys = new Set();

  organizations.forEach((organization, index) => {
    if (!organization || typeof organization !== "object") {
      return;
    }

    const id = firstNonEmptyString([
      organization.id,
      organization.orgId,
      organization.organizationId,
      extractOrganizationId(organization)
    ]);
    const name =
      firstNonEmptyString([
        organization.name,
        extractOrganizationName(organization),
        organization.label,
        id ? `Adobe IMS Org ${id}` : ""
      ]) || "Adobe organization";
    const key = firstNonEmptyString([organization.key, buildOrganizationOptionKey({ id, name })]);
    if (!key || seenKeys.has(key)) {
      return;
    }

    const source = firstNonEmptyString([
      organization.source,
      Array.isArray(organization.sources) ? organization.sources[0] : "",
      `session.organizations[${index}]`
    ]);
    const sources = [];
    [source, ...(Array.isArray(organization.sources) ? organization.sources : [])].forEach((value) => {
      const normalizedSource = String(value || "").trim();
      if (normalizedSource && !sources.includes(normalizedSource)) {
        sources.push(normalizedSource);
      }
    });

    seenKeys.add(key);
    normalizedOrganizations.push({
      key,
      id,
      tenantId: firstNonEmptyString([organization.tenantId, id]),
      imsOrgId: firstNonEmptyString([organization.imsOrgId]),
      name,
      source,
      sources,
      hinted: organization.hinted === true,
      label: firstNonEmptyString([organization.label, buildOrganizationOptionLabel({ id, name })]),
      aepRegion: firstNonEmptyString([organization.aepRegion]),
      hasAEP: organization.hasAEP === true,
      aemInstances: Array.isArray(organization.aemInstances) ? organization.aemInstances : [],
      clusterIndex: Number.isFinite(organization.clusterIndex) ? organization.clusterIndex : -1,
      clusterUserId: firstNonEmptyString([organization.clusterUserId, organization.userId]),
      clusterUserType: firstNonEmptyString([organization.clusterUserType, organization.userType]),
      clusterRestricted: organization.clusterRestricted === true || organization.restricted === true,
      consolidatedAccount: organization.consolidatedAccount === true
    });
  });

  return normalizedOrganizations;
}

function buildOrganizationContext({
  session = null,
  profile,
  accessClaims,
  idClaims,
  organizations = []
}) {
  const options = collectOrganizationCandidates({
    profile,
    accessClaims,
    idClaims,
    organizations
  });
  const activeOrganization = resolveActiveOrganization({
    organizationCandidates: options,
    session
  });

  return {
    options,
    activeOrganization
  };
}

function collectOrganizationCandidates({ profile, accessClaims, idClaims, organizations = [] }) {
  const candidateMap = new Map();
  const idIndex = new Map();
  const nameIndex = new Map();
  const orgIdHints = [];

  const upsertCandidate = (value, source) => {
    if (!value || typeof value !== "object") {
      return;
    }

    const id = extractOrganizationId(value);
    const tenantId = extractTenantOrganizationId(value);
    const imsOrgId = extractImsOrganizationId(value);
    const name = extractOrganizationName(value);
    if (!id && !name) {
      return;
    }

    const normalizedId = normalizeOrganizationIdentifier(id);
    const normalizedName = normalizeOrganizationIdentifier(name);
    let existingKey = normalizedId ? idIndex.get(normalizedId) : "";
    if (!existingKey && normalizedName) {
      existingKey = nameIndex.get(normalizedName) || "";
    }

    if (!existingKey) {
      const key = buildOrganizationOptionKey({ id, name });
      if (!key) {
        return;
      }

      candidateMap.set(key, {
        key,
        id,
        tenantId: firstNonEmptyString([tenantId, id && !/@adobeorg$/i.test(id) ? id : ""]),
        imsOrgId: firstNonEmptyString([imsOrgId, /@adobeorg$/i.test(id) ? id : ""]),
        name,
        source,
        sources: source ? [source] : []
      });
      if (normalizedId) {
        idIndex.set(normalizedId, key);
      }
      if (normalizedName) {
        nameIndex.set(normalizedName, key);
      }
      return;
    }

    const existingCandidate = candidateMap.get(existingKey);
    if (!existingCandidate) {
      return;
    }

    existingCandidate.id = firstNonEmptyString([existingCandidate.id, id]);
    existingCandidate.tenantId = firstNonEmptyString([
      existingCandidate.tenantId,
      tenantId,
      existingCandidate.id && !/@adobeorg$/i.test(existingCandidate.id) ? existingCandidate.id : ""
    ]);
    existingCandidate.imsOrgId = firstNonEmptyString([
      existingCandidate.imsOrgId,
      imsOrgId,
      /@adobeorg$/i.test(existingCandidate.id) ? existingCandidate.id : ""
    ]);
    existingCandidate.name = choosePreferredOrganizationName(existingCandidate.name, name, existingCandidate.id || id);
    if (source && !existingCandidate.sources.includes(source)) {
      existingCandidate.sources.push(source);
    }
    if (!existingCandidate.source || rankOrganizationSource(source) < rankOrganizationSource(existingCandidate.source)) {
      existingCandidate.source = source;
    }

    const nextKey = buildOrganizationOptionKey({
      id: existingCandidate.id,
      name: existingCandidate.name
    });
    if (nextKey && nextKey !== existingCandidate.key) {
      candidateMap.delete(existingCandidate.key);
      existingCandidate.key = nextKey;
      candidateMap.set(nextKey, existingCandidate);
      existingKey = nextKey;
    }

    const mergedId = normalizeOrganizationIdentifier(existingCandidate.id);
    const mergedName = normalizeOrganizationIdentifier(existingCandidate.name);
    if (mergedId) {
      idIndex.set(mergedId, existingCandidate.key);
    }
    if (mergedName) {
      nameIndex.set(mergedName, existingCandidate.key);
    }
  };

  const collectCandidatesFromValue = (value, sourceRoot) => {
    collectOrganizationObjects(value, sourceRoot).forEach((entry) => {
      const id = extractOrganizationId(entry.value);
      if (id) {
        orgIdHints.push(id);
      }
      upsertCandidate(entry.value, entry.source);
    });
  };

  organizations.forEach((organization, index) => upsertCandidate(organization, `organizations[${index}]`));
  collectCandidatesFromValue(profile, "profile");
  collectCandidatesFromValue(profile?.additional_info, "profile.additional_info");
  collectCandidatesFromValue(profile?.projectedProductContext, "profile.projectedProductContext");
  collectCandidatesFromValue(profile?.additional_info?.projectedProductContext, "profile.additional_info.projectedProductContext");
  collectCandidatesFromValue(accessClaims, "accessClaims");
  collectCandidatesFromValue(idClaims, "idClaims");

  const hintedOrgIds = new Set(orgIdHints.map(normalizeOrganizationIdentifier).filter(Boolean));
  return Array.from(candidateMap.values()).map((candidate) => {
    const displayName =
      firstNonEmptyString([candidate.name, candidate.id ? `Adobe IMS Org ${candidate.id}` : ""]) || "Adobe organization";
    return {
      ...candidate,
      name: displayName,
      source: firstNonEmptyString([candidate.source, "returned-payload"]),
      hinted: Boolean(candidate.id && hintedOrgIds.has(normalizeOrganizationIdentifier(candidate.id))),
      label: buildOrganizationOptionLabel({
        ...candidate,
        name: displayName
      })
    };
  });
}

function resolveActiveOrganization({ organizationCandidates = [], session = null }) {
  const verifiedClaim = extractVerifiedCustomerOrganizationClaim(session);
  const matchedCandidate =
    findMatchingOrganizationCandidate(organizationCandidates, verifiedClaim.id ? [verifiedClaim.id] : []) ||
    [...(Array.isArray(organizationCandidates) ? organizationCandidates : [])].sort(compareOrganizationCandidatePriority)[0] ||
    null;
  if (!matchedCandidate) {
    return {
      key: "",
      name: "Adobe organization unavailable",
      id: "",
      source: "not-resolved",
      meta: "Login Button could not resolve the current Adobe IMS org from the returned payloads."
    };
  }

  const resolvedSource = firstNonEmptyString([matchedCandidate.source, "returned-payload"]);
  const metaParts = [];
  if (matchedCandidate.id) {
    metaParts.push(`Org ID ${matchedCandidate.id}`);
  }
  if (verifiedClaim.id && organizationMatchesAnyIdentifier(matchedCandidate, [verifiedClaim.id])) {
    metaParts.push(`Verified via ${verifiedClaim.source}.`);
  } else {
    metaParts.push(`Auto-resolved from ${resolvedSource}.`);
  }
  if (organizationCandidates.length > 1) {
    metaParts.push(`${organizationCandidates.length} org options found.`);
  }

  return {
    ...matchedCandidate,
    meta: metaParts.join(" | ")
  };
}

function compareOrganizationCandidatePriority(left, right) {
  const leftHintScore = left?.hinted === true ? 0 : 1;
  const rightHintScore = right?.hinted === true ? 0 : 1;
  if (leftHintScore !== rightHintScore) {
    return leftHintScore - rightHintScore;
  }

  const leftSourceRank = rankOrganizationSource(left?.source);
  const rightSourceRank = rankOrganizationSource(right?.source);
  if (leftSourceRank !== rightSourceRank) {
    return leftSourceRank - rightSourceRank;
  }

  const leftIdentifierCount = collectOrganizationIdentifierSet(left).size;
  const rightIdentifierCount = collectOrganizationIdentifierSet(right).size;
  if (leftIdentifierCount !== rightIdentifierCount) {
    return rightIdentifierCount - leftIdentifierCount;
  }

  return String(left?.label || left?.name || "").localeCompare(String(right?.label || right?.name || ""), undefined, {
    sensitivity: "base"
  });
}

function findMatchingOrganizationCandidate(organizationCandidates = [], identifiers = []) {
  const normalizedIdentifiers = Array.from(
    new Set((Array.isArray(identifiers) ? identifiers : []).map((value) => normalizeOrganizationIdentifier(value)).filter(Boolean))
  );
  if (normalizedIdentifiers.length === 0) {
    return null;
  }

  return [...(Array.isArray(organizationCandidates) ? organizationCandidates : [])]
    .filter((candidate) => organizationMatchesAnyIdentifier(candidate, normalizedIdentifiers))
    .sort(compareOrganizationCandidatePriority)[0] || null;
}

function collectOrganizationIdentifierSet(organization = null) {
  if (!organization) {
    return new Set();
  }

  const values =
    typeof organization === "string"
      ? [organization]
      : [
          organization.key,
          organization.id,
          organization.orgId,
          organization.organizationId,
          organization.tenantId,
          organization.tenant_id,
          organization.companyId,
          organization.company_id,
          organization.imsOrgId,
          organization.ims_org_id,
          organization.name,
          organization.label,
          organization.orgName,
          organization.organizationName,
          extractOrganizationId(organization),
          extractTenantOrganizationId(organization),
          extractImsOrganizationId(organization),
          extractOrganizationName(organization)
        ];

  return new Set(values.map((value) => normalizeOrganizationIdentifier(value)).filter(Boolean));
}

function organizationMatchesAnyIdentifier(organization = null, identifiers = []) {
  const candidateIdentifiers = collectOrganizationIdentifierSet(organization);
  if (candidateIdentifiers.size === 0) {
    return false;
  }

  return (Array.isArray(identifiers) ? identifiers : []).some((identifier) =>
    candidateIdentifiers.has(normalizeOrganizationIdentifier(identifier))
  );
}

function hasIdentifierIntersection(leftIdentifiers = new Set(), rightIdentifiers = new Set()) {
  for (const identifier of leftIdentifiers) {
    if (rightIdentifiers.has(identifier)) {
      return true;
    }
  }
  return false;
}

function buildOrganizationPickerHelpText(organizationContext, verification = null, session = state.session) {
  const optionCount = Array.isArray(organizationContext?.options) ? organizationContext.options.length : 0;
  const totalDetectedCount = Array.isArray(organizationContext?.allDetectedOptions)
    ? organizationContext.allDetectedOptions.length
    : optionCount;
  const activeOrganization = organizationContext?.activeOrganization || null;
  const recommendedOrganization =
    organizationContext?.recommendedOrganization && typeof organizationContext.recommendedOrganization === "object"
      ? organizationContext.recommendedOrganization
      : !isAdobePassOrganization(activeOrganization)
        ? findAdobePassOrganizationCandidate(
            Array.isArray(organizationContext?.allDetectedOptions) && organizationContext.allDetectedOptions.length > 0
              ? organizationContext.allDetectedOptions
              : organizationContext?.options
          )
        : null;
  const currentScope = getCurrentOrganizationScope(session);
  const hasOrgDiscoveryScope = scopeIncludes(currentScope, IMS_ORG_DISCOVERY_SCOPE);
  const shouldOfferInteractiveSwitch = shouldOfferInteractiveOrgSwitch(organizationContext, session);
  const recommendedLabel = firstNonEmptyString([
    recommendedOrganization?.label,
    recommendedOrganization?.name,
    ADOBE_PASS_DISPLAY_NAME
  ]);
  if (verification?.status === "verified-mismatch" || verification?.status === "derived-mismatch") {
    return "Adobe returned a different org than the one you selected. Pick the desired Adobe IMS org again to reopen Adobe sign-in.";
  }
  if (
    recommendedOrganization &&
    String(recommendedOrganization?.key || "").trim() !== String(activeOrganization?.key || "").trim()
  ) {
    return `Choose ${recommendedLabel} to reopen Adobe sign-in and select that Adobe IMS org explicitly.`;
  }
  if (optionCount === 0) {
    if (totalDetectedCount === 1) {
      return "Login Button only found the currently selected Adobe IMS org for this user. No other org is available to switch to yet.";
    }
    if (shouldOfferInteractiveSwitch || !hasOrgDiscoveryScope) {
      return "This session cannot enumerate other Adobe IMS orgs yet. Choose Sign In Again and let Adobe reopen the account chooser.";
    }
    return "Login Button did not find any other Adobe IMS orgs in the returned payloads or configured runtime org roster.";
  }
  if (optionCount === 1) {
    return hasOrgDiscoveryScope
      ? "1 other Adobe IMS org is available for this user."
      : "1 other Adobe IMS org is available, but this session is missing read_organizations so Adobe may still be hiding additional org memberships.";
  }
  return hasOrgDiscoveryScope
    ? `${optionCount} other Adobe IMS orgs are available for this user.`
    : `${optionCount} other Adobe IMS orgs are available, but this session is missing read_organizations so the full org set may still be incomplete.`;
}

function buildOrganizationOptionKey({ id, name }) {
  const normalizedId = normalizeOrganizationIdentifier(id);
  if (normalizedId) {
    return `org:${normalizedId}`;
  }

  const normalizedName = normalizeOrganizationIdentifier(name);
  return normalizedName ? `name:${normalizedName}` : "";
}

function buildOrganizationOptionLabel(candidate) {
  const name =
    firstNonEmptyString([candidate?.name, candidate?.id ? `Adobe IMS Org ${candidate.id}` : ""]) || "Adobe organization";
  const id = firstNonEmptyString([candidate?.id]);
  if (
    !id ||
    normalizeOrganizationIdentifier(name) === normalizeOrganizationIdentifier(id) ||
    normalizeOrganizationIdentifier(name) === normalizeOrganizationIdentifier(`Adobe IMS Org ${id}`)
  ) {
    return name;
  }

  return `${name} | ${id}`;
}

function choosePreferredOrganizationName(currentName, nextName, organizationId = "") {
  const current = firstNonEmptyString([currentName]);
  const next = firstNonEmptyString([nextName]);
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  if (isGeneratedOrganizationName(current, organizationId) && !isGeneratedOrganizationName(next, organizationId)) {
    return next;
  }
  if (isGeneratedOrganizationName(next, organizationId) && !isGeneratedOrganizationName(current, organizationId)) {
    return current;
  }

  return next.length > current.length ? next : current;
}

function isGeneratedOrganizationName(name, organizationId = "") {
  const normalizedId = String(organizationId || "").trim();
  if (!normalizedId) {
    return false;
  }

  return normalizeOrganizationIdentifier(name) === normalizeOrganizationIdentifier(`Adobe IMS Org ${normalizedId}`);
}

function rankOrganizationSource(source = "") {
  const normalizedSource = String(source || "").trim();
  if (!normalizedSource) {
    return 99;
  }
  if (/^organizations\[\d+\]/.test(normalizedSource)) {
    return 0;
  }
  if (/^unifiedShell\./.test(normalizedSource)) {
    return 1;
  }
  if (/projectedProductContext/i.test(normalizedSource)) {
    return 2;
  }
  if (/^profile/.test(normalizedSource)) {
    return 3;
  }
  if (/^idClaims/.test(normalizedSource)) {
    return 4;
  }
  if (/^accessClaims/.test(normalizedSource)) {
    return 5;
  }

  return 6;
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

function extractTenantOrganizationId(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  return firstNonEmptyString([value.tenantId, value.tenant_id, value.companyId, value.company_id]);
}

function extractImsOrganizationId(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  return firstNonEmptyString([
    value.imsOrgId,
    value.ims_org_id,
    /@adobeorg$/i.test(String(value.id || "").trim()) ? String(value.id || "").trim() : ""
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
  const popupRedirectNavigationAvailable =
    Boolean(chrome.webNavigation?.onBeforeNavigate) &&
    Boolean(chrome.webNavigation?.onCommitted) &&
    Boolean(chrome.webNavigation?.onErrorOccurred);

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
    const pollIntervalId = window.setInterval(() => {
      void chrome.tabs
        .get(popupTabId)
        .then((tab) => {
          rememberPopupSnapshot(tab);
          maybeCaptureRedirect(firstNonEmptyString([tab?.pendingUrl, tab?.url]));
        })
        .catch(() => {});
    }, 150);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(pollIntervalId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved.removeListener(handleTabRemoved);
      chrome.windows.onRemoved.removeListener(handleWindowRemoved);
      if (popupRedirectNavigationAvailable) {
        chrome.webNavigation.onBeforeNavigate.removeListener(handleBeforeNavigate);
        chrome.webNavigation.onCommitted.removeListener(handleCommitted);
        chrome.webNavigation.onErrorOccurred.removeListener(handleNavigationError);
      }
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

    const maybeCaptureNavigationEvent = (details) => {
      if (!details || Number(details?.tabId || 0) !== popupTabId || Number(details?.frameId || 0) !== 0) {
        return false;
      }
      return maybeCaptureRedirect(details?.url);
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

    const handleBeforeNavigate = (details) => {
      maybeCaptureNavigationEvent(details);
    };

    const handleCommitted = (details) => {
      maybeCaptureNavigationEvent(details);
    };

    const handleNavigationError = (details) => {
      maybeCaptureNavigationEvent(details);
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
    if (popupRedirectNavigationAvailable) {
      chrome.webNavigation.onBeforeNavigate.addListener(handleBeforeNavigate);
      chrome.webNavigation.onCommitted.addListener(handleCommitted);
      chrome.webNavigation.onErrorOccurred.addListener(handleNavigationError);
    }

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

async function sendRuntimeMessageSafe(message = {}) {
  if (!chrome.runtime?.sendMessage) {
    throw new Error("Chrome runtime messaging is unavailable.");
  }

  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || "Chrome runtime messaging failed."));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
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

function setVaultTransferStatus(message, { error = false, ok = false } = {}) {
  state.vaultTransferStatus = {
    message: String(message || "").trim() || DEFAULT_VAULT_TRANSFER_STATUS_MESSAGE,
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
      state.postLoginHydrationInFlight = false;
      state.selectedCmTenantId = "";
      state.selectedProgrammerId = "";
      state.selectedRegisteredApplicationId = "";
      state.selectedRequestorId = "";
      state.programmerApplicationsLoadingFor = "";
      state.selectedProgrammerVaultRecord = null;
      state.selectedOrganizationSwitchKey = "";
      log(`ZIP.KEY switched Adobe IMS client from ${previousClientId} to ${importedConfig.clientId}. Cleared the stored session.`);
    } else if (hasActiveSession(state.session)) {
      state.selectedCmTenantId = "";
      state.selectedProgrammerId = "";
      state.selectedRegisteredApplicationId = "";
      state.selectedRequestorId = "";
      state.programmerApplicationsLoadingFor = "";
      state.selectedProgrammerVaultRecord = null;
      state.selectedOrganizationSwitchKey = "";
      void refreshSessionPostLoginContextInBackground(state.session, { reason: "zip-key-runtime-config-update" });
      log(
        `ZIP.KEY updated the post-login console target to ${firstNonEmptyString([
          state.runtimeConfig?.consoleBaseUrl,
          state.runtimeConfig?.consoleEnvironment,
          "the default console endpoint"
        ])}. Refreshed Adobe Pass user data for the active session.`
      );
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

async function exportVaultFromContextMenu() {
  if (state.busy || state.vaultTransferBusy) {
    return;
  }

  state.vaultTransferBusy = true;
  setVaultTransferStatus("Exporting the LoginButton VAULT…");
  render();

  try {
    const snapshot = await exportLoginButtonVaultSnapshot();
    const environmentCount = Number(snapshot?.stats?.environmentCount || 0);
    const programmerRecordCount = Number(snapshot?.stats?.programmerRecordCount || 0);
    const serviceClientCount = Number(snapshot?.stats?.serviceClientCount || 0);
    const fileName = buildVaultExportFileName(snapshot);
    triggerJsonDownload(snapshot, fileName);
    setVaultTransferStatus(
      `Exported ${environmentCount} environment${environmentCount === 1 ? "" : "s"}, ${programmerRecordCount} programmer record${programmerRecordCount === 1 ? "" : "s"}, and ${serviceClientCount} service client${serviceClientCount === 1 ? "" : "s"}.`,
      { ok: true }
    );
    log(`LoginButton VAULT exported to ${fileName}.`);
  } catch (error) {
    const message = `Unable to export the LoginButton VAULT: ${serializeError(error)}`;
    setVaultTransferStatus(message, { error: true });
    log(message);
  } finally {
    state.vaultTransferBusy = false;
    render();
  }
}

async function importVaultFiles(fileList) {
  const file = fileList?.[0];
  if (!file || state.busy || state.vaultTransferBusy) {
    if (vaultImportInput) {
      vaultImportInput.value = "";
    }
    return;
  }

  state.vaultTransferBusy = true;
  setVaultTransferStatus(`Importing ${file.name || "VAULT file"}…`);
  render();

  try {
    const rawText = await file.text();
    const importedPayload = parseJsonText(rawText);
    const result = await importLoginButtonVaultSnapshot(importedPayload, {
      replaceExisting: false
    });
    const importedEnvironmentCount = Number(result?.importedEnvironmentCount || 0);
    const importedProgrammerRecordCount = Number(result?.importedProgrammerRecordCount || 0);
    const importedServiceClientCount = Number(result?.importedServiceClientCount || 0);
    setVaultTransferStatus(
      `Imported ${importedEnvironmentCount} environment${importedEnvironmentCount === 1 ? "" : "s"}, ${importedProgrammerRecordCount} programmer record${importedProgrammerRecordCount === 1 ? "" : "s"}, and ${importedServiceClientCount} service client${importedServiceClientCount === 1 ? "" : "s"}.`,
      { ok: true }
    );
    log(`LoginButton VAULT imported from ${file.name || "selected file"}.`);
    await maybeRehydrateSelectedProgrammerFromImportedVault();
  } catch (error) {
    const message = `Unable to import the LoginButton VAULT: ${serializeError(error)}`;
    setVaultTransferStatus(message, { error: true });
    log(message);
  } finally {
    if (vaultImportInput) {
      vaultImportInput.value = "";
    }
    state.vaultTransferBusy = false;
    render();
  }
}

async function maybeRehydrateSelectedProgrammerFromImportedVault() {
  const normalizedProgrammerId = String(state.selectedProgrammerId || "").trim();
  const currentSession = state.session && typeof state.session === "object" ? state.session : null;
  if (!normalizedProgrammerId || !currentSession?.accessToken) {
    return;
  }

  const consoleContext = currentSession?.console && typeof currentSession.console === "object" ? currentSession.console : {};
  const applicationsByProgrammer =
    consoleContext?.applicationsByProgrammer && typeof consoleContext.applicationsByProgrammer === "object"
      ? consoleContext.applicationsByProgrammer
      : {};
  if (Array.isArray(applicationsByProgrammer?.[normalizedProgrammerId])) {
    return;
  }

  const lookupContext = buildProgrammerVaultLookupContext(currentSession, normalizedProgrammerId);
  if (!lookupContext) {
    return;
  }

  const importedRecord = await readProgrammerVaultRecord(lookupContext);
  const vaultAssessment = assessProgrammerVaultRecord(importedRecord, lookupContext);
  if (vaultAssessment.reusable) {
    hydrateSelectedProgrammerFromVaultRecord(importedRecord, normalizedProgrammerId, {
      restoreSelections: true
    });
  }
}

function buildVaultExportFileName(snapshot = null) {
  const exportedAt = firstNonEmptyString([snapshot?.exportedAt, new Date().toISOString()]);
  const safeTimestamp = exportedAt.replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
  return `loginbutton-vault-${safeTimestamp}.json`;
}

function triggerJsonDownload(payload = null, fileName = "loginbutton-vault.json") {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 0);
}


// ── HARPO: visibility gate ────────────────────────────────────────────────────

function deriveHarpoSectionVisible(authenticatedDataContext = {}) {
  const items = Array.isArray(authenticatedDataContext?.premiumServiceItems)
    ? authenticatedDataContext.premiumServiceItems
    : [];
  const hasRestV2 = items.some(
    (item) => item?.requiredScope === "api:client:v2" || item?.serviceKey === "restV2"
  );
  return hasRestV2 && Boolean(authenticatedDataContext?.selectedProgrammer);
}

// ── HARPO: domain extraction ──────────────────────────────────────────────────

function deriveHarpoDomains(authenticatedDataContext = {}) {
  const programmer = authenticatedDataContext?.selectedProgrammer;
  if (!programmer) return [];

  // Domains live on Channel (ServiceProvider) entities as objects:
  //   { id: "cnn.com", domainName: "cnn.com", idpInitiated: false }
  // requestorOptions are already filtered to the selected programmer.
  function extractDomainString(d) {
    if (!d) return "";
    if (typeof d === "object") {
      return String(d.domainName || d.id || "").trim().toLowerCase().replace(/\/$/, "");
    }
    return String(d).trim().toLowerCase().replace(/\/$/, "");
  }

  const requestors = Array.isArray(authenticatedDataContext?.requestorOptions)
    ? authenticatedDataContext.requestorOptions
    : [];

  const channelDomains = requestors.flatMap((r) => {
    const rawDomains = Array.isArray(r?.raw?.domains) ? r.raw.domains : [];
    return rawDomains.map(extractDomainString).filter(Boolean);
  });

  const programmerRawDomains = Array.isArray(programmer?.raw?.domains)
    ? programmer.raw.domains.map(extractDomainString).filter(Boolean)
    : [];

  const all = [...channelDomains, ...programmerRawDomains].filter((d) => d.length > 0);
  return [...new Set(all)].sort();
}

// ── HARPO: sync side panel section ────────────────────────────────────────────

function syncHarpoSection(authenticatedDataContext = {}) {
  if (!harpoContainer) return;

  const visible = deriveHarpoSectionVisible(authenticatedDataContext);
  harpoContainer.hidden = !visible;
  if (!visible) return;

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
      ph.textContent = domains.length > 0 ? "Choose a domain\u2026" : "No domains configured";
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

// ── HARPO: open HAR file ──────────────────────────────────────────────────────

async function loadAndOpenHarFile(file) {
  if (!file) return;
  setHarpoStatus(`Reading ${file.name}\u2026`);
  try {
    const text = await file.text();
    const har = parseJsonText(text, null);
    if (!har?.log) throw new Error("Not a valid HAR file \u2014 missing .log");
    await openHarpoWorkspace(har, { source: "file", fileName: file.name });
    setHarpoStatus(`Opened ${file.name}`, { ok: true });
  } catch (err) {
    setHarpoStatus(`Failed: ${serializeError(err)}`, { error: true });
  }
}

// ── HARPO: open workspace tab ─────────────────────────────────────────────────

async function openHarpoWorkspace(har, { source = "file", fileName = "", programmerName = "", programmerDomains = [] } = {}) {
  const key = `${HARPO_STORAGE_PREFIX}${randomToken()}`;
  const selectedProgrammer = resolveSelectedProgrammer(
    state.session?.console?.programmers || [],
    state.selectedProgrammerId
  );
  const pName =
    programmerName ||
    firstNonEmptyString([selectedProgrammer?.name, selectedProgrammer?.id, ""]);

  // IndexedDB — no storage quota. Handles HAR files of any size.
  await harpoIdbPut(key, {
    har,
    source,
    fileName,
    programmerName: pName,
    programmerDomains,
    createdAt: new Date().toISOString()
  });

  const workspaceUrl = chrome.runtime.getURL(`harpo.html#${key}`);
  await chrome.tabs.create({ url: workspaceUrl });
}

// ── HARPO: start recording via background ─────────────────────────────────────

async function harpoStartRecordingFromPanel(domain) {
  if (state.harpoRecording) return;
  setHarpoStatus("Starting recording\u2026");
  try {
    const domainUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    const selectedProgrammer = resolveSelectedProgrammer(
      state.session?.console?.programmers || [],
      state.selectedProgrammerId
    );
    // Collect all domains for this programmer so HARPO can distinguish
    // "programmer's own site" traffic from genuine MVPD auth redirects.
    const consoleChannels = Array.isArray(state.session?.console?.channels)
      ? state.session.console.channels
      : [];
    const programmerChannels = consoleChannels.filter((ch) => {
      const chProgrammerId = String(ch?.raw?.programmer || "").replace(/^@Programmer:/i, "");
      return chProgrammerId === state.selectedProgrammerId || ch?.programmerId === state.selectedProgrammerId;
    });
    const programmerDomains = [...new Set(
      programmerChannels.flatMap((ch) =>
        Array.isArray(ch?.raw?.domains)
          ? ch.raw.domains.map((d) => typeof d === "object" ? (d.domainName || d.id || "") : String(d || ""))
              .filter(Boolean)
          : []
      )
    )];

    const response = await chrome.runtime.sendMessage({
      type: HARPO_MESSAGE_START,
      url: domainUrl,
      programmerName: firstNonEmptyString([selectedProgrammer?.name, state.selectedProgrammerId, ""]),
      programmerDomains
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

// ── HARPO: stop recording via background ──────────────────────────────────────

async function harpoStopRecordingFromPanel() {
  if (!state.harpoRecording) return;
  harpoStopCountPoll();
  setHarpoStatus("Stopping\u2026");
  try {
    const response = await chrome.runtime.sendMessage({ type: HARPO_MESSAGE_STOP });
    state.harpoRecording = false;
    state.harpoRecordingCount = 0;
    state.harpoReproOpen = false;
    render();
    if (response?.ok) {
      setHarpoStatus(`Done \u2014 ${response.entryCount || 0} calls. Opening workspace\u2026`, { ok: true });
    } else {
      throw new Error(response?.error || "Stop failed.");
    }
  } catch (err) {
    state.harpoRecording = false;
    setHarpoStatus(`Stop failed: ${serializeError(err)}`, { error: true });
    render();
  }
}

// ── HARPO: live call count polling ────────────────────────────────────────────

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

// ── HARPO: status line ────────────────────────────────────────────────────────

function setHarpoStatus(message, { ok = false, error = false } = {}) {
  if (!harpoStatus) return;
  harpoStatus.textContent = String(message || "");
  harpoStatus.hidden = !message;
  harpoStatus.className = "spectrum-Body spectrum-Body--sizeS harpo-status";
  if (error) harpoStatus.classList.add("harpo-status--error");
  if (ok)    harpoStatus.classList.add("harpo-status--ok");
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
