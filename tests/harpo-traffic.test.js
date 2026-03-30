const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");

async function loadHarpoTrafficHelpers() {
  const sourcePath = path.join(ROOT, "harpo-traffic.js");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harpo-traffic-"));
  const tempModulePath = path.join(tempDir, "harpo-traffic.mjs");
  fs.copyFileSync(sourcePath, tempModulePath);
  return import(pathToFileURL(tempModulePath).href);
}

test("HARPO classifies api.auth.adobe.com REST V2 traffic as PASS", async () => {
  const helpers = await loadHarpoTrafficHelpers();
  const entry = {
    request: {
      method: "GET",
      url: "https://api.auth.adobe.com/api/v2/requestor/configuration"
    },
    _resourceType: "Fetch"
  };

  const classification = helpers.classifyHarpoEntry(entry, {
    adobeGateOpen: true,
    passGateOpen: true
  });

  assert.equal(classification.phase, "Config");
  assert.equal(classification.label, "Get Configuration");
  assert.equal(classification.domain, "pass");
  assert.equal(classification.pass.family, "rest-v2");
  assert.equal(classification.pass.endpointId, "rest-v2-configuration");
  assert.equal(classification.pass.params.serviceProvider, "requestor");
  assert.match(classification.pass.docs[0].url, /(developer|experienceleague)\.adobe\.com/);
});

test("HARPO recognizes official REST V2 partner SSO endpoints from the Adobe Pass spec", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  const sessionPartnerClassification = helpers.classifyHarpoEntry({
    request: {
      method: "POST",
      url: "https://api.auth.adobe.com/api/v2/turner/sessions/sso/Apple"
    },
    _resourceType: "Fetch"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });

  assert.equal(sessionPartnerClassification.phase, "AuthN");
  assert.equal(sessionPartnerClassification.label, "Retrieve Partner Authentication Request");
  assert.equal(sessionPartnerClassification.pass.endpointId, "rest-v2-sessions-partner");
  assert.equal(sessionPartnerClassification.pass.params.serviceProvider, "turner");
  assert.equal(sessionPartnerClassification.pass.params.partner, "Apple");
  assert.match(sessionPartnerClassification.pass.docs.map((doc) => doc.url).join("\n"), /single-sign-on-partner-flows|apple-sso-cookbook-rest-api-v2/);

  const profilePartnerClassification = helpers.classifyHarpoEntry({
    request: {
      method: "POST",
      url: "https://api.auth.adobe.com/api/v2/turner/profiles/sso/Apple"
    },
    _resourceType: "Fetch"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });

  assert.equal(profilePartnerClassification.phase, "Profiles");
  assert.equal(profilePartnerClassification.label, "Retrieve Profile Using Partner Response");
  assert.equal(profilePartnerClassification.pass.endpointId, "rest-v2-profiles-partner");
  assert.equal(profilePartnerClassification.pass.params.serviceProvider, "turner");
  assert.equal(profilePartnerClassification.pass.params.partner, "Apple");
});

test("HARPO treats Adobe Pass console and management APIs as PASS domain traffic", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  const consoleClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://console.auth.adobe.com/rest/api/entity/Programmer"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });
  assert.equal(consoleClassification.domain, "pass");
  assert.equal(consoleClassification.phase, "Pass");
  assert.equal(consoleClassification.label, "Adobe Pass Console API");

  const esmClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://mgmt.auth.adobe.com/esm/v3/media-company/year/month/day"
    },
    _resourceType: "Fetch"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });
  assert.equal(esmClassification.domain, "pass");
  assert.equal(esmClassification.phase, "Pass");
  assert.equal(esmClassification.label, "Adobe Pass ESM API");
});

