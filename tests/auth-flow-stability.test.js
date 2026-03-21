const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DISTRO_MANIFEST_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4ggRrOiQdavkh68HgTSj/bSdfBx2OtHqAKWA9iEeCua5/oEQ9I8to7L+Rx5rzFHEFYP62MtAyUBvIrssFeiWrYN1UPO1tQKScTSbzgm2axbtdPLs9emkRv2QeKDECROnzijV4M/48YV6u1VCXYYUU8cTyV5TwwxvtEV/4BSooFdv2NhMxeRJjUOeOLtB8vGPNM567i6WMYX86iVuuBzTRNfQEoDnKBCzjSCgXE/ncMGT26aqP0PwhjBwbUDjk5JEgYXrbsqlO4MD8mAUXT+DSdHH6F2HMCO9DC7jmuRJetgBbMYh6SBsEmjm73MPf/paG0FJtSPcKejv6hOD79vORQIDAQAB";

test("manifest pins the stable extension key", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

  assert.equal(manifest.key, DISTRO_MANIFEST_KEY);
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
