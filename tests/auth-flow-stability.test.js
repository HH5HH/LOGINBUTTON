const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

test("manifest includes a stable extension key for chromiumapp redirects", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

  assert.equal(typeof manifest.key, "string");
  assert.ok(manifest.key.startsWith("MIIB"));
  assert.ok(manifest.key.length > 100);
});

test("interactive auth uses chrome.identity.launchWebAuthFlow instead of popup monitoring", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const hydrationSectionMatch = appSource.match(
    /async function attemptSessionHydration\([\s\S]*?\n}\n\nfunction requireConfiguredClientId/
  );

  assert.ok(hydrationSectionMatch, "attemptSessionHydration should exist");
  const hydrationSection = hydrationSectionMatch[0];

  assert.match(hydrationSection, /transport:\s*"chrome\.identity\.launchWebAuthFlow"/);
  assert.match(hydrationSection, /callbackUrl = await chrome\.identity\.launchWebAuthFlow\(launchDetails\);/);
  assert.doesNotMatch(hydrationSection, /launchInteractiveAuthPopup\(/);
});

test("scope planning keeps the ZIP.KEY scope unchanged", () => {
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const scopeSectionMatch = appSource.match(
    /function buildPreferredRequestedScope\([\s\S]*?\n}\n\nfunction shouldRetryWithConfiguredScope/
  );

  assert.ok(scopeSectionMatch, "scope planning helpers should exist");
  const scopeSection = scopeSectionMatch[0];

  assert.match(scopeSection, /return normalizedConfiguredScope;/);
  assert.doesNotMatch(scopeSection, /\$\{normalizedConfiguredScope\}\s+\$\{IMS_ORG_DISCOVERY_SCOPE\}/);
  assert.doesNotMatch(scopeSection, /new Set\(\[preferredScope, normalizedConfiguredScope\]\)/);
});
