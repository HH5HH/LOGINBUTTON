const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");

async function loadHarpoCaptureHelpers() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harpo-capture-"));
  const captureSourcePath = path.join(ROOT, "harpo-capture.js");
  const trafficSourcePath = path.join(ROOT, "harpo-traffic.js");
  const tempCapturePath = path.join(tempDir, "harpo-capture.mjs");
  const tempTrafficPath = path.join(tempDir, "harpo-traffic.js");
  fs.copyFileSync(captureSourcePath, tempCapturePath);
  fs.copyFileSync(trafficSourcePath, tempTrafficPath);
  return import(pathToFileURL(tempCapturePath).href);
}

test("HARPO seeds MVPD auth domains from Adobe SAMLAssertionConsumer request and response headers", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  let session = helpers.createHarpoCaptureSession({
    safeDomains: ["adobe.com", "cbs.com", "cbssports.com"]
  });

  session = helpers.updateHarpoCaptureSessionFromRequest(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      headers: [
        { name: "origin", value: "https://identity1.dishnetwork.com" },
        { name: "referer", value: "https://identity1.dishnetwork.com/login" }
      ]
    }
  );

  session = helpers.updateHarpoCaptureSessionFromResponse(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      status: 302,
      headers: [
        { name: "access-control-allow-origin", value: "https://identity1.dishnetwork.com" },
        { name: "location", value: "https://identity1.dishnetwork.com/nidp/saml2/sso?id=123" }
      ]
    }
  );

  assert.equal(session.adobeEngaged, true);
  assert.equal(session.externalTrafficWindowOpen, true);
  assert.deepEqual(session.mvpdDomains, ["dishnetwork.com"]);
});

test("HARPO capture window opens on SAMLAssertionConsumer and closes after return to programmer domain", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  let session = helpers.createHarpoCaptureSession({
    safeDomains: ["adobe.com", "turner.com", "trutv.com"]
  });

  let decision = helpers.evaluateHarpoCaptureSession(session, "https://www.turner.com/watch", {
    resourceType: "Document"
  });
  assert.equal(decision.allowCapture, true);
  assert.equal(decision.nextSession.adobeEngaged, false);
  assert.equal(decision.nextSession.externalTrafficWindowOpen, false);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(session, "https://sp.auth.adobe.com/o/client/register", {
    resourceType: "XHR"
  });
  assert.equal(decision.allowCapture, true);
  assert.equal(decision.passSessionTrigger, true);
  assert.equal(decision.nextSession.adobeEngaged, true);
  assert.equal(decision.nextSession.externalTrafficWindowOpen, false);
  assert.equal(decision.nextSession.externalTrafficObserved, false);
  session = decision.nextSession;

  session = helpers.updateHarpoCaptureSessionFromResponse(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      status: 302,
      headers: [
        { name: "access-control-allow-origin", value: "https://login.mvpd.example" }
      ]
    }
  );
  assert.equal(session.externalTrafficWindowOpen, true);

  decision = helpers.evaluateHarpoCaptureSession(session, "https://www.trutv.com/pass/bootstrap.js", {
    resourceType: "Fetch"
  });
  assert.equal(decision.allowCapture, true);
  assert.equal(decision.nextSession.externalTrafficWindowOpen, true);
  assert.equal(decision.nextSession.externalTrafficObserved, false);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(session, "https://login.mvpd.example/saml/login", {
    resourceType: "Document"
  });
  assert.equal(decision.allowCapture, true);
  assert.equal(decision.nextSession.externalTrafficWindowOpen, true);
  assert.equal(decision.nextSession.externalTrafficObserved, true);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(session, "https://cdn.mvpd.example/login.css", {
    resourceType: "Stylesheet"
  });
  assert.equal(decision.allowCapture, true);
  assert.equal(decision.nextSession.externalTrafficWindowOpen, true);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(session, "https://www.trutv.com/api/tvprovider/session", {
    resourceType: "Fetch"
  });
  assert.equal(decision.allowCapture, true);
  assert.equal(decision.returnedToProgrammerDomain, false);
  assert.equal(decision.nextSession.externalTrafficWindowOpen, true);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(session, "https://www.trutv.com/tvprovider/callback", {
    resourceType: "Document"
  });
  assert.equal(decision.allowCapture, true);
  assert.equal(decision.returnedToProgrammerDomain, true);
  assert.equal(decision.nextSession.externalTrafficWindowOpen, false);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(session, "https://cdn.mvpd.example/script.js", {
    resourceType: "Script"
  });
  assert.equal(decision.allowCapture, false);
});

