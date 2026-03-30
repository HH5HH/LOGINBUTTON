function cloneFixture(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildEntry({
  startedDateTime,
  time = 120,
  method = "GET",
  url = "",
  requestHeaders = [],
  postData = null,
  status = 200,
  statusText = "OK",
  responseHeaders = [],
  responseContent = null,
  resourceType = "Fetch"
} = {}) {
  const responseMimeType = responseContent?.mimeType || responseHeaders.find((header) => String(header?.name || "").toLowerCase() === "content-type")?.value || "application/json";
  return {
    startedDateTime,
    time,
    request: {
      method,
      url,
      headers: requestHeaders,
      postData
    },
    response: {
      status,
      statusText,
      headers: responseHeaders,
      content: responseContent || {
        mimeType: responseMimeType,
        text: ""
      }
    },
    _resourceType: resourceType
  };
}

const proxymanFixtures = Object.freeze([
  Object.freeze({
    id: "legacy-web-authenticate-sportsnet",
    platform: "Web / Desktop browser",
    classifyOptions: Object.freeze({ adobeGateOpen: true, passGateOpen: true }),
    expected: Object.freeze({ phase: "AuthN", family: "legacy-v1", endpointId: "legacy-v1-authenticate" }),
    platformArgs: Object.freeze({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      requestUrl: "https://sp.auth.adobe.com/api/v1/authenticate?reg_code=P9RSSON&requestor_id=SportsnetNowCA&mso_id=Bell&domain_name=watch.sportsnet.ca&noflash=true&no_iframe=true&redirect_url=https%3A%2F%2Fwatch.sportsnet.ca%2Fmvpd%2Fcallback%3FdeviceId%3D183d1075-e5b5-48bc-bdbc-ded217520c3f%26deviceInfo%3DeyJtb2RlbCI6IndhdGNoLnNwb3J0c25ldC5jYSIsIm9zTmFtZSI6IlBDIn0%3D",
      queryValues: Object.freeze({ requestor_id: "SportsnetNowCA", mso_id: "Bell", domain_name: "watch.sportsnet.ca" }),
      callbackDeviceInfo: Object.freeze({ model: "watch.sportsnet.ca", osName: "PC" })
    }),
    entry: buildEntry({
      startedDateTime: "2026-03-30T20:56:34.878Z",
      time: 47,
      method: "GET",
      url: "https://sp.auth.adobe.com/api/v1/authenticate?reg_code=P9RSSON&requestor_id=SportsnetNowCA&mso_id=Bell&domain_name=watch.sportsnet.ca&noflash=true&no_iframe=true&redirect_url=https%3A%2F%2Fwatch.sportsnet.ca%2Fmvpd%2Fcallback%3FdeviceId%3D183d1075-e5b5-48bc-bdbc-ded217520c3f%26deviceInfo%3DeyJtb2RlbCI6IndhdGNoLnNwb3J0c25ldC5jYSIsIm9zTmFtZSI6IlBDIn0%3D",
      requestHeaders: [
        { name: "user-agent", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" }
      ],
      resourceType: "Document"
    })
  }),
  Object.freeze({
    id: "electron-dcr-register",
    platform: "Electron desktop",
    classifyOptions: Object.freeze({ adobeGateOpen: true, passGateOpen: true }),
    expected: Object.freeze({ phase: "DCR", family: "dcr-v2", endpointId: "dcr-client-register" }),
    platformArgs: Object.freeze({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) LoginButton/1.0 Electron/30.0.6 Safari/537.36",
      requestUrl: "https://api.auth.adobe.com/o/client/register",
      requestValues: Object.freeze({ redirect_uri: "https://localhost/callback" }),
      requestDeviceInfo: Object.freeze({ platform: "macOS", browser: "Electron", model: "MacBook Pro" })
    }),
    entry: buildEntry({
      startedDateTime: "2026-03-30T20:56:36.100Z",
      time: 143,
      method: "POST",
      url: "https://api.auth.adobe.com/o/client/register",
      requestHeaders: [
        { name: "user-agent", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) LoginButton/1.0 Electron/30.0.6 Safari/537.36" },
        { name: "content-type", value: "application/json" }
      ],
      postData: {
        mimeType: "application/json",
        text: JSON.stringify({
          software_statement: "eyJhbGciOiJIUzI1NiJ9.mock.statement",
          redirect_uri: "https://localhost/callback"
        })
      },
      responseHeaders: [{ name: "content-type", value: "application/json" }],
      responseContent: { mimeType: "application/json", text: "{\"client_id\":\"abc\",\"client_secret\":\"def\"}" }
    })
  }),
  Object.freeze({
    id: "android-rest-v2-sessions-create",
    platform: "Android",
    classifyOptions: Object.freeze({ adobeGateOpen: true, passGateOpen: true }),
    expected: Object.freeze({ phase: "AuthN", family: "rest-v2", endpointId: "rest-v2-sessions-create" }),
    platformArgs: Object.freeze({
      userAgent: "okhttp/4.12.0",
      requestUrl: "https://api.auth.adobe.com/api/v2/nbc/sessions",
      requestValues: Object.freeze({ mvpd: "Comcast_SSO", domainName: "www.nbc.com" }),
      requestDeviceInfo: Object.freeze({ platform: "Android", operatingSystem: "Android 14", model: "Pixel 8", browser: "Chrome Custom Tab" })
    }),
    entry: buildEntry({
      startedDateTime: "2026-03-30T20:56:37.500Z",
      time: 221,
      method: "POST",
      url: "https://api.auth.adobe.com/api/v2/nbc/sessions",
      requestHeaders: [
        { name: "user-agent", value: "okhttp/4.12.0" },
        { name: "authorization", value: "Bearer access-token" },
        { name: "content-type", value: "application/x-www-form-urlencoded" },
        { name: "ap-device-identifier", value: "android-device-123" },
        { name: "x-device-info", value: "eyJwbGF0Zm9ybSI6IkFuZHJvaWQiLCJvcGVyYXRpbmdTeXN0ZW0iOiJBbmRyb2lkIDE0IiwibW9kZWwiOiJQaXhlbCA4IiwiYnJvd3NlciI6IkNocm9tZSBDdXN0b20gVGFiIn0=" }
      ],
      postData: {
        mimeType: "application/x-www-form-urlencoded",
        text: "mvpd=Comcast_SSO&domainName=www.nbc.com&redirectUrl=https%3A%2F%2Fwww.nbc.com%2Fmvpd%2Fcallback"
      },
      responseHeaders: [{ name: "content-type", value: "application/json" }],
      responseContent: {
        mimeType: "application/json",
        text: "{\"actionName\":\"authenticate\",\"actionType\":\"redirect\",\"code\":\"ABC123\"}"
      }
    })
  }),
  Object.freeze({
    id: "roku-rest-v2-profile-by-mvpd",
    platform: "Roku",
    classifyOptions: Object.freeze({ adobeGateOpen: true, passGateOpen: true }),
    expected: Object.freeze({ phase: "Profiles", family: "rest-v2", endpointId: "rest-v2-profile-mvpd" }),
    platformArgs: Object.freeze({
      userAgent: "Roku/DVP-12.0 (12.0.0-12345)",
      requestUrl: "https://api.auth.adobe.com/api/v2/nbc/profiles/Comcast_SSO",
      requestValues: Object.freeze({ mvpd: "Comcast_SSO" })
    }),
    entry: buildEntry({
      startedDateTime: "2026-03-30T20:56:39.000Z",
      time: 88,
      method: "GET",
      url: "https://api.auth.adobe.com/api/v2/nbc/profiles/Comcast_SSO",
      requestHeaders: [
        { name: "user-agent", value: "Roku/DVP-12.0 (12.0.0-12345)" },
        { name: "authorization", value: "Bearer access-token" },
        { name: "x-roku-reserved-roku-connect-token", value: "roku-connect-token" }
      ],
      responseHeaders: [{ name: "content-type", value: "application/json" }],
      responseContent: {
        mimeType: "application/json",
        text: "{\"profiles\":{\"Comcast_SSO\":{\"type\":\"mvpd\"}}}"
      }
    })
  }),
  Object.freeze({
    id: "apple-partner-sso-session",
    platform: "Apple platform",
    classifyOptions: Object.freeze({ adobeGateOpen: true, passGateOpen: true }),
    expected: Object.freeze({ phase: "AuthN", family: "rest-v2", endpointId: "rest-v2-sessions-partner" }),
    platformArgs: Object.freeze({
      userAgent: "AppleTV6,2/18.0 CFNetwork/1494 Darwin/24.0.0",
      requestUrl: "https://api.auth.adobe.com/api/v2/turner/sessions/sso/Apple",
      requestValues: Object.freeze({ domainName: "watch.trutv.com" }),
      requestDeviceInfo: Object.freeze({ platform: "tvOS", operatingSystem: "tvOS 18.0", model: "Apple TV 4K" }),
      partnerFrameworkStatusDetails: Object.freeze({ accountProviderIdentifier: "Apple", platformMappingId: "tvos" })
    }),
    entry: buildEntry({
      startedDateTime: "2026-03-30T20:56:40.400Z",
      time: 101,
      method: "POST",
      url: "https://api.auth.adobe.com/api/v2/turner/sessions/sso/Apple",
      requestHeaders: [
        { name: "user-agent", value: "AppleTV6,2/18.0 CFNetwork/1494 Darwin/24.0.0" },
        { name: "authorization", value: "Bearer access-token" },
        { name: "content-type", value: "application/x-www-form-urlencoded" },
        { name: "x-device-info", value: "eyJwbGF0Zm9ybSI6InR2T1MiLCJvcGVyYXRpbmdTeXN0ZW0iOiJ0dk9TIDE4LjAiLCJtb2RlbCI6IkFwcGxlIFRWIDRLIn0=" },
        { name: "ap-partner-framework-status", value: "eyJhY2NvdW50UHJvdmlkZXJJZGVudGlmaWVyIjoiQXBwbGUiLCJwbGF0Zm9ybU1hcHBpbmdJZCI6InR2b3MifQ==" }
      ],
      postData: {
        mimeType: "application/x-www-form-urlencoded",
        text: "domainName=watch.trutv.com&redirectUrl=https%3A%2F%2Fwatch.trutv.com%2Fpartner%2Fcallback"
      },
      responseHeaders: [{ name: "content-type", value: "application/json" }],
      responseContent: {
        mimeType: "application/json",
        text: "{\"actionName\":\"partner_sso\",\"actionType\":\"verification\",\"url\":\"https://appleid.apple.com/auth\"}"
      }
    })
  }),
  Object.freeze({
    id: "system-saml-assertion-consumer-xfinity",
    platform: "Web / Desktop browser",
    classifyOptions: Object.freeze({ adobeGateOpen: true, passGateOpen: true }),
    expected: Object.freeze({ phase: "SSO", family: "pass-system", endpointId: "system-sp-saml-assertion-consumer" }),
    platformArgs: Object.freeze({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      requestUrl: "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
      requestValues: Object.freeze({ RelayState: "relay-123", SAMLResponse: "present" }),
      callbackDeviceInfo: Object.freeze({ osName: "PC", browser: "Chrome" })
    }),
    entry: buildEntry({
      startedDateTime: "2026-03-30T20:56:42.000Z",
      time: 137,
      method: "POST",
      url: "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
      requestHeaders: [
        { name: "user-agent", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
        { name: "origin", value: "https://oauth.xfinity.com" },
        { name: "referer", value: "https://oauth.xfinity.com/oauth/authorize?client_id=comcast" },
        { name: "content-type", value: "application/x-www-form-urlencoded" }
      ],
      postData: {
        mimeType: "application/x-www-form-urlencoded",
        text: "RelayState=relay-123&SAMLResponse=assertion"
      },
      status: 302,
      statusText: "Found",
      responseHeaders: [
        { name: "location", value: "https://www.turner.com/tvprovider/callback" }
      ],
      resourceType: "Document"
    })
  })
]);

function getFixtureById(fixtureId = "") {
  return proxymanFixtures.find((fixture) => fixture.id === fixtureId) || null;
}

function buildFixtureHarBundle(fixtureIds = []) {
  const requestedIds = Array.isArray(fixtureIds) && fixtureIds.length
    ? fixtureIds
    : proxymanFixtures.map((fixture) => fixture.id);
  const fixtures = requestedIds
    .map((fixtureId) => getFixtureById(fixtureId))
    .filter(Boolean);
  return {
    fileName: "harpo-proxyman-fixture-pack.har",
    programmerName: "HARPO Proxyman",
    requestorId: "fixtureRequestor",
    requestorName: "Fixture Requestor",
    safeDomains: ["adobe.com", "nbc.com", "trutv.com", "sportsnet.ca"],
    reproDomains: ["nbc.com", "trutv.com", "sportsnet.ca"],
    expectedMvpds: ["Comcast_SSO", "Bell"],
    mvpdDomains: ["xfinity.com", "bell.ca"],
    har: {
      log: {
        version: "1.2",
        creator: { name: "HARPO Proxyman Fixture Pack", version: "1.0.0" },
        entries: fixtures.map((fixture) => cloneFixture(fixture.entry))
      }
    }
  };
}

module.exports = {
  proxymanFixtures,
  getFixtureById,
  buildFixtureHarBundle
};
