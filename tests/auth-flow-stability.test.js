const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

test("manifest does not pin an extension key", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

  assert.equal(Object.prototype.hasOwnProperty.call(manifest, "key"), false);
});

test("interactive auth keeps popup monitoring for browser redirects", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const hydrationSectionMatch = appSource.match(
    /async function attemptSessionHydration\([\s\S]*?\n}\n\nfunction requireConfiguredClientId/
  );

  assert.ok(hydrationSectionMatch, "attemptSessionHydration should exist");
  const hydrationSection = hydrationSectionMatch[0];

  assert.match(hydrationSection, /transport:\s*interactive \? "browser-popup-monitor" : "chrome\.identity\.launchWebAuthFlow"/);
  assert.match(hydrationSection, /callbackUrl = await launchInteractiveAuthPopup\(/);
  assert.match(hydrationSection, /callbackUrl = await chrome\.identity\.launchWebAuthFlow\(launchDetails\);/);
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
