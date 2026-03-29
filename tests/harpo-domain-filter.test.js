const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");

async function loadHarpoTrafficHelpers() {
  const sourcePath = path.join(ROOT, "harpo-traffic.js");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harpo-domain-filter-"));
  const tempModulePath = path.join(tempDir, "harpo-traffic.mjs");
  fs.copyFileSync(sourcePath, tempModulePath);
  return import(pathToFileURL(tempModulePath).href);
}

test("HARPO derives quick-pick domain buckets from hostnames", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  assert.equal(
    helpers.getHarpoTrafficHostname("https://api.auth.adobe.com/api/v2/requestor/configuration?device=tv"),
    "api.auth.adobe.com"
  );
  assert.equal(helpers.getHarpoTrafficHostname("*.adobe.com"), "adobe.com");
  assert.equal(helpers.getHarpoTrafficHostname("*.identity1.dishnetwork.com"), "identity1.dishnetwork.com");
  assert.equal(helpers.getHarpoTrafficHostname("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA"), "");
  assert.equal(
    helpers.getHarpoTrafficDomainBucket("https://api.auth.adobe.com/api/v2/requestor/configuration?device=tv"),
    "adobe.com"
  );
  assert.equal(helpers.getHarpoTrafficDomainBucket("https://www.example.com/saml/login"), "example.com");
  assert.equal(helpers.getHarpoTrafficDomainBucket("https://www.bbc.co.uk/news"), "bbc.co.uk");
  assert.equal(helpers.getHarpoTrafficDomainBucket("localhost"), "localhost");
});

