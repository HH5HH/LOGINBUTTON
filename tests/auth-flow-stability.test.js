const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

test("manifest does not pin an extension key", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

  assert.equal(Object.prototype.hasOwnProperty.call(manifest, "key"), false);
});

test("interactive auth chooses popup monitoring when the configured redirect differs from chrome.identity", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const hydrationSectionMatch = appSource.match(
    /async function attemptSessionHydration\([\s\S]*?\n}\n\nfunction requireConfiguredClientId/
  );

  assert.ok(hydrationSectionMatch, "attemptSessionHydration should exist");
  const hydrationSection = hydrationSectionMatch[0];

  assert.match(hydrationSection, /const authTransport = interactive && !shouldUseChromeIdentityRedirectTransport\(redirectUri\)/);
  assert.match(hydrationSection, /transport: authTransport/);
  assert.match(hydrationSection, /callbackUrl = await launchInteractiveAuthPopup\(\{/);
  assert.match(hydrationSection, /callbackUrl = await chrome\.identity\.launchWebAuthFlow\(launchDetails\);/);
});

test("startup does not auto-resume or silently restore a stored Adobe session", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const initializeSectionMatch = appSource.match(
    /async function initialize\([\s\S]*?\n}\n\nasync function login/
  );

  assert.ok(initializeSectionMatch, "initialize should exist");
  assert.doesNotMatch(appSource, /window\.addEventListener\("focus", \(\) => \{\s*void maybeResumeExistingAdobeSession/);
  assert.doesNotMatch(appSource, /document\.addEventListener\("visibilitychange", \(\) => \{\s*if \(document\.visibilityState === "visible"\) \{\s*void maybeResumeExistingAdobeSession/);
  assert.match(initializeSectionMatch[0], /state\.session = null;/);
  assert.match(initializeSectionMatch[0], /if \(stored\[SESSION_KEY\]\) \{\s*await chrome\.storage\.local\.remove\(SESSION_KEY\);/);
  assert.doesNotMatch(initializeSectionMatch[0], /maybeResumeExistingAdobeSession\("startup"\)/);
});

test("interactive auth forces Adobe's explicit chooser path on sign-in and keeps org switching user-driven", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  const loginClickSectionMatch = appSource.match(
    /loginButton\.addEventListener\("click", async \(\) => \{[\s\S]*?\n}\);/
  );
  assert.ok(loginClickSectionMatch, "login button click handler should exist");
  assert.match(loginClickSectionMatch[0], /forceInteractive: true/);
  assert.match(loginClickSectionMatch[0], /forceBrowserLogout: true/);
  assert.match(loginClickSectionMatch[0], /prompt:\s*"login"/);
  assert.match(appSource, /const effectivePrompt = firstNonEmptyString\(\[prompt\]\);/);

  const orgSwitchSectionMatch = appSource.match(
    /async function switchAdobeOrganization\([\s\S]*?\n}\n\nfunction getCurrentOrganizationScope/
  );
  assert.ok(orgSwitchSectionMatch, "org switch helper should exist");
  assert.match(orgSwitchSectionMatch[0], /const normalizedTargetOrganization = normalizeRequestedTargetOrganization\(targetOrganization\);/);
  assert.match(orgSwitchSectionMatch[0], /forceBrowserLogout: true/);
  assert.match(orgSwitchSectionMatch[0], /prompt: "login"/);

  const loginSectionMatch = appSource.match(
    /async function login\([\s\S]*?\n}\n\nasync function logout/
  );
  assert.ok(loginSectionMatch, "login helper should exist");
  assert.match(loginSectionMatch[0], /const runInteractiveScopePlan = async \(\{/);
  assert.match(loginSectionMatch[0], /if \(forceBrowserLogout\) \{/);
  assert.match(loginSectionMatch[0], /finalizedSession = attachTargetOrganizationToSession\(finalizedSession, null\);/);
  assert.match(loginSectionMatch[0], /status: "accepted-returned-org"/);
  assert.match(loginSectionMatch[0], /Login Button switched to the active returned Adobe org\./);
  assert.match(
    loginSectionMatch[0],
    /Use Sign In Again if Adobe needs to reopen the chooser\./
  );
  assert.doesNotMatch(loginSectionMatch[0], /reasonBase: `\$\{baseInteractiveReason\}-chooser`/);
  assert.doesNotMatch(
    loginSectionMatch[0],
    /Adobe ignored the direct org-switch hint, so Login Button is reopening Adobe's chooser for the same selected org\./
  );
  assert.doesNotMatch(loginSectionMatch[0], /extraParams: requestedTargetOrganization \? targetOrgStrategy : \{\},/);
  assert.doesNotMatch(appSource, /function buildPreferredOrgSwitchStrategy\(/);
  assert.doesNotMatch(appSource, /function buildOrgSwitchStrategies\(/);
});

test("configured ZIP.KEY orgs stay merged into detected organization candidates", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  const buildSessionRecordMatch = appSource.match(
    /function buildSessionRecord\([\s\S]*?\n}\n\nfunction buildImsSession/
  );
  assert.ok(buildSessionRecordMatch, "buildSessionRecord should exist");
  assert.match(buildSessionRecordMatch[0], /mergeDetectedOrganizationCandidates\(\{/);
  assert.match(buildSessionRecordMatch[0], /additionalOrganizations: getConfiguredOrganizationCandidates\(\)/);

  const orgContextSectionMatch = appSource.match(
    /function buildOrganizationContextFromSession\([\s\S]*?\n}\n\nfunction hasCanonicalStoredOrganizations/
  );
  assert.ok(orgContextSectionMatch, "buildOrganizationContextFromSession should exist");
  assert.match(orgContextSectionMatch[0], /const configuredOrganizations = getConfiguredOrganizationCandidates\(\);/);
  assert.match(orgContextSectionMatch[0], /additionalOrganizations: configuredOrganizations/);
  assert.match(orgContextSectionMatch[0], /function getConfiguredOrganizationCandidates\(runtimeConfig = state\.runtimeConfig\)/);
  assert.match(orgContextSectionMatch[0], /runtimeConfig\.organizations\[\$\{index\}\]/);

  const sourceLabelSectionMatch = appSource.match(
    /function formatOrganizationSourceLabel\([\s\S]*?\n}\n\nfunction syncOrganizationPicker/
  );
  assert.ok(sourceLabelSectionMatch, "formatOrganizationSourceLabel should exist");
  assert.match(sourceLabelSectionMatch[0], /runtimeConfig\\\.organizations/);
  assert.match(sourceLabelSectionMatch[0], /ZIP\.KEY configured organizations/);
});

test("detected Adobe org picker exposes explicit Sign In Again recovery", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  const detectedPickerSectionMatch = appSource.match(
    /function syncDetectedOrganizationPicker\([\s\S]*?\n}\n\nfunction syncCmTenantPicker/
  );
  assert.ok(detectedPickerSectionMatch, "syncDetectedOrganizationPicker should exist");
  assert.match(detectedPickerSectionMatch[0], /const shouldOfferInteractiveSwitch = organizationContext\?\.shouldOfferInteractiveSwitch === true;/);
  assert.match(detectedPickerSectionMatch[0], /reauthOption\.value = ORG_PICKER_REAUTH_VALUE;/);
  assert.match(detectedPickerSectionMatch[0], /reauthOption\.textContent = "Sign In Again To Choose Another Adobe Org";/);
  assert.match(
    detectedPickerSectionMatch[0],
    /detectedOrganizationPicker\.disabled = state\.busy \|\| \(switchableOptionCount === 0 && !shouldOfferInteractiveSwitch\);/
  );

  const requestSwitchSectionMatch = appSource.match(
    /async function requestOrganizationSwitch\([\s\S]*?\n}\n\nasync function switchAdobeOrganization/
  );
  assert.ok(requestSwitchSectionMatch, "requestOrganizationSwitch should exist");
  assert.match(requestSwitchSectionMatch[0], /normalizedKey === ORG_PICKER_REAUTH_VALUE/);
  assert.match(requestSwitchSectionMatch[0], /await switchAdobeOrganization\(\);/);
});

test("authenticated sessions keep the hero avatar menu visible for recovery and Get Latest", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  assert.match(appSource, /const avatarMenuAvailable = hasSession;/);
  assert.match(appSource, /showHero: true,/);
});

test("authenticated CM and Programmer controls live in separate field containers", () => {
  const appMarkup = fs.readFileSync(path.join(ROOT, "app.html"), "utf8");
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const appCss = fs.readFileSync(path.join(ROOT, "app.css"), "utf8");

  assert.match(appMarkup, /<section id="cmFieldGroup" class="field-cluster field-cluster--cm" hidden aria-label="CM controls">/);
  assert.match(appMarkup, /<section[\s\S]*id="programmerFieldGroup"[\s\S]*class="field-cluster field-cluster--programmer"/);
  assert.match(appMarkup, /id="cmuTokenContainer"/);
  assert.match(appMarkup, /id="cmTenantPickerContainer"/);
  assert.match(appMarkup, /id="programmerPickerContainer"/);
  assert.match(appMarkup, /id="registeredApplicationPickerContainer"/);
  assert.match(appMarkup, /id="requestorPickerContainer"/);
  assert.match(appMarkup, /id="premiumServicesContainer"/);
  assert.match(appMarkup, /id="harpoContainer"/);
  assert.ok(
    appMarkup.indexOf('id="harpoContainer"') < appMarkup.indexOf('id="premiumServicesContainer"'),
    "HARPO should render before Premium Services in the sidepanel"
  );
  assert.match(appSource, /function syncAuthenticatedFieldGroups\(\)/);
  assert.match(appSource, /cmFieldGroup\.hidden = \[cmuTokenSection, cmTenantPickerSection\]/);
  assert.match(
    appSource,
    /programmerFieldGroup\.hidden = \[programmerPickerSection, registeredApplicationPickerSection, requestorPickerSection, premiumServicesSection\]/
  );
  assert.match(appCss, /\.field-cluster,\s*\.field-clusterHeader,\s*\.org-pickerControl,/);
  assert.match(appCss, /\.field-cluster > \.org-pickerCompact \{\s*padding-top: 0;\s*border-top: 0;/);
  assert.doesNotMatch(appCss, /\.field-cluster::before/);
  assert.doesNotMatch(appCss, /\.field-cluster > \.org-pickerCompact:first-of-type/);
});

test("premium services cards use one shared themed Spectrum-style container treatment", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const appCss = fs.readFileSync(path.join(ROOT, "app.css"), "utf8");

  assert.match(appCss, /--login-button-premium-service-background:/);
  assert.match(appCss, /--login-button-premium-service-header-background:/);
  assert.match(appCss, /--login-button-premium-service-border:/);
  assert.match(appCss, /--login-button-premium-service-body-background:/);
  assert.match(appCss, /\.premium-serviceCard \{\s*display: grid;[\s\S]*border: 1px solid var\(--login-button-premium-service-border\);[\s\S]*background: var\(--login-button-premium-service-background\);/);
  assert.match(appCss, /\.premium-serviceToggle \{\s*[\s\S]*background: var\(--login-button-premium-service-header-background\);/);
  assert.match(appCss, /\.premium-serviceMeta \{/);
  assert.doesNotMatch(appCss, /\.premium-serviceCard\.is-selected-app/);

  const premiumServicesSectionMatch = appSource.match(
    /function syncPremiumServicesSummary\([\s\S]*?\n}\n\nfunction syncAuthenticatedFieldGroups/
  );
  assert.ok(premiumServicesSectionMatch, "syncPremiumServicesSummary should exist");
  assert.match(premiumServicesSectionMatch[0], /headerCopy\.className = "premium-serviceHeaderCopy";/);
  assert.match(premiumServicesSectionMatch[0], /meta\.className = "premium-serviceMeta";/);
  assert.match(premiumServicesSectionMatch[0], /meta\.textContent = item\?\.selectedApplicationName/);
  assert.doesNotMatch(premiumServicesSectionMatch[0], /card\.classList\.toggle\("is-selected-app"/);
});

test("MODE x COLOR theming drives app surfaces beyond links and the sign-in button", () => {
  const appCss = fs.readFileSync(path.join(ROOT, "app.css"), "utf8");
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  assert.match(appCss, /body\[data-theme-stop="light"\]/);
  assert.match(appCss, /body\[data-theme-stop="dark"\]/);
  assert.match(appCss, /--login-button-surface-background:/);
  assert.match(appCss, /--login-button-control-border:/);
  assert.match(appCss, /\.surface \{\s*background: var\(--login-button-surface-background\);/);
  assert.match(appCss, /\.org-pickerSelect \{\s*[\s\S]*border: 1px solid var\(--login-button-control-border\);/);
  assert.match(appCss, /\.field-cluster--cm \{\s*--field-cluster-accent: var\(--login-button-cm-accent\);/);
  assert.match(appCss, /\.field-cluster--programmer \{\s*--field-cluster-accent: var\(--login-button-programmer-accent\);/);
  assert.doesNotMatch(appCss, /field-cluster--cm \{\s*--field-cluster-accent: color-mix\(in srgb, var\(--spectrum-blue-visual-color\)/);
  assert.doesNotMatch(appCss, /field-cluster--programmer \{\s*--field-cluster-accent: color-mix\(in srgb, var\(--spectrum-seafoam-visual-color\)/);
  assert.match(appSource, /body\.style\.setProperty\("--login-button-theme-shell", "var\(--login-button-surface-background\)"\);/);
});

test("setup view asks for loginbutton.KEY in the visible import copy", () => {
  const appHtml = fs.readFileSync(path.join(ROOT, "app.html"), "utf8");

  assert.match(appHtml, /aria-label="loginbutton\.KEY setup view"/);
  assert.match(appHtml, /LOGINBUTTON\.KEY PLEASE/);
  assert.match(appHtml, /Drop loginbutton\.KEY to configure Login Button/);
});

test("avatar menu identity meta shows only the active Adobe organization", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const authenticatedContextSectionMatch = appSource.match(
    /function buildAuthenticatedUserDataContext\([\s\S]*?\n}\n\nfunction buildAuthenticatedSummaryCards/
  );

  assert.ok(authenticatedContextSectionMatch, "buildAuthenticatedUserDataContext should exist");
  assert.match(
    authenticatedContextSectionMatch[0],
    /const identityMeta = firstNonEmptyString\(\[activeOrganization\.name, "Adobe organization unavailable"\]\);/
  );
  assert.doesNotMatch(
    authenticatedContextSectionMatch[0],
    /const identityMeta = \[\s*email,\s*firstNonEmptyString\(\[activeOrganization\.name\]\),/
  );
});

test("post-login Adobe Pass hydration auto-activates the selected or sole programmer context", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  const refreshSectionMatch = appSource.match(
    /async function refreshSessionPostLoginContextInBackground\([\s\S]*?\n}\n\nasync function hydratePostLoginSessionData/
  );
  assert.ok(refreshSectionMatch, "refreshSessionPostLoginContextInBackground should exist");
  assert.match(refreshSectionMatch[0], /void autoActivateAdobePassProgrammerContext\(hydratedSession, \{ reason \}\)/);

  const autoActivateSectionMatch = appSource.match(
    /async function autoActivateAdobePassProgrammerContext\([\s\S]*?\n}\n\nfunction resolveProgrammerAccessContext/
  );
  assert.ok(autoActivateSectionMatch, "autoActivateAdobePassProgrammerContext should exist");
  assert.match(autoActivateSectionMatch[0], /programmerOptions\.length !== 1/);
  assert.match(autoActivateSectionMatch[0], /await ensureSelectedProgrammerApplicationsLoaded\(selectedProgrammerId\);/);
  assert.match(autoActivateSectionMatch[0], /autoSelectSingletonAuthenticatedOptions\(\);/);
});

test("popup-monitor auth captures redirects from webNavigation before Chrome swaps in an error page", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const popupSectionMatch = appSource.match(
    /async function launchInteractiveAuthPopup\([\s\S]*?\n}\n\nasync function closeInteractiveAuthPopup/
  );

  assert.ok(popupSectionMatch, "launchInteractiveAuthPopup should exist");
  const popupSection = popupSectionMatch[0];

  assert.match(popupSection, /chrome\.webNavigation\?\.onBeforeNavigate/);
  assert.match(popupSection, /chrome\.webNavigation\.onBeforeNavigate\.addListener\(handleBeforeNavigate\)/);
  assert.match(popupSection, /chrome\.webNavigation\.onCommitted\.addListener\(handleCommitted\)/);
  assert.match(popupSection, /chrome\.webNavigation\.onErrorOccurred\.addListener\(handleNavigationError\)/);
  assert.match(popupSection, /Number\(details\?\.tabId \|\| 0\) !== popupTabId/);
  assert.match(popupSection, /return maybeCaptureRedirect\(details\?\.url\);/);
});

test("runtime config accepts the Adobe project export redirect URI", () => {
  const sharedSource = fs.readFileSync(path.join(ROOT, "shared.js"), "utf8");

  assert.match(sharedSource, /IMS_PROJECT_DEFAULT_EXTENSION_REDIRECT_URI = "https:\/\/danaegilocobhopoepodlpondjjfcpoi\.chromiumapp\.org\/ims"/);
  assert.match(sharedSource, /project\.workspace\.details\.credentials\.0\.oauth2\.client_id/);
  assert.match(sharedSource, /project\.workspace\.details\.credentials\.0\.oauth2\.defaultRedirectUri/);
  assert.match(sharedSource, /redirectUri,/);
});

test("scope planning still prefers org discovery when the configured scope lacks it", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const scopeSectionMatch = appSource.match(
    /function buildPreferredRequestedScope\([\s\S]*?\n}\n\nfunction shouldRetryWithConfiguredScope/
  );

  assert.ok(scopeSectionMatch, "scope planning helpers should exist");
  const scopeSection = scopeSectionMatch[0];

  assert.match(scopeSection, /scopeIncludes\(normalizedConfiguredScope, IMS_ORG_DISCOVERY_SCOPE\)/);
  assert.match(scopeSection, /return normalizeScopeList\(`\$\{normalizedConfiguredScope\} \$\{IMS_ORG_DISCOVERY_SCOPE\}`/);
  assert.match(scopeSection, /new Set\(\[preferredScope, normalizedConfiguredScope\]\)/);
});

test("manifest declares webNavigation for popup redirect capture", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

  assert.ok(Array.isArray(manifest.permissions), "manifest permissions should be an array");
  assert.ok(manifest.permissions.includes("webNavigation"));
  assert.ok(manifest.permissions.includes("downloads"));
  assert.ok(Array.isArray(manifest.host_permissions), "manifest host_permissions should be an array");
  assert.ok(manifest.host_permissions.includes("https://api.github.com/*"));
  assert.ok(manifest.host_permissions.includes("https://raw.githubusercontent.com/*"));
});

test("vault export compacts programmer records and keeps CM globals only at the LoginButton environment layer", () => {
  const vaultSource = fs.readFileSync(path.join(ROOT, "vault.js"), "utf8");

  assert.match(vaultSource, /LOGINBUTTON_VAULT_EXPORT_SCHEMA_VERSION = 3;/);
  assert.match(vaultSource, /LOGINBUTTON_VAULT_EXPORT_SCHEMA = "loginbutton-vault-json-v3";/);
  assert.match(vaultSource, /const SUPPORTED_SERVICE_KEYS = \["restV2", "esm", "degradation", "resetTempPass", "cm"\];/);
  assert.match(vaultSource, /const compactProgrammerRecords = programmerRecords[\s\S]*buildCompactProgrammerVaultExportRecord/);
  assert.match(vaultSource, /registeredApplicationsById,/);
  assert.match(vaultSource, /matchedTenantIds:/);
  assert.match(vaultSource, /payload\?\.loginbutton\?\.globals\?\.cmGlobalsByEnvironment/);
  assert.match(vaultSource, /inflateCompactProgrammerVaultImportRecord/);
  assert.match(vaultSource, /inflateCompactMatchedTenants/);
});

test("selected registered application drives service hydration for scope-matched premium services", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  assert.match(appSource, /serviceKey: "resetTempPass", label: "reset TempPass", requiredScope: "temporary:passes:owner"/);
  assert.match(appSource, /function resolvePreferredVaultServiceApplication\(/);
  assert.match(appSource, /const selectedApplicationMatchesScope = registeredApplicationMatchesRequiredScope\(/);
  assert.match(appSource, /selectedRegisteredApplication: snapshotContext\.selectedRegisteredApplication/);
  assert.match(appSource, /function buildRegisteredApplicationBulkRetrieveRequest\(/);
  assert.match(appSource, /path: "\/entity\/bulkRetrieve"/);
  assert.match(appSource, /method: "POST"/);
  assert.match(appSource, /"Content-Type": "application\/json"/);
  assert.match(appSource, /fetchRegisteredApplicationBulkRetrieve\(session, normalizedApplicationId/);
  assert.match(appSource, /async function enrichRegisteredApplicationForHydration\(/);
  assert.match(appSource, /async function fetchRegisteredApplicationDetails\(/);
  assert.match(appSource, /async function fetchRegisteredApplicationSoftwareStatement\(/);
  assert.match(appSource, /const pathCandidates = buildRegisteredApplicationDetailPaths\(normalizedApplicationId\);/);
  assert.match(appSource, /registeredApplication = enrichmentResult\.value\.application;/);
  assert.match(appSource, /await registerDcrClientWithSoftwareStatement\(softwareStatement\)/);

  const selectionPersistSectionMatch = appSource.match(
    /async function persistSelectedProgrammerVaultSelections\([\s\S]*?\n}\n\nfunction hydrateSelectedProgrammerFromVaultRecord/
  );
  assert.ok(selectionPersistSectionMatch, "persistSelectedProgrammerVaultSelections should exist");
  assert.match(selectionPersistSectionMatch[0], /const selectedServiceKeys = VAULT_DCR_SERVICE_DEFINITIONS\.filter/);
  assert.match(selectionPersistSectionMatch[0], /registeredApplicationMatchesRequiredScope\(selectedRegisteredApplication, definition\.requiredScope\)/);
  assert.match(selectionPersistSectionMatch[0], /serviceKeys: selectedServiceKeys/);
});

test("premium service cheat sheet button reports real DCR or CM readiness instead of placeholder copy", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  assert.match(appSource, /async function buildPremiumServiceCheatSheetMessage\(/);
  assert.match(appSource, /await persistProgrammerVaultSnapshot\(state\.session, programmerId, \{/);
  assert.match(appSource, /serviceKeys: \[definition\.serviceKey\]/);
  assert.match(appSource, /Hydration path: DCR \/register \+ client_credentials token\./);
  assert.match(appSource, /Hydration path: Adobe IMS CMU token \(no DCR \/register step\)\./);
  assert.match(appSource, /DCR client: not created/);
  assert.match(appSource, /DCR client: \$\{clientId\}/);
  assert.match(appSource, /CMU client: \$\{cmuClientId\}/);
  assert.match(appSource, /hydration failed\./);
  assert.match(appSource, /Result: Make cheatsheet for \$\{normalizedDefinition\.label\} using \$\{applicationName\} client \$\{clientId\}\./);
  assert.match(appSource, /Result: Make cheatsheet for \$\{PREMIUM_SERVICE_CONCURRENCY_LABEL\} using \$\{cmuClientId\}\./);
  assert.match(appSource, /window\.alert\(cheatSheetMessage\);/);
  assert.doesNotMatch(appSource, /show cheat sheet and real time result of cheat sheet sample/);
});