test("HARPO only keeps external auth-flow traffic after Adobe engages", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  let session = helpers.createHarpoCaptureSession({
    safeDomains: ["adobe.com", "cbs.com", "cbssports.com"]
  });

  session = helpers.evaluateHarpoCaptureSession(session, "https://sp.auth.adobe.com/o/client/register", {
    resourceType: "XHR"
  }).nextSession;

  let decision = helpers.evaluateHarpoCaptureSession(session, "https://metrics.thirdparty.example/pixel", {
    resourceType: "Fetch"
  });
  assert.equal(decision.allowCapture, false);
  session = decision.nextSession;

  session = helpers.updateHarpoCaptureSessionFromResponse(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      status: 302,
      headers: [
        { name: "access-control-allow-origin", value: "https://login.mvpd.example" }
      ]
    }
  );

  decision = helpers.evaluateHarpoCaptureSession(session, "https://login.mvpd.example/sign-in", {
    resourceType: "Document"
  });
  assert.equal(decision.allowCapture, true);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(session, "https://login.mvpd.example/api/session", {
    resourceType: "XHR"
  });
  assert.equal(decision.allowCapture, true);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(session, "https://static.mvpd.example/app.js", {
    resourceType: "Script"
  });
  assert.equal(decision.allowCapture, true);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(session, "https://www.cbssports.com/tve/callback", {
    resourceType: "Document"
  });
  assert.equal(decision.allowCapture, true);
  assert.equal(decision.returnedToProgrammerDomain, true);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(session, "https://login.mvpd.example/api/post-return", {
    resourceType: "Fetch"
  });
  assert.equal(decision.allowCapture, false);
});

test("HARPO captures the first MVPD auth hop when Adobe SAML consumer seeds the provider domain", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  let session = helpers.createHarpoCaptureSession({
    safeDomains: ["adobe.com", "turner.com", "trutv.com"]
  });

  session = helpers.evaluateHarpoCaptureSession(session, "https://sp.auth.adobe.com/o/client/register", {
    resourceType: "XHR"
  }).nextSession;

  session = helpers.updateHarpoCaptureSessionFromResponse(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      status: 302,
      headers: [
        { name: "access-control-allow-origin", value: "https://identity1.dishnetwork.com" }
      ]
    }
  );

  let decision = helpers.evaluateHarpoCaptureSession(
    session,
    "https://identity1.dishnetwork.com/nidp/saml2/sso?id=abc",
    {
      resourceType: "Other"
    }
  );

  assert.equal(decision.externalAuthDomainHit, true);
  assert.equal(decision.allowCapture, true);
  assert.equal(decision.nextSession.externalTrafficObserved, true);
  assert.equal(decision.nextSession.externalTrafficWindowOpen, true);

  session = decision.nextSession;
  decision = helpers.evaluateHarpoCaptureSession(
    session,
    "https://identity1.dishnetwork.com/assets/login.js",
    {
      resourceType: "Script"
    }
  );

  assert.equal(decision.externalAuthDomainHit, true);
  assert.equal(decision.allowCapture, true);
});