test("HARPO recognizes services.adobe.com IMS checks as IMS traffic", async () => {
  const helpers = await loadHarpoTrafficHelpers();
  const classification = helpers.classifyHarpoEntry({
    request: {
      method: "POST",
      url: "https://adobeid-na1.services.adobe.com/ims/check/v6/token"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });

  assert.equal(classification.phase, "IMS");
  assert.equal(classification.label, "Adobe IMS Auth");
  assert.equal(classification.domain, "ims");
});

test("HARPO flags legacy Adobe Pass endpoints and exposes REST V2 migration guidance", async () => {
  const helpers = await loadHarpoTrafficHelpers();
  const classification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://api.auth.adobe.com/api/v1/checkauthn/ABC123"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });

  assert.equal(classification.phase, "AuthN");
  assert.equal(classification.domain, "pass");
  assert.equal(classification.pass.family, "legacy-v1");
  assert.equal(classification.pass.endpointId, "legacy-v1-checkauthn-code");
  assert.equal(classification.pass.support.status, "legacy");
  assert.equal(classification.pass.migration.title, "REST V2 migration");
  assert.equal(classification.pass.migration.replacementCalls[0].path, "/api/v2/{serviceProvider}/profiles/code/ABC123");
  assert.match(classification.pass.docs.map((doc) => doc.url).join("\n"), /rest-api-v2-faqs#authentication-phase-v1-to-v2-faq1/);
  assert.match(String(classification.pass.migration.observations?.[0] || ""), /authentication code/i);
});

test("HARPO treats AccessEnabler JavaScript as legacy migration-required traffic", async () => {
  const helpers = await loadHarpoTrafficHelpers();
  const classification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://entitlement.auth.adobe.com/entitlement/v4/AccessEnabler.js"
    },
    _resourceType: "Script"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });

  assert.equal(classification.domain, "pass");
  assert.equal(classification.phase, "Pass");
  assert.equal(classification.pass.family, "legacy-v1");
  assert.equal(classification.pass.endpointId, "legacy-accessenabler-js");
  assert.equal(classification.pass.support.status, "legacy");
});

test("HARPO does not misclassify Adobe support hosts as MVPD traffic", async () => {
  const helpers = await loadHarpoTrafficHelpers();
  const classification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://assets.adobedtm.com/launch-EN1234567890.min.js"
    },
    _resourceType: "Script"
  }, {
    adobeGateOpen: true,
    passGateOpen: true,
    mvpdGateOpen: true
  });

  assert.equal(classification.phase, "Other");
  assert.equal(classification.domain, "adobe");
  assert.equal(classification.label, "Adobe Supporting Traffic");
});

test("HARPO only labels SAML-seeded external domains as MVPD traffic", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  const mvpdClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://identity1.dishnetwork.com/nidp/saml2/sso?id=123"
    },
    _resourceType: "Document"
  }, {
    adobeGateOpen: true,
    passGateOpen: true,
    mvpdGateOpen: true,
    mvpdDomains: ["identity1.dishnetwork.com"]
  });
  assert.equal(mvpdClassification.phase, "MVPD");
  assert.equal(mvpdClassification.domain, "mvpd");

  const externalNoiseClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://fonts.gstatic.com/s/roboto/v30/roboto.woff2"
    },
    _resourceType: "Font"
  }, {
    adobeGateOpen: true,
    passGateOpen: true,
    mvpdGateOpen: true,
    mvpdDomains: ["identity1.dishnetwork.com"]
  });
  assert.equal(externalNoiseClassification, null);
});

test("HARPO drops physical asset entries even when they sit on programmer or MVPD hosts", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  const programmerAssetClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://www.aetv.com/assets/provider-logo.png"
    },
    response: {
      headers: [{ name: "content-type", value: "image/png" }],
      content: { mimeType: "image/png" }
    },
    _resourceType: "Image"
  }, {
    adobeGateOpen: true,
    passGateOpen: true,
    programmerDomains: ["aetv.com"]
  });
  assert.equal(programmerAssetClassification, null);

  const mvpdAssetClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://identity.directv.com/fonts/provider.woff2"
    },
    response: {
      headers: [{ name: "content-type", value: "font/woff2" }],
      content: { mimeType: "font/woff2" }
    },
    _resourceType: "Font"
  }, {
    adobeGateOpen: true,
    passGateOpen: true,
    mvpdGateOpen: true,
    mvpdDomains: ["directv.com"]
  });
  assert.equal(mvpdAssetClassification, null);

  const stylesheetClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://identity.directv.com/auth/app.css"
    },
    response: {
      headers: [{ name: "content-type", value: "text/css" }],
      content: { mimeType: "text/css" }
    },
    _resourceType: "Stylesheet"
  }, {
    adobeGateOpen: true,
    passGateOpen: true,
    mvpdGateOpen: true,
    mvpdDomains: ["directv.com"]
  });
  assert.equal(stylesheetClassification, null);
});

