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

test("Adobe avatar resolution uses an authenticated background relay for protected avatar URLs", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");

  assert.match(appSource, /const LOGINBUTTON_FETCH_AVATAR_REQUEST_TYPE = "loginbutton:fetchAvatarDataUrl";/);
  assert.match(appSource, /const AVATAR_RESOLVE_RETRY_COOLDOWN_MS = 60 \* 1000;/);
  assert.match(appSource, /nextRetryAt: 0/);
  assert.match(appSource, /function isProtectedAdobeAvatarUrl\(url = ""\)/);
  assert.match(appSource, /async function fetchAvatarDataUrlViaBackground\(\{ url = "", accessToken = "", clientId = "" \} = \{\}\)/);
  assert.match(appSource, /type: LOGINBUTTON_FETCH_AVATAR_REQUEST_TYPE,/);
  assert.match(appSource, /if \(state\.avatarAsset\.key === key\) \{\s*if \(state\.avatarAsset\.displayUrl\) \{\s*return;\s*\}\s*if \(Number\(state\.avatarAsset\.nextRetryAt \|\| 0\) > now\) \{\s*return;\s*\}/s);
  assert.match(appSource, /nextRetryAt: resolved\.displayUrl \? 0 : Date\.now\(\) \+ AVATAR_RESOLVE_RETRY_COOLDOWN_MS/);
  assert.match(appSource, /const backgroundDataUrl = await fetchAvatarDataUrlViaBackground\(\{\s*url: candidate,\s*accessToken,\s*clientId\s*\}\);/);
  assert.match(appSource, /mode: "relay"/);
  assert.match(appSource, /if \(!isProtectedAdobeAvatarUrl\(candidate\)\) \{\s*return \{\s*sourceUrl: candidate,\s*displayUrl: candidate,/s);
  assert.doesNotMatch(appSource, /if \(directFallbackUrl\) \{/);

  assert.match(backgroundSource, /const LOGINBUTTON_FETCH_AVATAR_REQUEST_TYPE = "loginbutton:fetchAvatarDataUrl"/);
  assert.match(backgroundSource, /const LOGINBUTTON_AVATAR_MAX_DATAURL_BYTES = 6 \* 1024 \* 1024/);
  assert.match(backgroundSource, /function normalizeLoginButtonAvatarCandidate\(value = ""\)/);
  assert.match(backgroundSource, /function buildLoginButtonAvatarFetchAttempts\(accessToken = "", clientId = "", url = ""\)/);
  assert.match(backgroundSource, /async function fetchLoginButtonAvatarAsDataUrl\(url = "", accessToken = "", clientId = ""\)/);
  assert.match(backgroundSource, /Avatar relay only supports Adobe avatar hosts\./);
  assert.match(backgroundSource, /if \(message\?\.type === LOGINBUTTON_FETCH_AVATAR_REQUEST_TYPE\) \{/);
});

test("authenticated CM and Programmer controls live in separate field containers", () => {
  const appMarkup = fs.readFileSync(path.join(ROOT, "app.html"), "utf8");
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const appCss = fs.readFileSync(path.join(ROOT, "app.css"), "utf8");

  assert.match(appMarkup, /<section id="cmFieldGroup" class="field-cluster field-cluster--cm" hidden aria-label="CM controls">/);
  assert.match(appMarkup, /<section[\s\S]*id="programmerFieldGroup"[\s\S]*class="field-cluster field-cluster--programmer"/);
  assert.match(appMarkup, /id="programmerFieldGroupToggle"/);
  assert.match(appMarkup, /id="programmerFieldGroupBody"/);
  assert.match(appMarkup, /id="cmFieldGroupToggle"/);
  assert.match(appMarkup, /id="cmFieldGroupBody"/);
  assert.match(appMarkup, /id="cmuTokenContainer"/);
  assert.match(appMarkup, /id="cmTenantPickerContainer"/);
  assert.match(appMarkup, /id="programmerPickerContainer"/);
  assert.match(appMarkup, /id="requestorPickerContainer"/);
  assert.match(appMarkup, /id="mvpdPickerContainer"/);
  assert.match(appMarkup, /id="premiumServicesContainer"/);
  assert.match(appMarkup, /id="harpoContainer"/);
  assert.doesNotMatch(appMarkup, /id="registeredApplicationPickerContainer"/);
  assert.doesNotMatch(appMarkup, />Registered Applications</);
  assert.ok(
    appMarkup.indexOf('id="harpoContainer"') < appMarkup.indexOf('id="premiumServicesContainer"'),
    "HARPO should render before Premium Services in the sidepanel"
  );
  assert.ok(
    appMarkup.indexOf('id="programmerFieldGroup"') < appMarkup.indexOf('id="cmFieldGroup"'),
    "Programmer controls should render before CM controls"
  );
  assert.match(appSource, /function syncAuthenticatedFieldGroups\(\)/);
  assert.match(appSource, /function setFieldClusterCollapsed\(clusterKey = "", collapsed = false\)/);
  assert.match(appSource, /function syncFieldClusterPresentation\(groupElement = null, toggleButton = null, bodyElement = null, collapsed = false\)/);
  assert.match(appSource, /const cmVisible = \[cmuTokenSection, cmTenantPickerSection\]\.some/);
  assert.match(appSource, /const programmerVisible = \[programmerPickerSection, requestorPickerSection, mvpdPickerSection, premiumServicesSection\]\.some/);
  assert.match(appSource, /syncFieldClusterPresentation\(cmFieldGroup, cmFieldGroupToggle, cmFieldGroupBody, state\.cmFieldGroupCollapsed\)/);
  assert.match(
    appSource,
    /syncFieldClusterPresentation\(\s*programmerFieldGroup,\s*programmerFieldGroupToggle,\s*programmerFieldGroupBody,\s*state\.programmerFieldGroupCollapsed\s*\)/
  );
  assert.match(appSource, /function syncMvpdPicker\(authenticatedDataContext = \{\}\)/);
  assert.doesNotMatch(appSource, /syncRegisteredApplicationPicker\(authenticatedDataContext\);/);
  assert.match(appSource, /selectedMvpdId:/);
  assert.match(appCss, /\.field-cluster,\s*\.field-clusterHeader,\s*\.field-clusterBody,\s*\.field-clusterHeaderCopy,/);
  assert.match(appCss, /\.field-clusterToggle \{/);
  assert.match(appCss, /\.field-clusterBody > \.org-pickerCompact \{\s*padding-top: 0;\s*border-top: 0;/);
  assert.doesNotMatch(appCss, /\.field-cluster::before/);
  assert.doesNotMatch(appCss, /\.field-cluster > \.org-pickerCompact:first-of-type/);
});

test("HARPO waits for selected requestor REST V2 configuration and scopes live traffic to harvested domains", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  assert.match(appSource, /function deriveHarpoRestV2Available\(authenticatedDataContext = \{\}\)/);
  assert.match(appSource, /function buildHarpoRestV2CandidateSignature\(authenticatedDataContext = \{\}\)/);
  assert.match(appSource, /function isHarpoRequestorConfigurationLoading\(authenticatedDataContext = buildAuthenticatedUserDataContext\(state\.session\)\)/);
  assert.match(
    appSource,
    /async function ensureHarpoRequestorConfigurationHydrated\(\s*authenticatedDataContext = buildAuthenticatedUserDataContext\(state\.session\),\s*\{\s*forceRefresh = false\s*\} = \{\}\s*\)/
  );
  assert.match(appSource, /async function resolveHarpoRequestorConfigurationPayload\(programmerId = "", requestorId = ""\)/);
  assert.match(appSource, /const harpoRequestorConfigurationByKey = new Map\(\);/);
  assert.match(appSource, /const harpoRequestorConfigurationPromiseByKey = new Map\(\);/);
  assert.match(appSource, /function invalidateHarpoRequestorConfiguration\(programmerId = "", requestorId = ""\)/);
  assert.match(appSource, /function getHarpoCachedRequestorConfiguration\(programmerId = "", requestorId = ""\)/);
  assert.match(appSource, /function setHarpoCachedRequestorConfiguration\(programmerId = "", requestorId = "", configuration = null\)/);
  assert.match(appSource, /function getHarpoRequestorConfigurationLoadPromise\(programmerId = "", requestorId = ""\)/);
  assert.match(appSource, /function setHarpoRequestorConfigurationLoadPromise\(programmerId = "", requestorId = "", promise = null\)/);
  assert.match(appSource, /async function ensureHarpoProgrammerApplicationsReady\(programmerId = ""\)/);
  assert.match(appSource, /async function hydrateSelectedRequestorConfiguration\(\{ forceRefresh = false \} = \{\}\)/);
  assert.match(appSource, /function programmerRegisteredApplicationsNeedHydration\(/);
  assert.match(appSource, /async function hydrateProgrammerRegisteredApplicationsForRuntime\(/);
  assert.match(appSource, /async function hydrateProgrammerRegisteredApplicationsFromProgrammerRefs\(/);
  assert.match(appSource, /function getMissingProgrammerRegisteredApplicationReferenceIds\(/);
  assert.match(appSource, /`\/api\/v2\/\$\{encodeURIComponent\(normalizedRequestorId\)\}\/configuration`/);
  assert.match(appSource, /const HARPO_REQUESTOR_CONFIGURATION_TIMEOUT_MS = 15000;/);
  assert.match(appSource, /resolveAdobePassServiceBaseUrl\("sp", session\)/);
  assert.doesNotMatch(appSource, /resolveAdobePassServiceBaseUrl\("api", session\)\.replace\(\/\\\/\+\$\/, ""\)\}\/`\s*\)\.toString\(\)/);
  assert.match(appSource, /function buildRestV2Headers\(requestorId, extraHeaders = \{\}\)/);
  assert.match(appSource, /"AP-Device-Identifier": buildDeviceIdentifierPayload\(\)/);
  assert.match(appSource, /"X-Device-Info": encodeDevicePayload\(buildLegacyDeviceInfoPayload\(requestorId\)\)/);
  assert.match(appSource, /window\.setTimeout\(\(\) => controller\.abort\(\), HARPO_REQUESTOR_CONFIGURATION_TIMEOUT_MS\)/);
  assert.match(appSource, /HARPO requestor configuration timed out after \$\{HARPO_REQUESTOR_CONFIGURATION_TIMEOUT_MS\}ms\./);
  assert.match(appSource, /function getHarpoRequestorConfigurationCollection\(payload = null, collectionKeys = \[\]\)/);
  assert.match(appSource, /const seenIds = new Set\(\);/);
  assert.match(appSource, /normalizedMvpd\?\.mvpdId/);
  assert.match(appSource, /normalizedMvpd\?\.providerId/);
  assert.match(appSource, /normalizedMvpd\?\.identifier/);
  assert.match(appSource, /const reproDomains = domains\.filter\(\(domain\) => domain !== "adobe\.com"\);/);
  assert.match(appSource, /const safeDomains = dedupeCandidateStrings\(\["adobe\.com", \.\.\.domains\]\)\.filter\(Boolean\);/);
  assert.match(appSource, /const domainCollection = getHarpoRequestorConfigurationCollection\(responsePayload,\s*\["domains", "domain"\]\);/);
  assert.match(appSource, /mvpds:\s*normalizeHarpoMvpdList\(getHarpoRequestorConfigurationCollection\(responsePayload,\s*\["mvpds", "mvpd"\]\)\)/);
  assert.match(appSource, /collectRestV2AppCandidatesFromPremiumApps\(premiumApps\)/);
  assert.match(appSource, /if \(!registeredApplicationMatchesRequiredScope\(application, "api:client:v2"\)\) \{\s*return;\s*\}/);
  assert.match(appSource, /collectRestV2CandidateApplications\(registeredApplications\)/);
  assert.match(appSource, /buildRegisteredApplicationHealthServiceCandidates\(\s*"restV2",/);
  assert.match(appSource, /collectPremiumServiceCandidateApplications\([\s\S]*?\)\.filter\(\(application\) => registeredApplicationMatchesRequiredScope\(application, serviceDefinition\.requiredScope\)\)/);
  assert.match(appSource, /hydrateProgrammerRegisteredApplicationsForRuntime\(currentSession,\s*normalizedProgrammerId,\s*registeredApplications,\s*\{/);
  assert.match(appSource, /hydrateProgrammerRegisteredApplicationsFromProgrammerRefs\(\s*currentSession,\s*normalizedProgrammerId,\s*baseApplications,/);
  assert.match(appSource, /const bulkHydrationResult = await settle\(\(\) =>\s*fetchRegisteredApplicationsByIds\(/);
  assert.match(appSource, /if \(programmerRefHydrationResult\?\.error\) \{/);
  assert.match(appSource, /function isRetryableAdobePageContextScriptingError\(error = null\)/);
  assert.match(appSource, /if \(isRetryableAdobePageContextScriptingError\(error\) && Date\.now\(\) < deadline\) \{/);
  assert.match(appSource, /const orderedCandidates = mergeRegisteredApplicationCatalogs\(/);
  assert.match(appSource, /const preferredApplicationId = String\(harpoRestV2PreferredAppIdByRequestorKey\.get\(configurationKey\) \|\| ""\)\.trim\(\);/);
  assert.match(appSource, /harpoRestV2PreferredAppIdByRequestorKey\.set\(\s*configurationKey,/);
  assert.match(appSource, /const HARPO_REST_V2_CANDIDATE_BATCH_SIZE = 2;/);
  assert.match(appSource, /const programmerServiceClientCacheByKey = new Map\(\);/);
  assert.match(appSource, /function buildProgrammerServiceClientCacheKey\(/);
  assert.match(appSource, /function getCachedProgrammerServiceClient\(/);
  assert.match(appSource, /function setCachedProgrammerServiceClient\(/);
  assert.match(appSource, /async function ensureServiceApplicationClientHydrated\(/);
  assert.match(appSource, /ensureServiceApplicationClientHydrated\(\s*normalizedProgrammerId,\s*"restV2",\s*candidate,/);
  assert.match(appSource, /const candidateBatch = orderedCandidates\.slice\(index,\s*index \+ HARPO_REST_V2_CANDIDATE_BATCH_SIZE\);/);
  assert.match(appSource, /const resolvedConfiguration = await Promise\.any\(batchAttempts\);/);
  assert.match(appSource, /buildRestV2Headers\(normalizedRequestorId,\s*\{\s*Accept:\s*"application\/json;charset=utf-8"/);
  assert.doesNotMatch(appSource, /buildOrderedRestV2CandidateApplicationsFromPremiumApps\(/);
  assert.doesNotMatch(appSource, /requestorId:\s*normalizedRequestorId/);
  assert.match(appSource, /void hydrateSelectedRequestorConfiguration\(\);/);
  assert.match(appSource, /const isThemeProcessing = isThemeActivityActive\(authenticatedDataContext\);/);
  assert.match(appSource, /function isThemeActivityActive\(authenticatedDataContext = buildAuthenticatedUserDataContext\(state\.session\)\)/);
  assert.match(appSource, /isHarpoRequestorConfigurationLoading\(authenticatedDataContext\)/);
  assert.match(appSource, /void ensureSelectedProgrammerApplicationsLoaded\(normalizedProgrammerId\)\.catch\(\(error\) => \{/);
  assert.match(appSource, /await ensureHarpoProgrammerApplicationsReady\(programmerId\);/);
  assert.match(appSource, /let snapshotContext = await ensureHarpoProgrammerApplicationsReady\(normalizedProgrammerId\);/);
  assert.match(appSource, /fetchHarpoRequestorConfigurationPayload\(\s*normalizedRequestorId,\s*accessToken,\s*state\.session\s*\)/);
  assert.match(appSource, /const restV2CandidateSignature = buildHarpoRestV2CandidateSignature\(authenticatedDataContext\);/);
  assert.match(appSource, /if \(currentConfiguration\.key === configurationKey && String\(currentConfiguration\.status \|\| ""\) === "loading"\) \{/);
  assert.match(appSource, /const cachedErrorStillCurrent =[\s\S]*cachedCandidateSignature === restV2CandidateSignature;/);
  assert.match(appSource, /if \(cachedConfiguration\?\.status === "ready" \|\| cachedErrorStillCurrent\) \{/);
  assert.match(appSource, /if \(cachedConfiguration\?\.status === "error"\) \{/);
  assert.match(appSource, /HARPO requestor configuration retrying for \$\{requestorLabel \|\| requestorId\} after the REST V2 candidate context changed\./);
  assert.match(appSource, /if \(existingLoadPromise\) \{\s*return existingLoadPromise;\s*\}/);
  assert.match(appSource, /HARPO requestor configuration load restarted for \$\{requestorLabel \|\| requestorId\}/);
  assert.match(appSource, /serviceKeys:\s*\["restV2"\]/);
  assert.match(
    appSource,
    /state\.harpoRequestorConfiguration = loadingConfiguration;\s*setHarpoRequestorConfigurationLoadPromise\(programmerId,\s*requestorId,\s*loadPromise\);\s*render\(\);/
  );
  assert.match(appSource, /promoteHarpoResolvedRestV2Application\(programmerId,\s*resolvedConfiguration\?\.registeredApplication\)/);
  assert.match(appSource, /const errorConfiguration = setHarpoCachedRequestorConfiguration\(programmerId,\s*requestorId,\s*\{/);
  assert.match(appSource, /restV2CandidateSignature:\s*firstNonEmptyString\(\[\s*resolvedConfiguration\?\.candidateSignature,\s*restV2CandidateSignature\s*\]\)/);
  assert.match(
    appSource,
    /buildHarpoRequestorConfigurationKey\(\s*firstNonEmptyString\(\[refreshedContext\?\.selectedProgrammer\?\.id,\s*refreshedContext\?\.selectedProgrammer\?\.key\]\),\s*firstNonEmptyString\(\[refreshedContext\?\.selectedRequestor\?\.id,\s*refreshedContext\?\.selectedRequestor\?\.key\]\)\s*\)/
  );
  assert.match(appSource, /HARPO requestor configuration ready for \$\{requestorLabel \|\| requestorId\}:/);
  assert.match(appSource, /return deriveHarpoRestV2Available\(authenticatedDataContext\) &&[\s\S]*Boolean\(authenticatedDataContext\?\.selectedRequestor\);/);
  assert.match(appSource, /setHarpoStatus\(`Harvesting Requestor domains for \$\{requestorLabel \|\| "the selected Content Provider"\}…`\);/);
  assert.match(appSource, /harpoReproButton\.disabled =[\s\S]*requestorConfiguration\.status === "loading"[\s\S]*requestorConfiguration\.status === "error"[\s\S]*reproDomains\.length === 0;/);
  assert.match(appSource, /authenticatedDataContext\?\.selectedRequestor/);
  assert.match(appSource, /requestorName:\s*firstNonEmptyString\(\[selectedRequestor\?\.label, selectedRequestor\?\.name\]\),/);
  assert.match(appSource, /safeDomains/);
  assert.match(appSource, /mvpdOptions/);
  assert.match(appSource, /syncHarpoRequestorConfigurationHydration\(authenticatedDataContext\);\s*syncMvpdPicker\(authenticatedDataContext\);/);
  assert.match(appSource, /const requestorConfigurationLoadPromise = getHarpoRequestorConfigurationLoadPromise\(programmerId, requestorId\);/);
  assert.match(appSource, /String\(requestorConfiguration\.status \|\| ""\) === "loading" \|\|\s*\(String\(requestorConfiguration\.status \|\| ""\) === "idle" && Boolean\(requestorConfigurationLoadPromise\)\)/);
  assert.match(appSource, /function syncHarpoRequestorConfigurationHydration\(authenticatedDataContext = \{\}\) \{/);
  assert.doesNotMatch(
    appSource.match(/function syncHarpoSection\([\s\S]*?\n}\n\nfunction /)?.[0] || "",
    /void ensureHarpoRequestorConfigurationHydrated\(authenticatedDataContext\);/
  );
  assert.match(appSource, /Loading MVPDs from REST V2 configuration…/);
  assert.match(appSource, /Choose an MVPD \(\$\{options\.length\} loaded\)/);
  assert.match(appSource, /pushDebugSection\(lines, "harpo", \[/);
  assert.match(appSource, /harpo_requestor_configuration_status=/);
  assert.match(appSource, /harpo_restv2_candidate_count=/);
});

test("HARPO keeps a persistent VCR-style record toolbar beside the domain picker", () => {
  const appMarkup = fs.readFileSync(path.join(ROOT, "app.html"), "utf8");
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const appCss = fs.readFileSync(path.join(ROOT, "app.css"), "utf8");

  assert.match(appMarkup, /class="harpo-reproToolbar"/);
  assert.match(appMarkup, /class="spectrum-FieldLabel spectrum-FieldLabel--sizeS harpo-domainLabel"/);
  assert.match(appMarkup, /class="org-pickerControl harpo-domainControl"/);
  assert.doesNotMatch(appMarkup, /class="harpo-domainField"/);
  assert.match(appMarkup, /id="harpoRecordToggleButton"/);
  assert.match(appMarkup, /id="harpoRecordToggleIcon"/);
  assert.match(appMarkup, /id="harpoRecordToggleLabel"/);
  assert.match(appMarkup, />\s*Domains\s*</);
  assert.doesNotMatch(appMarkup, /id="harpoLaunchButton"/);
  assert.doesNotMatch(appMarkup, /id="harpoStopButton"/);

  assert.match(appSource, /const harpoRecordToggleButton = document\.getElementById\("harpoRecordToggleButton"\);/);
  assert.match(appSource, /const harpoRecordToggleIcon = document\.getElementById\("harpoRecordToggleIcon"\);/);
  assert.match(appSource, /const harpoRecordToggleLabel = document\.getElementById\("harpoRecordToggleLabel"\);/);
  assert.match(appSource, /harpoRecordingStarting: false,/);
  assert.match(appSource, /harpoRecordingStopping: false,/);
  assert.match(appSource, /harpoRecordToggleButton\.addEventListener\("click", async \(\) => \{/);
  assert.match(appSource, /if \(state\.harpoRecording\) \{\s*await harpoStopRecordingFromPanel\(\);/);
  assert.match(appSource, /const recordToggleLabel = isRecordingStarting\s*\?\s*"RECORDING"/);
  assert.match(appSource, /harpoRecordToggleButton\.setAttribute\("aria-label", recordToggleLabel\);/);
  assert.match(appSource, /harpoRecordToggleButton\.title = recordToggleLabel;/);
  assert.match(appSource, /harpoRecordToggleLabel\.textContent = recordToggleLabel;/);
  assert.match(appSource, /harpoRecordToggleIcon\.classList\.toggle\("harpo-recordToggleIcon--record", !showStopState\);/);
  assert.match(appSource, /harpoRecordToggleIcon\.classList\.toggle\("harpo-recordToggleIcon--stop", showStopState\);/);

  const stopSectionMatch = appSource.match(
    /async function harpoStopRecordingFromPanel\([\s\S]*?\n}\n\n\/\/ ── HARPO: live call count polling/
  );
  assert.ok(stopSectionMatch, "harpoStopRecordingFromPanel should exist");
  assert.doesNotMatch(stopSectionMatch[0], /state\.harpoReproOpen = false;/);

  assert.match(appCss, /\.harpo-reproToolbar \{/);
  assert.match(appCss, /\.harpo-domainLabel \{/);
  assert.match(appCss, /\.harpo-domainControl \{/);
  assert.match(appCss, /\.harpo-recordToggle \{/);
  assert.match(appCss, /gap: var\(--spectrum-spacing-200\);/);
  assert.match(appCss, /block-size: 34px;/);
  assert.match(appCss, /inline-size: 40px;/);
  assert.match(appCss, /min-inline-size: 40px;/);
  assert.match(appCss, /padding: 0;/);
  assert.match(appCss, /\.harpo-recordToggle\.is-recording \{/);
  assert.match(appCss, /\.harpo-recordToggleIcon--record \{/);
  assert.match(appCss, /\.harpo-recordToggleIcon--stop \{/);
});

test("Programmer hydration retains programmer-owned registered application refs for vault-backed runtime rebuilds", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  const normalizeProgrammersMatch = appSource.match(
    /function normalizeConsoleProgrammers\([\s\S]*?\n}\n\nfunction programmerMatchesCmTenant/
  );
  assert.ok(normalizeProgrammersMatch, "normalizeConsoleProgrammers should exist");
  assert.match(normalizeProgrammersMatch[0], /const programmerApplicationReferences = Array\.isArray\(entityData\.applications\)/);
  assert.match(
    normalizeProgrammersMatch[0],
    /applications:\s*programmerApplicationReferences\.map\(\(reference\) => computeEntityReferenceId\(reference\)\)\.filter\(Boolean\)/
  );
  assert.match(normalizeProgrammersMatch[0], /applicationCount:\s*programmerApplicationReferences\.filter\(Boolean\)\.length/);

  const fetchProgrammerAppsMatch = appSource.match(
    /async function fetchProgrammerRegisteredApplications\([\s\S]*?\n}\n\nasync function ensureSelectedProgrammerApplicationsLoaded/
  );
  assert.ok(fetchProgrammerAppsMatch, "fetchProgrammerRegisteredApplications should exist");
  assert.match(fetchProgrammerAppsMatch[0], /const baseApplications = normalizeConsoleRegisteredApplications\(result\?\.data\);/);
  assert.match(fetchProgrammerAppsMatch[0], /hydrateProgrammerRegisteredApplicationsFromProgrammerRefs\(/);
  assert.match(fetchProgrammerAppsMatch[0], /applications:\s*Array\.isArray\(programmerRefHydrationResult\?\.applications\)/);

  const buildConsoleContextMatch = appSource.match(
    /async function buildConsoleContext\([\s\S]*?\n}\n\nasync function buildCmContext/
  );
  assert.ok(buildConsoleContextMatch, "buildConsoleContext should exist");
  assert.match(buildConsoleContextMatch[0], /applicationsByProgrammer:\s*\{\}/);
  assert.match(buildConsoleContextMatch[0], /applicationErrorsByProgrammer:\s*\{\}/);

  assert.match(appSource, /const programmerApplicationsLoadPromiseById = new Map\(\);/);
  assert.match(appSource, /function stampProgrammerRuntimeValue\(/);
  assert.match(appSource, /function getProgrammerRuntimeValueSource\(/);
  assert.match(appSource, /function isVaultBackedProgrammerRuntimeValue\(/);
  assert.match(appSource, /function resolveProgrammerRegisteredApplicationsRuntimeState\(/);
  assert.match(appSource, /function getCurrentProgrammerApplicationsSnapshot\(programmerId = "", \{ allowVaultBacked = true \} = \{\}\)/);
  assert.match(appSource, /const liveApplications = getCurrentProgrammerApplicationsSnapshot\(normalizedProgrammerId,\s*\{\s*allowVaultBacked:\s*false\s*\}\);/);
  assert.match(appSource, /const existingLoadPromise = programmerApplicationsLoadPromiseById\.get\(normalizedProgrammerId\);/);
  assert.match(appSource, /programmerApplicationsLoadPromiseById\.set\(normalizedProgrammerId,\s*workPromise\);/);
  assert.match(appSource, /registeredApplicationsSource:\s*"vault"/);
  assert.match(appSource, /registeredApplicationsSource:\s*"live"/);
});

test("console programmer normalization mirrors UnderPAR identifier and requestor derivation rules", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  assert.match(appSource, /function deriveProgrammerRequestorOptionsFromChannels\(programmerData = null, channels = \[\]\)/);
  assert.match(
    appSource,
    /const normalizedProgrammerId = normalizeOrganizationIdentifier\(\s*firstNonEmptyString\(\[programmerData\.id, programmerData\.programmerId, programmerData\["programmer-id"\]\]\)\s*\)/s
  );
  assert.match(
    appSource,
    /const channels = channelsResult\.ok \? normalizeConsoleChannels\(channelsResult\.value\?\.data\) : \[\];\s*const programmers = programmersResult\.ok \? normalizeConsoleProgrammers\(programmersResult\.value\?\.data, channels\) : \[\];/s
  );
  assert.match(
    appSource,
    /const id = firstNonEmptyString\(\[\s*entityData\.id,\s*entityData\.programmerId,\s*entityData\["programmer-id"\],/s
  );
  assert.match(appSource, /entityData\["display-name"\]/);
  assert.match(
    appSource,
    /const requestorOptions =\s*Array\.isArray\(entityData\.requestorOptions\) && entityData\.requestorOptions\.length > 0\s*\?\s*entityData\.requestorOptions\s*:\s*deriveProgrammerRequestorOptionsFromChannels\(entityData, channels\);/s
  );
  assert.match(appSource, /requestorOptions,/);
  assert.match(appSource, /requestorIds:\s*requestorOptions\.length > 0/);
  assert.match(
    appSource,
    /const id = firstNonEmptyString\(\[entityData\.id, entityData\.channelId, entityData\["channel-id"\], entity\?\.id, entity\?\.key\]\)/
  );
  assert.match(
    appSource,
    /programmerId: firstNonEmptyString\(\[\s*computeEntityReferenceId\(entityData\.programmer\),\s*entityData\.programmerId,\s*entityData\["programmer-id"\]\s*\]\)/s
  );
  assert.match(
    appSource,
    /const resolvedProgrammerId = firstNonEmptyString\(\[\s*selectedProgrammer\.id,\s*selectedProgrammer\.programmerId,/s
  );
  assert.match(
    appSource,
    /: deriveProgrammerRequestorOptionsFromChannels\(selectedProgrammer\?\.raw \|\| selectedProgrammer, channelOptions\);/
  );
});

test("LoginButton keeps Content Provider selection user-driven across reloads", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const vaultSource = fs.readFileSync(path.join(ROOT, "vault.js"), "utf8");

  const singletonSectionMatch = appSource.match(
    /function autoSelectSingletonAuthenticatedOptions\([\s\S]*?\n}\n\nasync function autoActivateAdobePassProgrammerContext/
  );
  assert.ok(singletonSectionMatch, "autoSelectSingletonAuthenticatedOptions should exist");
  assert.doesNotMatch(singletonSectionMatch[0], /authenticatedDataContext\.requestorOptions\.length === 1/);
  assert.doesNotMatch(singletonSectionMatch[0], /state\.selectedRequestorId = firstNonEmptyString/);

  const requestorChangeSectionMatch = appSource.match(
    /if \(requestorPicker\) \{[\s\S]*?\n}\n\nif \(mvpdPicker\)/
  );
  assert.ok(requestorChangeSectionMatch, "requestor change handler should exist");
  assert.doesNotMatch(requestorChangeSectionMatch[0], /persistSelectedProgrammerVaultSelections/);
  assert.doesNotMatch(requestorChangeSectionMatch[0], /invalidateHarpoRequestorConfiguration\(programmerId,\s*nextValue\)/);
  assert.doesNotMatch(requestorChangeSectionMatch[0], /forceRefresh:\s*true/);
  assert.match(requestorChangeSectionMatch[0], /void hydrateSelectedRequestorConfiguration\(\);/);

  const mvpdChangeSectionMatch = appSource.match(
    /if \(mvpdPicker\) \{[\s\S]*?\n}\n\nif \(cmTenantPicker\)/
  );
  assert.ok(mvpdChangeSectionMatch, "mvpd change handler should exist");
  assert.doesNotMatch(mvpdChangeSectionMatch[0], /persistSelectedProgrammerVaultSelections/);

  const persistedSelectionSectionMatch = appSource.match(
    /function applyPersistedProgrammerSelections\([\s\S]*?\n}\n\nfunction mergeProgrammerApplicationsIntoSession/
  );
  assert.ok(persistedSelectionSectionMatch, "applyPersistedProgrammerSelections should exist");
  assert.match(persistedSelectionSectionMatch[0], /state\.selectedRequestorId = "";/);
  assert.match(persistedSelectionSectionMatch[0], /state\.selectedMvpdId = "";/);
  assert.doesNotMatch(persistedSelectionSectionMatch[0], /vaultRecord\?\.selectedRequestorId/);

  const selectionPersistSectionMatch = appSource.match(
    /async function persistSelectedProgrammerVaultSelections\([\s\S]*?\n}\n\nfunction hydrateSelectedProgrammerFromVaultRecord/
  );
  assert.ok(selectionPersistSectionMatch, "persistSelectedProgrammerVaultSelections should exist");
  assert.match(selectionPersistSectionMatch[0], /selectedRequestorId:\s*""/);
  assert.match(selectionPersistSectionMatch[0], /selectedMvpdId:\s*""/);

  assert.match(vaultSource, /Object\.prototype\.hasOwnProperty\.call\(normalizedInput, "selectedRequestorId"\)/);
  assert.match(vaultSource, /Object\.prototype\.hasOwnProperty\.call\(normalizedInput, "selectedMvpdId"\)/);
});

test("programmer selection pre-hydrates available premium service clients before first requestor usage", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  assert.match(appSource, /const programmerPremiumHydrationPromiseByKey = new Map\(\);/);
  assert.match(appSource, /const programmerApplicationsSnapshotById = new Map\(\);/);
  assert.match(appSource, /const programmerPremiumServicesSnapshotById = new Map\(\);/);
  assert.match(appSource, /function buildProgrammerPremiumHydrationKey\(/);
  assert.match(appSource, /function updateProgrammerRuntimeSnapshots\(/);
  assert.match(appSource, /function buildProgrammerPremiumRuntimeSnapshot\(/);
  assert.match(appSource, /async function ensureProgrammerPremiumServicesHydrated\(/);
  assert.match(appSource, /hydrateProgrammerRegisteredApplicationsForRuntime\(currentSession,\s*normalizedProgrammerId,\s*liveApplications,\s*\{/);
  assert.match(appSource, /hydrateProgrammerRegisteredApplicationsForRuntime\(mergedSession,\s*normalizedProgrammerId,\s*hydratedApplications,\s*\{/);
  assert.match(appSource, /collectAvailableVaultServiceKeys\(snapshotContext\.registeredApplications\)/);
  assert.match(appSource, /vaultServiceRecordReadyForDefinition\(/);
  assert.match(appSource, /const (?:premiumHydrationResult|hydrationResult) = await settle\(\(\) =>\s*ensureProgrammerPremiumServicesHydrated\(normalizedProgrammerId,\s*\{/);
  assert.match(appSource, /registeredApplications:\s*readyApplications/);
  assert.match(appSource, /const provisionalRuntimeSnapshot = updateProgrammerRuntimeSnapshots\(normalizedProgrammerId,\s*\{/);
  assert.match(appSource, /registeredApplications:\s*hydratedApplications,/);
  assert.match(appSource, /maybeAutoSelectPrimaryRestV2ApplicationForProgrammer\(normalizedProgrammerId,\s*\{\s*registeredApplications:\s*provisionalRuntimeSnapshot\?\.registeredApplications,/);
  assert.match(appSource, /state\.programmerApplicationsLoadingFor = "";\s*render\(\);\s*\n\s*const catalogHydrationResult = await settle/s);
  assert.match(appSource, /const hydrationKey = buildProgrammerPremiumHydrationKey\(normalizedProgrammerId,\s*\{/);
  assert.match(appSource, /const hydrationResult = await settle\(\(\) =>\s*ensureProgrammerPremiumServicesHydrated\(normalizedProgrammerId,\s*\{/);
  assert.match(appSource, /source:\s*"programmer-selection"/);
  assert.match(appSource, /function maybeAutoSelectPrimaryRestV2ApplicationForProgrammer\(/);
  assert.match(appSource, /function buildRegisteredApplicationHealthServiceCandidates\(/);
  assert.match(appSource, /collectRestV2AppCandidatesFromPremiumApps\(resolvedRuntimeServices\)/);
  assert.match(appSource, /maybeAutoSelectPrimaryRestV2ApplicationForProgrammer\(normalizedProgrammerId,/);
  assert.match(appSource, /persistSelectedProgrammerVaultSelections\(normalizedProgrammerId\)/);
  assert.match(appSource, /const premiumHydrationResult = await settle\(\(\) =>\s*ensureProgrammerPremiumServicesHydrated\(normalizedProgrammerId,\s*\{/);
  assert.match(appSource, /source:\s*"programmer-selection"/);
});

test("requestor changes keep REST V2 app ownership programmer-scoped across vault hydration", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const vaultSource = fs.readFileSync(path.join(ROOT, "vault.js"), "utf8");

  const requestorChangeSectionMatch = appSource.match(
    /if \(requestorPicker\) \{[\s\S]*?\n}\n\nif \(mvpdPicker\)/
  );
  assert.ok(requestorChangeSectionMatch, "requestor change handler should exist");
  assert.doesNotMatch(requestorChangeSectionMatch[0], /maybeAlignSelectedRegisteredApplicationToRequestor\(nextValue\);/);
  assert.doesNotMatch(requestorChangeSectionMatch[0], /const programmerId = firstNonEmptyString\(\[state\.selectedProgrammerId\]\);/);
  assert.doesNotMatch(requestorChangeSectionMatch[0], /invalidateHarpoRequestorConfiguration\(programmerId,\s*nextValue\);/);
  assert.doesNotMatch(requestorChangeSectionMatch[0], /forceRefresh:\s*true/);
  assert.match(requestorChangeSectionMatch[0], /void hydrateSelectedRequestorConfiguration\(\);/);
  assert.doesNotMatch(appSource, /function registeredApplicationSupportsServiceProviderId\(/);
  assert.doesNotMatch(appSource, /function resolveMappedRestV2ApplicationForRequestor\(/);
  assert.doesNotMatch(appSource, /function registeredApplicationSupportsRequestor\(/);
  assert.match(appSource, /function extractApplicationGuid\(/);
  assert.match(appSource, /function resolveApplicationGuidFromEntityData\(/);
  assert.match(appSource, /function normalizeRegisteredApplicationRuntimeRecord\(/);
  assert.match(appSource, /guid:\s*firstNonEmptyString\(\[guid, id, key\]\),/);
  assert.match(appSource, /const scopes = resolveRegisteredApplicationScopes\(/);
  assert.match(appSource, /function resolveRegisteredApplicationScopes\(/);
  assert.match(appSource, /function getScopesFromApplicationData\(/);
  assert.match(appSource, /pushValue\(normalizedApplication\?\.serviceProviders\);/);
  assert.match(appSource, /pushValue\(normalizedApplication\?\.appData\?\.serviceProviders\);/);
  assert.match(appSource, /pushValue\(normalizedApplication\?\.requestor\);/);
  assert.match(appSource, /appData:\s*[\s\S]*runtimeRecord\?\.appData/);
  assert.match(appSource, /const persistedMetadata = buildPersistableRegisteredApplicationMetadata\(application\);/);
  assert.match(appSource, /guid:\s*firstNonEmptyString\(\[applicationGuid, application\?\.guid, application\?\.id, application\?\.key\]\),/);
  assert.match(appSource, /serviceProviders:\s*persistedMetadata\.serviceProviders,/);
  assert.match(appSource, /serviceProviders:\s*persistedMetadata\.serviceProviders,/);
  assert.doesNotMatch(appSource, /requestor:\s*persistedMetadata\.requestor,/);
  assert.match(appSource, /function normalizeRegisteredApplicationPayloadEntities\(/);
  assert.match(appSource, /if \(payload && typeof payload === "object"\) \{/);
  assert.match(appSource, /const singleEntity = normalizeEntity\(payload\);/);
  assert.match(appSource, /function buildVaultProgrammerRegisteredApplicationCatalog\(/);
  assert.match(appSource, /const selectedApplications = buildVaultProgrammerRegisteredApplicationCatalog\(/);
  assert.match(appSource, /function mergeRegisteredApplicationCatalogs\(/);
  assert.match(appSource, /const applicationsState = resolveProgrammerRegisteredApplicationsRuntimeState\(normalizedProgrammerId,\s*\{/);
  assert.match(appSource, /const effectiveRegisteredApplications = applicationsState\.registeredApplications;/);
  assert.doesNotMatch(appSource, /const vaultCatalog =/);
  assert.match(appSource, /const selectedProgrammerId = firstNonEmptyString\(\[selectedProgrammer\?\.id, selectedProgrammer\?\.key\]\);/);
  assert.match(appSource, /const selectedRequestorId = firstNonEmptyString\(\[selectedRequestor\?\.id, selectedRequestor\?\.key\]\);/);
  assert.match(appSource, /const selectedHarpoConfigurationKey = buildHarpoRequestorConfigurationKey\(selectedProgrammerId, selectedRequestorId\);/);
  assert.match(appSource, /const runtimeServices =\s*getCurrentPremiumAppsSnapshot\(normalizedProgrammerId\)/);
  assert.match(appSource, /const cachedHarpoRequestorConfiguration = selectedHarpoConfigurationKey/);
  assert.match(appSource, /const existingLoadPromise = getHarpoRequestorConfigurationLoadPromise\(programmerId, requestorId\);/);
  assert.match(appSource, /const loadPromise = \(async \(\) => \{/);
  assert.match(appSource, /const catalogApplicationIds = new Set\(/);
  assert.match(appSource, /const leftCatalog = Number\(Boolean\(leftId && catalogApplicationIds\.has\(leftId\)\)\);/);
  assert.match(appSource, /const rightCatalog = Number\(Boolean\(rightId && catalogApplicationIds\.has\(rightId\)\)\);/);
  assert.doesNotMatch(appSource, /pushValue\(programmerId\);/);
  assert.match(appSource, /const orderedCandidates = mergeRegisteredApplicationCatalogs\(/);
  assert.match(appSource, /promoteHarpoResolvedRestV2Application\(programmerId,\s*resolvedConfiguration\?\.registeredApplication\);/);
  assert.match(appSource, /collectRestV2CandidateApplications\(registeredApplications\)/);
  assert.doesNotMatch(appSource, /state\.selectedRegisteredApplicationId = resolvedRegisteredApplicationId;/);
  assert.doesNotMatch(appSource, /serviceProviders\[0\]/);

  assert.match(vaultSource, /LOGINBUTTON_VAULT_SCHEMA_VERSION = 10;/);
  assert.match(vaultSource, /function extractApplicationGuid\(/);
  assert.match(vaultSource, /guid: guid \|\| id \|\| key,/);
  assert.match(vaultSource, /reason: "schema-version-changed"/);
  assert.match(vaultSource, /const serviceProviders = uniqueStrings\(/);
  assert.match(vaultSource, /serviceProviders,/);
  assert.doesNotMatch(vaultSource, /requestor: firstNonEmptyString\(\[/);
  assert.doesNotMatch(vaultSource, /serviceProviders\[0\]/);
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

test("authenticated programmer context uses the VAULT-backed runtime snapshot when available", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  const authenticatedContextSectionMatch = appSource.match(
    /function buildAuthenticatedUserDataContext\([\s\S]*?\n}\n\nfunction buildAuthenticatedSummaryCards/
  );
  assert.ok(authenticatedContextSectionMatch, "buildAuthenticatedUserDataContext should exist");
  assert.match(authenticatedContextSectionMatch[0], /const selectedProgrammerRuntimeContext = programmerAccess\.eligible/);
  assert.match(authenticatedContextSectionMatch[0], /buildProgrammerVaultSnapshotContext\(currentSession,/);
  assert.match(authenticatedContextSectionMatch[0], /selectedProgrammerRuntimeContext\?\.registeredApplications/);
  assert.match(authenticatedContextSectionMatch[0], /selectedProgrammerRuntimeContext\?\.premiumServices/);
  assert.match(authenticatedContextSectionMatch[0], /selectedProgrammerRuntimeContext\?\.requestors/);
  assert.match(authenticatedContextSectionMatch[0], /premiumServices\.registeredApplicationLoading === true &&\s*registeredApplications\.length === 0/);
});

test("programmer runtime snapshots prefer explicit or live application catalogs before VAULT seeding", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  assert.match(appSource, /function resolveProgrammerRegisteredApplicationsRuntimeState\(/);
  assert.match(appSource, /const explicitRegisteredApplications = Array\.isArray\(registeredApplications\)/);
  assert.match(appSource, /const liveRuntimeApplications = getCurrentProgrammerApplicationsSnapshot\(normalizedProgrammerId,\s*\{\s*allowVaultBacked:\s*false\s*\}\s*\);/);
  assert.match(appSource, /if \(explicitRegisteredApplications\) \{/);
  assert.match(appSource, /if \(Array\.isArray\(liveRuntimeApplications\)\) \{/);
  assert.match(appSource, /if \(Array\.isArray\(runtimeApplications\)\) \{/);
  assert.match(appSource, /if \(vaultApplications\.length > 0\) \{/);
  assert.match(appSource, /if \(applicationsState\.hydrated\) \{\s*setCurrentProgrammerApplicationsSnapshot/s);
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
  assert.match(appSource, /preferPageContext:\s*true/);
  assert.match(appSource, /allowTemporaryPageContext = false/);
  assert.match(appSource, /allowTemporaryPageContext\s*\n?\s*\}/);
  assert.match(appSource, /fetchRegisteredApplicationBulkRetrieve\(session, normalizedApplicationId/);
  assert.match(appSource, /const normalizedApplicationId = extractApplicationGuid\(applicationId\);/);
  assert.match(appSource, /async function enrichRegisteredApplicationForHydration\(/);
  assert.match(appSource, /async function fetchRegisteredApplicationDetails\(/);
  assert.match(appSource, /async function fetchRegisteredApplicationSoftwareStatement\(/);
  assert.match(appSource, /const pathCandidates = buildRegisteredApplicationDetailPaths\(normalizedApplicationId\);/);
  assert.match(appSource, /registeredApplication = enrichmentResult\.value\.application;/);
  assert.match(appSource, /await registerDcrClientWithSoftwareStatement\(\s*softwareStatement,/);

  const selectionPersistSectionMatch = appSource.match(
    /async function persistSelectedProgrammerVaultSelections\([\s\S]*?\n}\n\nfunction hydrateSelectedProgrammerFromVaultRecord/
  );
  assert.ok(selectionPersistSectionMatch, "persistSelectedProgrammerVaultSelections should exist");
  assert.match(selectionPersistSectionMatch[0], /const selectedServiceKeys = VAULT_DCR_SERVICE_DEFINITIONS\.filter/);
  assert.match(selectionPersistSectionMatch[0], /registeredApplicationMatchesRequiredScope\(selectedRegisteredApplication, definition\.requiredScope\)/);
  assert.match(selectionPersistSectionMatch[0], /serviceKeys: selectedServiceKeys/);
});

test("programmer hydration never opens a temporary Adobe page-context tab", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  assert.match(appSource, /async function hydrateProgrammerRegisteredApplicationsForRuntime\([\s\S]*allowTemporaryPageContext = false/s);
  assert.match(appSource, /fetchRegisteredApplicationsByIds\(currentSession, missingApplicationIds, \{[\s\S]*allowTemporaryPageContext/s);
  assert.match(appSource, /fetchRegisteredApplicationDetails\(session, normalizedApplicationId, \{[\s\S]*allowTemporaryPageContext/s);
  assert.match(appSource, /fetchRegisteredApplicationSoftwareStatement\(session, normalizedApplicationId, \{[\s\S]*allowTemporaryPageContext/s);
  assert.doesNotMatch(appSource, /fetchRegisteredApplicationBulkRetrieve\([\s\S]*allowTemporaryPageContext:\s*true/s);
  assert.doesNotMatch(appSource, /fetchRegisteredApplicationsByIds\([\s\S]*allowTemporaryPageContext:\s*true/s);
});

test("console fetch fallback can prefer Adobe page context before direct extension fetch", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

  assert.match(appSource, /async function fetchConsoleJsonWithFallback\(\{/);
  assert.match(appSource, /preferPageContext = false/);
  assert.match(appSource, /allowTemporaryPageContext = false/);
  assert.match(appSource, /if \(preferPageContext === true\) \{/);
  assert.match(appSource, /const pageContextResult = await settle\(\(\) => tryPageContext\(\)\);/);
  assert.match(appSource, /allowTemporaryTab: allowTemporaryPageContext === true/);
  assert.match(appSource, /throw buildConsoleFallbackError\(directResult\.error, pageContextResult\.error\);/);
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
