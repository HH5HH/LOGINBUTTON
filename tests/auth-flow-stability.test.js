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

  assert.match(appMarkup, /<section id="cmFieldGroup" class="field-cluster field-cluster--cm" hidden aria-label="CM controls">/);
  assert.match(appMarkup, /<section[\s\S]*id="programmerFieldGroup"[\s\S]*class="field-cluster field-cluster--programmer"/);
  assert.match(appMarkup, /id="cmuTokenContainer"/);
  assert.match(appMarkup, /id="cmTenantPickerContainer"/);
  assert.match(appMarkup, /id="programmerPickerContainer"/);
  assert.match(appMarkup, /id="registeredApplicationPickerContainer"/);
  assert.match(appMarkup, /id="requestorPickerContainer"/);
  assert.match(appMarkup, /id="premiumServicesContainer"/);
  assert.match(appSource, /function syncAuthenticatedFieldGroups\(\)/);
  assert.match(appSource, /cmFieldGroup\.hidden = \[cmuTokenSection, cmTenantPickerSection\]/);
  assert.match(
    appSource,
    /programmerFieldGroup\.hidden = \[programmerPickerSection, registeredApplicationPickerSection, requestorPickerSection, premiumServicesSection\]/
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