test("HARPO treats sp.auth host bootstrap endpoints as legacy rather than modern DCR or REST V2", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  const registerClassification = helpers.classifyHarpoEntry({
    request: {
      method: "POST",
      url: "https://sp.auth.adobe.com/o/client/register"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });
  assert.equal(registerClassification.pass.family, "legacy-v1");
  assert.equal(registerClassification.pass.endpointId, "legacy-sp-client-register");
  assert.match(registerClassification.pass.migration.replacementCalls[0].doc.url, /dcr_api\/interactive/);

  const tokenClassification = helpers.classifyHarpoEntry({
    request: {
      method: "POST",
      url: "https://sp.auth.adobe.com/o/client/token"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });
  assert.equal(tokenClassification.pass.family, "legacy-v1");
  assert.equal(tokenClassification.pass.endpointId, "legacy-sp-client-token");

  const configClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://sp.auth.adobe.com/adobe-services/config/CBS_SPORTS"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });
  assert.equal(configClassification.pass.family, "legacy-v1");
  assert.equal(configClassification.pass.endpointId, "legacy-sp-config");
  assert.equal(configClassification.pass.params.requestorId, "CBS_SPORTS");

  assert.equal(helpers.isHarpoPassSessionTrigger("https://sp.auth.adobe.com/o/client/register"), true);
  assert.equal(helpers.isHarpoPassSessionTrigger("https://api.auth.adobe.com/o/client/register"), false);
  assert.equal(helpers.isHarpoLogoutTraffic("https://api.auth.adobe.com/api/v2/turner/logout/DISH"), true);
  assert.equal(helpers.isHarpoLogoutTraffic("https://api.auth.adobe.com/api/v2/turner/configuration"), false);
});

test("HARPO maps legacy sp.auth regcode and indiv device calls to legacy migration guidance", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  const regcodeClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://sp.auth.adobe.com/reggie/v1/CBS_SPORTS/regcode"
    },
    _resourceType: "Document"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });
  assert.equal(regcodeClassification.pass.family, "legacy-v1");
  assert.equal(regcodeClassification.pass.endpointId, "legacy-sp-regcode");
  assert.equal(regcodeClassification.pass.migration.replacementCalls[0].path, "/api/v2/{serviceProvider}/sessions");
  assert.equal(regcodeClassification.pass.migration.replacementCalls[1].path, "/api/v2/{serviceProvider}/sessions/{code}");
  assert.match(regcodeClassification.pass.docs.map((doc) => doc.url).join("\n"), /rest-api-v2-faqs#authentication-phase-v1-to-v2-faq1/);

  const indivClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://sp.auth.adobe.com/indiv/devices"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });
  assert.equal(indivClassification.pass.family, "legacy-v1");
  assert.equal(indivClassification.pass.endpointId, "legacy-sp-indiv-devices");
  assert.match(indivClassification.pass.migration.replacementCalls[0].doc.url, /sso-service/);
});

test("HARPO treats sp.auth adobe-services session as legacy session plumbing with REST V2 session correlation", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  const classification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://sp.auth.adobe.com/adobe-services/session"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });

  assert.equal(classification.pass.family, "legacy-v1");
  assert.equal(classification.pass.endpointId, "legacy-sp-session");
  assert.equal(classification.pass.support.status, "legacy");
  assert.equal(classification.pass.migration.replacementCalls[0].path, "/api/v2/{serviceProvider}/sessions/{code}");
  assert.equal(classification.pass.migration.replacementCalls[1].path, "/api/v2/{serviceProvider}/sessions/{code}");
  assert.match(classification.pass.docs.map((doc) => doc.url).join("\n"), /rest-api-v2-faqs#authentication-phase-v1-to-v2-faq1/);
});

test("HARPO does not mark unmatched Adobe Pass endpoints as supported 2026 REST V2 calls", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  const classification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://sp.auth.adobe.com/adobe-services/session-status-helper"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });

  assert.equal(classification.pass.endpointId, "pass-generic");
  assert.equal(classification.pass.support.status, "adjacent");
  assert.match(String(classification.pass.support.note || ""), /does not match a supported 2026 DCR or REST API V2 endpoint/i);
});