test("HARPO workspace renders a domain picker with HTTP status filter pills", () => {
  const html = fs.readFileSync(path.join(ROOT, "harpo.html"), "utf8");
  const js = fs.readFileSync(path.join(ROOT, "harpo.js"), "utf8");

  assert.match(html, /id="harpoFilterBar" class="harpo-filterBar" hidden/);
  assert.match(html, /class="harpo-filterField harpo-filterField--domain"/);
  assert.match(html, /<label for="harpoDomainFilter" class="harpo-filterLabel/);
  assert.match(html, /<select id="harpoDomainFilter" class="harpo-filterSelect" aria-label="Domain filter">/);
  assert.match(html, /id="harpoStatusFilters" class="harpo-statusFilters" aria-label="Status filters"/);
  assert.match(html, /id="harpoStatusFilterPills" class="harpo-statusFilterPills" role="group" aria-label="HTTP status filters"/);
  assert.match(html, /<script src="adobe-pass-decode-helpers\.js"><\/script>/);
  assert.doesNotMatch(html, /id="harpoStats"/);
  assert.doesNotMatch(html, />PASS<\/button>/);
  assert.doesNotMatch(html, />IMS<\/button>/);
  assert.doesNotMatch(html, />MVPD<\/button>/);
  assert.doesNotMatch(html, />ERRORS<\/button>/);
  assert.doesNotMatch(html, /class="harpo-filterBtn/);

  assert.match(js, /let activeDomainFilter = "all";/);
  assert.match(js, /let activeStatusFilter = "all";/);
  assert.match(js, /let mvpdGateOpen\s+=\s+false;/);
  assert.match(js, /let safeDomains\s+=\s+\[\];/);
  assert.match(js, /let pendingCallListAnchor = false;/);
  assert.match(js, /function renderDomainFilters\(\)/);
  assert.match(js, /function renderStatusFilters\(\)/);
  assert.match(js, /function buildStatusFilters\(\)/);
  assert.match(js, /function getDomainScopedEntries\(\)/);
  assert.match(js, /function getSelectedEntry\(\)/);
  assert.match(js, /function getSelectionAnchorEntry\(filtered = \[\]\)/);
  assert.match(js, /function anchorCallListToSelection\(listEl, filtered = \[\], selectedVisible = false\)/);
  assert.match(js, /function dedupeHarpoDomainBuckets\(domains = \[\]\)/);
  assert.match(js, /function matchesHarpoDomainList\(hostname = "", domains = \[\]\)/);
  assert.match(js, /function extractSamlMvpdDomains\(entry\)/);
  assert.match(js, /async function buildRequestContentsBody\(entry\)/);
  assert.match(js, /function buildPayloadViewer\(\{/);
  assert.match(js, /function getDecodedPayloadText\(\{/);
  assert.match(js, /function extractHtmlFormPairs\(text = ""\)/);
  assert.match(js, /function extractPayloadFieldPairs\(text = "", contentType = ""\)/);
  assert.match(js, /async function decodeSamlValue\(fieldName = "", rawValue = ""\)/);
  assert.match(js, /async function buildSamlInspectorMarkup\(\{/);
  assert.match(js, /function buildAdobePassAnalysisCard\(entry, classification\)/);
  assert.match(js, /function buildSupportStatusListLead\(pass\)/);
  assert.match(js, /Request Contents/);
  assert.match(js, /Response Body/);
  assert.match(js, /Adobe Pass Analysis/);
  assert.match(js, /SAML Inspector/);
  assert.match(js, /Original Value/);
  assert.match(js, /Supporting Fields/);
  assert.match(js, /Decoded XML/);
  assert.match(js, /SUPPORTED/);
  assert.match(js, /UNSUPPORTED LEGACY V1/);
  assert.match(js, /REST V2 migration/);
  assert.match(js, /content\?\.comment/);
  assert.match(js, /const domainBucket = getHarpoTrafficDomainBucket\(hostname\);/);
  assert.match(js, /const sharedDecodeHelpers = globalThis\.AdobePassDecodeHelpers \|\| \{\};/);
  assert.match(js, /let mvpdDomains\s+=\s+dedupeHarpoDomainBuckets\(rawHarPayload\?\.mvpdDomains \|\| \[\]\);/);
  assert.match(js, /const samlMvpdDomains = extractSamlMvpdDomains\(entry\);/);
  assert.match(js, /isHarpoPassSamlAssertionConsumer\(url\)/);
  assert.match(js, /samlMvpdDomains\.length > 0/);
  assert.match(js, /mvpdGateOpen = true;/);
  assert.match(js, /mvpdDomains = dedupeHarpoDomainBuckets\(\[\.\.\.mvpdDomains, \.\.\.samlMvpdDomains\]\);/);
  assert.match(js, /matchesHarpoDomainList\(hostname, mvpdDomains\)/);
  assert.match(js, /programmerDomains:\s*safeDomains,/);
  assert.match(js, /classifiedEntries\.forEach/);
  assert.match(js, /return classifiedEntries\.filter\(\(entry\) => activeDomainFilter === "all" \|\| entry\.domainBucket === activeDomainFilter\);/);
  assert.match(js, /if \(activeStatusFilter !== "all" && String\(status\) !== activeStatusFilter\) return false;/);
  assert.match(js, /const selectedEntry = getSelectedEntry\(\);/);
  assert.match(js, /pendingCallListAnchor = true;/);
  assert.match(js, /anchorEl\.scrollIntoView\(\{ block: selectedVisible \? "nearest" : "center" \}\);/);
  assert.match(js, /if \(selectedIndex === -1\) \{\s*renderEmptyDetail\("Select a call"/s);
  assert.match(js, /inflateBytes\(bytes, "deflate-raw"\)/);
  assert.match(js, /inflateBytes\(bytes, "deflate"\)/);
  assert.match(js, /sourceLabel:\s*"request query string"/);
  assert.match(js, /"response HTML form"/);
  assert.match(js, /void renderDetail\(c\);/);
  assert.match(js, /async function renderDetail\(\{ entry, classification, hostname \}\)/);
  assert.match(js, /detailRenderToken\s*\+=\s*1;/);
  assert.match(js, /responsePayload\.samlMarkup \|\| ""/);
  assert.match(js, /JWT Inspector/);
  assert.match(js, /Base64 Inspector/);
  assert.match(js, /buildJwtInspectorMarkup\(\{/);
  assert.match(js, /buildBase64InspectorMarkup\(\{/);
  assert.match(js, /select\.addEventListener\("change", \(\) => \{/);
  assert.match(js, /renderStatusFilters\(\);/);
  assert.match(js, /data-status-filter="\$\{escHtml\(filter\.key\)\}"/);
  assert.doesNotMatch(js, /harpo-filterPill-count/);
  assert.doesNotMatch(js, /function renderStats\(\)/);
  assert.doesNotMatch(js, /let activeFilter\s+=\s+"all";/);
  assert.doesNotMatch(js, /let programmerDomains\s+=\s+\[\];/);
  assert.doesNotMatch(js, /let showAllTraffic\s+=\s+true;/);
  assert.doesNotMatch(js, /function renderTrafficScopeToggle\(\)/);
  assert.doesNotMatch(js, /function getScopeFilteredEntries\(\)/);
  assert.doesNotMatch(js, /function renderPhaseNav\(\)/);
  assert.doesNotMatch(js, /The selected call is still open in the detail panel, but it is hidden by the current filters\./);
  assert.doesNotMatch(js, /The selected call is hidden by the current filters\. Clear or widen the filters to bring it back into the list\./);
  assert.doesNotMatch(js, /const visibleSelection = filtered\.some\(\(entry\) => entry\.idx === selectedIndex\);\s*if \(!visibleSelection\) \{\s*selectedIndex = -1;/s);
});

test("HARPO call list uses Spectrum-style striping and persistent error shading", () => {
  const css = fs.readFileSync(path.join(ROOT, "harpo.css"), "utf8");

  assert.match(css, /\.harpo-filterField,\s*\.harpo-statusFilters\s*\{[\s\S]*padding:\s*var\(--spectrum-spacing-100\)\s+var\(--spectrum-spacing-200\);/s);
  assert.match(css, /\.harpo-filterPicker\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*flex:\s*0 0 auto;[\s\S]*inline-size:\s*fit-content;[\s\S]*max-inline-size:\s*min\(100%,\s*32ch\);/s);
  assert.match(css, /\.harpo-filterSelect\s*\{[\s\S]*inline-size:\s*auto;[\s\S]*min-inline-size:\s*14ch;[\s\S]*max-inline-size:\s*min\(100%,\s*32ch\);/s);
  assert.doesNotMatch(css, /\.harpo-filterPicker\s*\{[^}]*width:\s*min\(340px,\s*100%\);/s);
  assert.doesNotMatch(css, /\.harpo-filterSelect\s*\{[^}]*width:\s*100%;/s);
  assert.match(css, /\.harpo-statusFilterPills\s*\{/);
  assert.match(css, /\.harpo-filterPill\s*\{/);
  assert.match(css, /\.harpo-filterPill--active\s*\{/);
  assert.doesNotMatch(css, /\.harpo-filterPill-count\s*\{/);
  assert.doesNotMatch(css, /\.harpo-trafficScope\s*\{/);
  assert.doesNotMatch(css, /\.harpo-trafficScopeCheckbox\s*\{/);
  assert.match(css, /\.harpo-callItem:nth-child\(even\)\s*\{/);
  assert.match(css, /--harpo-callItem-bg:\s*var\(--spectrum-gray-75,\s*var\(--spectrum-gray-100\)\)/);
  assert.match(css, /\.harpo-callItem--error\s*\{/);
  assert.match(css, /\.harpo-callItem--selected\s*\{[\s\S]*border-left-color:\s*var\(--spectrum-accent-color-800\);[\s\S]*box-shadow:\s*inset 0 0 0 1px var\(--spectrum-accent-color-400\);/s);
  assert.match(css, /\.harpo-callItem--selected:hover\s*\{/);
  assert.match(css, /--harpo-callItem-bg:\s*var\(--spectrum-negative-color-100\)/);
  assert.match(css, /border-left-color:\s*var\(--spectrum-negative-color-700\)/);
  assert.match(css, /\.harpo-callItem--selected\.harpo-callItem--error\s*\{/);
  assert.match(css, /--harpo-callItem-bg:\s*var\(--spectrum-negative-color-200\)/);
  assert.match(css, /\.harpo-analysisBadgeRow\s*\{/);
  assert.match(css, /\.harpo-migrationBox\s*\{/);
  assert.match(css, /\.harpo-docLink\s*\{/);
  assert.match(css, /\.harpo-inlineLink\s*\{/);
  assert.match(css, /\.harpo-detailSubsection\s*\+\s*\.harpo-detailSubsection\s*\{/);
  assert.match(css, /\.harpo-payloadMeta\s*\{/);
  assert.match(css, /\.harpo-bodyViewer--xml\s*\{/);
  assert.match(css, /\.harpo-samlMessages\s*\{/);
  assert.match(css, /\.harpo-samlMessage\s*\{/);
  assert.match(css, /\.harpo-samlDecodeMethod\s*\{/);
  assert.match(css, /\.harpo-samlLabel\s*\{/);
  assert.match(css, /\.harpo-phase--Pass\s*\{/);
});

test("HARPO ships the shared Adobe Pass decoder helper for JWT, Base64, and SAML", () => {
  const helperSource = fs.readFileSync(path.join(ROOT, "adobe-pass-decode-helpers.js"), "utf8");

  assert.match(helperSource, /AdobePassDecodeHelpers/);
  assert.match(helperSource, /function decodeJwtToken\(token = ""\)/);
  assert.match(helperSource, /function inspectBase64Value\(rawInput = ""\)/);
  assert.match(helperSource, /async function decodeSamlValue\(fieldName = "", rawValue = ""\)/);
  assert.match(helperSource, /async function extractSamlMatches\(\{/);
  assert.match(helperSource, /function extractJwtMatches\(\{/);
  assert.match(helperSource, /function extractBase64Matches\(\{/);
  assert.match(helperSource, /module\.exports = helpers/);
});

test("HARPO recorder preserves response body encoding metadata for later inspection", () => {
  const backgroundSource = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");

  assert.match(backgroundSource, /encoding:\s*result\.base64Encoded \? "base64" : ""/);
  assert.match(backgroundSource, /content:\s*\{[\s\S]*encoding[\s\S]*comment/s);
  assert.match(backgroundSource, /requestContentType/);
  assert.match(backgroundSource, /bodyPromise/);
  assert.match(backgroundSource, /params\.redirectResponse/);
  assert.match(backgroundSource, /harpoNormalizeResponseRecord/);
  assert.match(backgroundSource, /function harpoMergeHeaders\(existingHeaders = \[\], nextHeaders = \[\]\)/);
  assert.match(backgroundSource, /function harpoMergeResponseRecord\(existingResponse = null, nextResponse = null\)/);
  assert.match(backgroundSource, /function harpoMatchesDomainList\(url, domains = \[\]\)/);
  assert.match(backgroundSource, /isHarpoPhysicalAssetTraffic/);
  assert.match(backgroundSource, /function harpoShouldPersistEntry\(entry, captureSession = createHarpoCaptureSession\(\)\)/);
  assert.match(backgroundSource, /rootTabId:\s+null,/);
  assert.match(backgroundSource, /tabIds:\s+new Set\(\),/);
  assert.match(backgroundSource, /pendingRequestExtras:\s+new Map\(\),/);
  assert.match(backgroundSource, /observedRequests:\s+new Map\(\),/);
  assert.match(backgroundSource, /completedObservedRequests:\s+new Map\(\),/);
  assert.match(backgroundSource, /function harpoBuildRequestKey\(tabId, requestId\)/);
  assert.match(backgroundSource, /function harpoBuildObservedBodyPromise\(request = null, debuggeeId = 0, requestId = ""\)/);
  assert.match(backgroundSource, /function harpoFinalizeCapturedRequest\(requestKey,/);
  assert.match(backgroundSource, /function harpoPromoteObservedRequest\(requestKey\)/);
  assert.match(backgroundSource, /function harpoPromoteObservedRequests\(\)/);
  assert.match(backgroundSource, /function harpoAttachDebuggerToTab\(tabId\)/);
  assert.match(backgroundSource, /function harpoHandleTrackedTabCreated\(tab\)/);
  assert.match(backgroundSource, /function harpoHandleCreatedNavigationTarget\(details\)/);
  assert.match(backgroundSource, /captureSession:\s+createHarpoCaptureSession\(\)/);
  assert.match(backgroundSource, /programmerDomains:\s+\[\],/);
  assert.match(backgroundSource, /if \(params\.redirectResponse\) \{\s*harpoState\.captureSession = updateHarpoCaptureSessionFromResponse\(/s);
  assert.match(backgroundSource, /harpoState\.captureSession = updateHarpoCaptureSessionFromRequest\(/);
  assert.match(backgroundSource, /const captureDecision = evaluateHarpoCaptureSession\(harpoState\.captureSession, url,\s*\{/);
  assert.match(backgroundSource, /case "Network\.requestWillBeSentExtraInfo": \{/);
  assert.match(backgroundSource, /const observedRequest = harpoState\.observedRequests\.get\(requestKey\)/);
  assert.match(backgroundSource, /harpoPromoteObservedRequests\(\)/);
  assert.match(backgroundSource, /harpoState\.pendingRequests\.set\(requestKey, observedRequest\)/);
  assert.match(backgroundSource, /case "Network\.responseReceivedExtraInfo": \{/);
  assert.match(backgroundSource, /headers:\s*params\.headers,\s*status:\s*params\.statusCode/s);
  assert.match(backgroundSource, /const observedRequest = harpoState\.observedRequests\.get\(requestKey\)/);
  assert.match(backgroundSource, /pendingRequest\?\.url \|\| observedRequest\?\.url \|\| ""/);
  assert.match(backgroundSource, /const requestKey = harpoBuildRequestKey\(tabId, params\.requestId\)/);
  assert.match(backgroundSource, /if \(!pendingRequest && !harpoState\.observedRequests\.has\(requestKey\)\) break/);
  assert.match(backgroundSource, /harpoState\.completedObservedRequests\.set\(requestKey,/);
  assert.match(backgroundSource, /chrome\.tabs\.onCreated\.addListener\(harpoHandleTrackedTabCreated\)/);
  assert.match(backgroundSource, /chrome\.webNavigation\.onCreatedNavigationTarget\.addListener\(harpoHandleCreatedNavigationTarget\)/);
  assert.match(backgroundSource, /redirectURL:\s*redirectUrl,/);
  assert.match(backgroundSource, /harpoMergeResponseRecord\(\s*harpoState\.pendingResponses\.get\(requestKey\),\s*harpoNormalizeResponseRecord\(params\.response, params\.timestamp\)\s*\)/s);
  assert.match(backgroundSource, /if \(!captureDecision\.allowCapture\) \{/);
  assert.match(backgroundSource, /if \(captureDecision\.physicalAssetTraffic\) \{/);
  assert.match(backgroundSource, /if \(captureDecision\.logoutTraffic && !captureDecision\.nextSession\.externalTrafficWindowOpen\) \{/);
  assert.match(backgroundSource, /if \(captureDecision\.returnedToProgrammerDomain && captureDecision\.nextSession\.logoutDetected\) \{/);
  assert.match(backgroundSource, /harpoRequestAutoStop\(\)/);
  assert.match(backgroundSource, /harpoBuildHar\(captureSession = createHarpoCaptureSession\(\)\)/);
  assert.match(backgroundSource, /\.filter\(\(entry\) => harpoShouldPersistEntry\(entry, captureSession\)\)/);
  assert.match(backgroundSource, /safeDomains:\s*harpoState\.safeDomains/);
  assert.match(backgroundSource, /programmerDomains:\s*harpoState\.programmerDomains/);
  assert.match(backgroundSource, /mvpdDomains:\s*Array\.isArray\(harpoState\.captureSession\?\.mvpdDomains\)/);
  assert.match(backgroundSource, /Array\.isArray\(message\?\.safeDomains\)/);
  assert.match(backgroundSource, /Array\.isArray\(message\?\.programmerDomains\)/);
});