test("HARPO seeds MVPD buckets from SAMLAssertionConsumer request headers", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  let session = helpers.createHarpoCaptureSession({
    safeDomains: ["adobe.com", "foxsports.com"]
  });

  session = helpers.updateHarpoCaptureSessionFromRequest(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      headers: [
        { name: "origin", value: "https://identity.directv.com" },
        { name: "referer", value: "https://identity.directv.com/" }
      ]
    }
  );

  assert.deepEqual(session.mvpdDomains, ["directv.com"]);
});

test("HARPO keeps same-chain MVPD assets when their document context is already in the auth redirect chain", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  let session = helpers.createHarpoCaptureSession({
    safeDomains: ["adobe.com", "foxsports.com"]
  });

  session = helpers.updateHarpoCaptureSessionFromResponse(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      status: 302,
      headers: [
        { name: "access-control-allow-origin", value: "https://identity.directv.com" }
      ]
    }
  );

  session = helpers.evaluateHarpoCaptureSession(
    session,
    "https://identity.directv.com/login",
    {
      resourceType: "Document"
    }
  ).nextSession;

  let decision = helpers.evaluateHarpoCaptureSession(
    session,
    "https://static.directv.com/auth/app.css",
    {
      resourceType: "Stylesheet",
      documentUrl: "https://identity.directv.com/login"
    }
  );

  assert.equal(decision.allowCapture, true);
  assert.equal(decision.nextSession.externalTrafficObserved, true);
  assert.deepEqual(decision.nextSession.mvpdDomains, [
    "directv.com"
  ]);
});

test("HARPO excludes physical asset traffic even while the MVPD auth window is open", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  let session = helpers.createHarpoCaptureSession({
    safeDomains: ["adobe.com", "aetv.com"]
  });

  session = helpers.updateHarpoCaptureSessionFromRequest(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      headers: [
        { name: "origin", value: "https://idpssoopt.alticeusa.com" },
        { name: "referer", value: "https://idpssoopt.alticeusa.com/" }
      ]
    }
  );

  session = helpers.updateHarpoCaptureSessionFromResponse(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      status: 302,
      headers: [
        { name: "access-control-allow-origin", value: "https://idpssoopt.alticeusa.com" },
        { name: "location", value: "https://www.aetv.com/mvpd-auth?redirect_url=https://play.aetv.com/live" }
      ]
    }
  );

  let decision = helpers.evaluateHarpoCaptureSession(
    session,
    "https://idpssoopt.alticeusa.com/assets/provider-logo.png",
    {
      resourceType: "Image"
    }
  );

  assert.equal(decision.physicalAssetTraffic, true);
  assert.equal(decision.allowCapture, false);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(
    session,
    "https://fonts.alticecdn.example/provider.woff2",
    {
      resourceType: "Font"
    }
  );

  assert.equal(decision.physicalAssetTraffic, true);
  assert.equal(decision.allowCapture, false);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(
    session,
    "https://idpssoopt.alticeusa.com/saml/login",
    {
      resourceType: "Document"
    }
  );

  assert.equal(decision.allowCapture, true);
  assert.equal(decision.externalAuthDomainHit, true);
});

test("HARPO records cross-domain auth hops during the SAML-auth window without relabeling them as MVPD domains", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  let session = helpers.createHarpoCaptureSession({
    safeDomains: ["adobe.com", "foxsports.com"]
  });

  session = helpers.updateHarpoCaptureSessionFromRequest(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      headers: [
        { name: "origin", value: "https://identity1.dishnetwork.com" },
        { name: "referer", value: "https://identity1.dishnetwork.com/" }
      ]
    }
  );

  let decision = helpers.evaluateHarpoCaptureSession(
    session,
    "https://us1-prod.disco-api.com/v1/gauth/callback/39e15e70-286d-49e5-86c0-b0d47e552fb1",
    {
      resourceType: "XHR",
      headers: [
        { name: "origin", value: "https://identity1.dishnetwork.com" },
        { name: "referer", value: "https://identity1.dishnetwork.com/" }
      ]
    }
  );

  assert.equal(decision.allowCapture, true);
  assert.equal(decision.externalAuthDomainHit, true);
  assert.deepEqual(decision.nextSession.mvpdDomains, ["dishnetwork.com"]);

  session = helpers.updateHarpoCaptureSessionFromResponse(
    decision.nextSession,
    "https://us1-prod.disco-api.com/v1/gauth/callback/39e15e70-286d-49e5-86c0-b0d47e552fb1",
    {
      status: 302,
      headers: [
        { name: "location", value: "https://login.provider-switch.example/redirect" }
      ]
    }
  );

  assert.deepEqual(session.mvpdDomains, ["dishnetwork.com"]);
});