test("HARPO legacy configuration and authorization mappings use Adobe's published V1 to V2 FAQ links", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  const configClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://api.auth.adobe.com/api/v1/config/CBS_SPORTS"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });
  assert.match(configClassification.pass.docs.map((doc) => doc.url).join("\n"), /rest-api-v2-faqs#configuration-phase-v1-to-v2-faq1/);
  assert.match(String(configClassification.pass.migration.observations?.[0] || ""), /service-provider scoped/i);

  const authzClassification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://api.auth.adobe.com/api/v1/tokens/authz"
    },
    _resourceType: "XHR"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });
  assert.match(authzClassification.pass.docs.map((doc) => doc.url).join("\n"), /rest-api-v2-faqs#authorization-phase-v1-to-v2-faq1/);
  assert.match(String(authzClassification.pass.migration.observations?.[0] || ""), /authorize decision/i);
});

test("HARPO treats sp.auth SAMLAssertionConsumer as an Adobe Pass system call", async () => {
  const helpers = await loadHarpoTrafficHelpers();

  const classification = helpers.classifyHarpoEntry({
    request: {
      method: "POST",
      url: "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer"
    },
    _resourceType: "Document"
  }, {
    adobeGateOpen: true,
    passGateOpen: true,
    mvpdGateOpen: true
  });

  assert.equal(classification.phase, "SSO");
  assert.equal(classification.pass.family, "pass-system");
  assert.equal(classification.pass.endpointId, "system-sp-saml-assertion-consumer");
  assert.equal(classification.pass.support.status, "system");
  assert.equal(classification.pass.migration, null);
  assert.match(String(classification.pass.notes[2] || ""), /does not have a direct one-call REST API V2 replacement/i);
});

test("HARPO drops known Adobe analytics noise before generic Adobe classification", async () => {
  const helpers = await loadHarpoTrafficHelpers();
  const classification = helpers.classifyHarpoEntry({
    request: {
      method: "GET",
      url: "https://sstats.adobe.com/metrics"
    },
    _resourceType: "Fetch"
  }, {
    adobeGateOpen: true,
    passGateOpen: true
  });

  assert.equal(classification, null);
});

test("HARPO consumers use the shared traffic helper module", () => {
  const harpoSource = fs.readFileSync(path.join(ROOT, "harpo.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");

  assert.match(harpoSource, /import\s*\{\s*classifyHarpoEntry,\s*getHarpoTrafficDomainBucket,\s*getHarpoTrafficHostname,\s*isHarpoAdobeTraffic,\s*isHarpoPassSamlAssertionConsumer,\s*isHarpoPassTraffic\s*\}\s*from "\.\/harpo-traffic\.js";/);
  assert.match(harpoSource, /const classification = classifyHarpoEntry\(entry, \{/);
  assert.match(harpoSource, /const hostname = getHarpoTrafficHostname\(url\);/);
  assert.match(harpoSource, /const domainBucket = getHarpoTrafficDomainBucket\(hostname\);/);
  assert.match(
    backgroundSource,
    /import\s*\{\s*createHarpoCaptureSession,\s*deriveHarpoProgrammerDomains,\s*evaluateHarpoCaptureSession,\s*shouldPersistHarpoCapturedEntry,\s*updateHarpoCaptureSessionFromRequest,\s*updateHarpoCaptureSessionFromResponse\s*\}\s*from "\.\/harpo-capture\.js"/
  );
  assert.match(harpoSource, /reqHeaders\["x-device-info"\]/);
  assert.match(harpoSource, /reqHeaders\["user-agent"\]/);
  assert.match(harpoSource, /reqHeaders\["ad-service-token"\]/);
  assert.match(harpoSource, /reqHeaders\["adobe-subject-token"\]/);
  assert.match(harpoSource, /reqHeaders\["ap-partner-framework-status"\]/);
  assert.match(harpoSource, /reqHeaders\["x-roku-reserved-roku-connect-token"\]/);
  assert.match(harpoSource, /responseJson\.actionType/);
  assert.match(harpoSource, /responseJson\.missingParameters/);
  assert.match(harpoSource, /responseJson\.authenticationRequest/);
  assert.match(harpoSource, /responseJson\.isTempPass/);
  assert.match(harpoSource, /responseJson\.profiles/);
  assert.match(harpoSource, /responseJson\.logouts/);
});
