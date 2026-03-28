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
  assert.match(js, /function renderDomainFilters\(\)/);
  assert.match(js, /function renderStatusFilters\(\)/);
  assert.match(js, /function buildStatusFilters\(\)/);
  assert.match(js, /function getDomainScopedEntries\(\)/);
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
  assert.match(js, /classification\?\.domain === "pass" && classification\.phase === "AuthN"/);
  assert.match(js, /mvpdGateOpen = true;/);
  assert.match(js, /getDomainScopedEntries\(\)\.forEach/);
  assert.match(js, /if \(activeDomainFilter !== "all" && c\.domainBucket !== activeDomainFilter\) return false;/);
  assert.match(js, /if \(activeStatusFilter !== "all" && String\(status\) !== activeStatusFilter\) return false;/);
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
  assert.doesNotMatch(js, /function renderPhaseNav\(\)/);
});

test("HARPO call list uses Spectrum-style striping and persistent error shading", () => {
  const css = fs.readFileSync(path.join(ROOT, "harpo.css"), "utf8");

  assert.match(css, /\.harpo-statusFilterPills\s*\{/);
  assert.match(css, /\.harpo-filterPill\s*\{/);
  assert.match(css, /\.harpo-filterPill--active\s*\{/);
  assert.doesNotMatch(css, /\.harpo-filterPill-count\s*\{/);
  assert.match(css, /\.harpo-callItem:nth-child\(even\)\s*\{/);
  assert.match(css, /--harpo-callItem-bg:\s*var\(--spectrum-gray-75,\s*var\(--spectrum-gray-100\)\)/);
  assert.match(css, /\.harpo-callItem--error\s*\{/);
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
});