test("HARPO derives programmer domains by excluding Adobe domains from the safe list", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  assert.deepEqual(
    helpers.deriveHarpoProgrammerDomains(["adobe.com", "api.auth.adobe.com", "turner.com", "trutv.com"]),
    ["turner.com", "trutv.com"]
  );
});

test("HARPO flags logout after Adobe engagement so the recorder can auto-stop", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  let session = helpers.createHarpoCaptureSession({
    safeDomains: ["adobe.com", "turner.com"]
  });

  session = helpers.evaluateHarpoCaptureSession(session, "https://sp.auth.adobe.com/o/client/register", {
    resourceType: "XHR"
  }).nextSession;
  session = helpers.updateHarpoCaptureSessionFromResponse(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      status: 302,
      headers: [
        { name: "access-control-allow-origin", value: "https://identity1.dishnetwork.com" }
      ]
    }
  );
  const decision = helpers.evaluateHarpoCaptureSession(
    session,
    "https://api.auth.adobe.com/api/v2/turner/logout/DISH",
    {
      resourceType: "Fetch"
    }
  );

  assert.equal(decision.allowCapture, true);
  assert.equal(decision.logoutTraffic, true);
  assert.equal(decision.nextSession.logoutDetected, true);
  assert.equal(decision.nextSession.externalTrafficWindowOpen, true);
});

test("HARPO stores programmer return domains from SAMLAssertionConsumer location headers and closes full capture on return", async () => {
  const helpers = await loadHarpoCaptureHelpers();
  let session = helpers.createHarpoCaptureSession({
    safeDomains: ["adobe.com", "aetv.com", "play.aetv.com"]
  });

  session = helpers.updateHarpoCaptureSessionFromRequest(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      headers: [
        { name: "origin", value: "https://idpssoopt.alticeusa.com" },
        { name: "referer", value: "https://idpssoopt.alticeusa.com/" }
      ]
    }
  );

  session = helpers.updateHarpoCaptureSessionFromResponse(
    session,
    "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
    {
      status: 302,
      headers: [
        { name: "access-control-allow-origin", value: "https://idpssoopt.alticeusa.com" },
        { name: "location", value: "https://www.aetv.com/mvpd-auth?redirect_url=https://play.aetv.com/live" }
      ]
    }
  );

  assert.deepEqual(session.mvpdDomains, ["alticeusa.com"]);
  assert.deepEqual(session.returnDomains, ["www.aetv.com", "play.aetv.com", "aetv.com"]);

  let decision = helpers.evaluateHarpoCaptureSession(
    session,
    "https://analytics.thirdparty.example/session/bootstrap.js",
    {
      resourceType: "Script"
    }
  );
  assert.equal(decision.allowCapture, true);
  session = decision.nextSession;

  decision = helpers.evaluateHarpoCaptureSession(
    session,
    "https://play.aetv.com/live",
    {
      resourceType: "Document"
    }
  );
  assert.equal(decision.allowCapture, true);
  assert.equal(decision.returnDomainHit, true);
  assert.equal(decision.returnedToProgrammerDomain, true);
  assert.equal(decision.nextSession.externalTrafficWindowOpen, false);
});
