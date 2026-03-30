const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const {
  proxymanFixtures,
  buildFixtureHarBundle
} = require("./fixtures/harpo-proxyman-fixtures.js");

async function loadHarpoModules() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harpo-proxyman-fixtures-"));
  const trafficSourcePath = path.join(ROOT, "harpo-traffic.js");
  const platformSourcePath = path.join(ROOT, "harpo-platform.js");
  const tempTrafficPath = path.join(tempDir, "harpo-traffic.mjs");
  const tempPlatformPath = path.join(tempDir, "harpo-platform.mjs");
  fs.copyFileSync(trafficSourcePath, tempTrafficPath);
  fs.copyFileSync(platformSourcePath, tempPlatformPath);
  const [traffic, platform] = await Promise.all([
    import(pathToFileURL(tempTrafficPath).href),
    import(pathToFileURL(tempPlatformPath).href)
  ]);
  return { traffic, platform };
}

test("HARPO Proxyman fixture pack classifies representative Adobe Pass flows across platforms", async () => {
  const { traffic } = await loadHarpoModules();

  proxymanFixtures.forEach((fixture) => {
    const classification = traffic.classifyHarpoEntry(fixture.entry, fixture.classifyOptions);
    assert.ok(classification, `${fixture.id} should classify`);
    assert.equal(classification.phase, fixture.expected.phase, `${fixture.id} phase mismatch`);
    assert.equal(classification.pass.family, fixture.expected.family, `${fixture.id} family mismatch`);
    assert.equal(classification.pass.endpointId, fixture.expected.endpointId, `${fixture.id} endpoint mismatch`);
  });
});

test("HARPO Proxyman fixture pack drives client platform inference for support analysis", async () => {
  const { platform } = await loadHarpoModules();

  proxymanFixtures.forEach((fixture) => {
    const inferredPlatform = platform.inferHarpoClientPlatform(fixture.platformArgs);
    assert.equal(inferredPlatform.label, fixture.platform, `${fixture.id} platform mismatch`);
    assert.ok(Array.isArray(inferredPlatform.evidence), `${fixture.id} should return evidence`);
  });
});

test("HARPO Proxyman fixture bundle builds a reusable uploaded-HAR style payload", () => {
  const bundle = buildFixtureHarBundle([
    "electron-dcr-register",
    "android-rest-v2-sessions-create",
    "system-saml-assertion-consumer-xfinity"
  ]);

  assert.equal(bundle.fileName, "harpo-proxyman-fixture-pack.har");
  assert.equal(bundle.programmerName, "HARPO Proxyman");
  assert.deepEqual(bundle.mvpdDomains, ["xfinity.com", "bell.ca"]);
  assert.equal(bundle.har.log.creator.name, "HARPO Proxyman Fixture Pack");
  assert.equal(bundle.har.log.entries.length, 3);
  assert.equal(bundle.har.log.entries[0].request.url, "https://api.auth.adobe.com/o/client/register");
  assert.equal(bundle.har.log.entries[1].request.url, "https://api.auth.adobe.com/api/v2/nbc/sessions");
  assert.equal(bundle.har.log.entries[2].request.url, "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer");
});
