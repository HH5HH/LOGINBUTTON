const LEGACY_SUPPORT_WINDOW_END = "2025-12-31";

const PASS_DOCS = Object.freeze({
  developerOverview: {
    label: "Adobe Pass overview",
    url: "https://developer.adobe.com/adobe-pass/"
  },
  dcrInteractiveRegister: {
    label: "DCR interactive: process software statement",
    url: "https://developer.adobe.com/adobe-pass/api/dcr_api/interactive/#operation/processSoftwareStatementUsingPOST"
  },
  dcrInteractiveToken: {
    label: "DCR interactive: generate access token",
    url: "https://developer.adobe.com/adobe-pass/api/dcr_api/interactive/#operation/generateAccessTokenUsingPOST"
  },
  restV2Interactive: {
    label: "REST API V2 interactive docs",
    url: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/"
  },
  restV2ConfigInteractive: {
    label: "REST API V2 interactive: configuration",
    url: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/#tag/1.-Configuration"
  },
  restV2SessionStatusInteractive: {
    label: "REST API V2 interactive: get session status",
    url: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/#operation/getSessionStatusUsingGET_1"
  },
  restV2Overview: {
    label: "REST API V2 overview",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-overview"
  },
  restV2Apis: {
    label: "REST API V2 APIs overview",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-apis-overview"
  },
  restV2Flows: {
    label: "REST API V2 flows overview",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-flows/rest-api-v2-flows-overview"
  },
  dcrOverview: {
    label: "DCR overview",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-dcr/dynamic-client-registration-overview"
  },
  dcrRegister: {
    label: "Retrieve client credentials",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-dcr/rest-api-dcr-apis/dynamic-client-registration-apis-retrieve-client-credentials"
  },
  dcrToken: {
    label: "Retrieve access token",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-dcr/rest-api-dcr-apis/dynamic-client-registration-apis-retrieve-access-token"
  },
  config: {
    label: "Retrieve configuration",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-configuration-apis/rest-api-v2-configuration-apis-retrieve-configuration-for-specific-service-provider"
  },
  sessionsCreate: {
    label: "Create authentication session",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-sessions-apis/rest-api-v2-sessions-apis-create-authentication-session"
  },
  sessionsResume: {
    label: "Resume authentication session",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-sessions-apis/rest-api-v2-sessions-apis-resume-authentication-session"
  },
  sessionsRetrieve: {
    label: "Retrieve authentication session",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-sessions-apis/rest-api-v2-sessions-apis-retrieve-authentication-session-information-using-code"
  },
  authenticateUserAgent: {
    label: "Perform authentication in user agent",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-sessions-apis/rest-api-v2-sessions-apis-perform-authentication-in-user-agent"
  },
  profiles: {
    label: "Retrieve profiles",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-profiles-apis/rest-api-v2-profiles-apis-retrieve-profiles"
  },
  profileMvpd: {
    label: "Retrieve profile for specific mvpd",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-profiles-apis/rest-api-v2-profiles-apis-retrieve-profile-for-specific-mvpd"
  },
  profileCode: {
    label: "Retrieve profile for specific code",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-profiles-apis/rest-api-v2-profiles-apis-retrieve-profile-for-specific-code"
  },
  authorize: {
    label: "Retrieve authorization decisions",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-decisions-apis/rest-api-v2-decisions-apis-retrieve-authorization-decisions-using-specific-mvpd"
  },
  preauthorize: {
    label: "Retrieve preauthorization decisions",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-decisions-apis/rest-api-v2-decisions-apis-retrieve-preauthorization-decisions-using-specific-mvpd"
  },
  logout: {
    label: "Initiate logout",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-apis/rest-api-v2-logout-apis/rest-api-v2-logout-apis-initiate-logout-for-specific-mvpd"
  },
  temporaryAccess: {
    label: "Temporary access flows",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-flows/rest-api-v2-temporary-access-flows/rest-api-v2-access-temporary-flows"
  },
  tempPassIdentity: {
    label: "AP-TempPass-Identity header",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/rest-apis/rest-api-v2/rest-api-v2-appendix/rest-api-v2-appendix-headers/rest-api-v2-appendix-headers-ap-temppass-identity"
  },
  ssoService: {
    label: "Adobe Pass SSO service",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/features-premium/sso-service/sso-service"
  },
  accessEnablerJsSdk: {
    label: "AccessEnabler JavaScript SDK",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/product-releases/2025/authn-rn-javascript-471"
  },
  productAnnouncements: {
    label: "Adobe Pass product announcements",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/product-announcements"
  },
  legacyOverview: {
    label: "Legacy REST API overview",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-overview"
  },
  legacyReference: {
    label: "Legacy REST API reference",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-reference"
  },
  legacyConfig: {
    label: "Legacy provide MVPD list",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/provide-mvpd-list"
  },
  legacyRegcode: {
    label: "Legacy registration page",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/registration-code-request"
  },
  legacyAuthenticate: {
    label: "Legacy initiate authentication",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/initiate-authentication"
  },
  legacyCheckAuthn: {
    label: "Legacy check authentication token",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/check-authentication-token"
  },
  legacyCheckAuthnCode: {
    label: "Legacy second screen auth check",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/check-authentication-flow-by-second-screen-web-app"
  },
  legacyAuthnToken: {
    label: "Legacy retrieve authentication token",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/retrieve-authentication-token"
  },
  legacyAuthzToken: {
    label: "Legacy retrieve authorization token",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/retrieve-authorization-token"
  },
  legacyMediaToken: {
    label: "Legacy short media token",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/obtain-short-media-token"
  },
  legacyAuthorize: {
    label: "Legacy authorize",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/initiate-authorization"
  },
  legacyPreauthorize: {
    label: "Legacy preauthorize",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/retrieve-list-of-preauthorized-resources"
  },
  legacyPreauthorizeCode: {
    label: "Legacy preauthorize by code",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/retrieve-list-of-preauthorized-resources-by-second-screen-web-app"
  },
  legacyLogout: {
    label: "Legacy logout",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/initiate-logout"
  },
  legacyUserMetadata: {
    label: "Legacy user metadata",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/user-metadata"
  },
  legacyFreePreview: {
    label: "Legacy TempPass free preview",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/rest-api-v1/rest-api-v1-apis/free-preview-for-temp-pass-and-promotional-temp-pass"
  },
  legacyMonitoring: {
    label: "Legacy monitoring guidance",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/tech-notes/troubleshooting/monitoring-adobe-pay-tv-pass"
  },
  legacyPassiveAuthn: {
    label: "Legacy passive authentication",
    url: "https://experienceleague.adobe.com/en/docs/pass/authentication/integration-guide-programmers/legacy/sso-access/sso-passive-authn"
  }
});

const SECOND_LEVEL_TLDS = new Set([
  "ac.uk",
  "co.uk",
  "gov.uk",
  "ltd.uk",
  "me.uk",
  "net.uk",
  "org.uk",
  "plc.uk",
  "sch.uk",
  "co.jp",
  "com.au",
  "net.au",
  "org.au",
  "com.br",
  "com.mx",
  "com.tr",
  "co.nz",
  "com.sg"
]);

const ADOBE_ANALYTICS_HOSTS = new Set([
  "sstats.adobe.com"
]);

const ADOBE_SUPPORT_HOSTS = [
  /(^|\.)adobedtm\.com$/i
];

const PASS_HOST_RE = /(^|\.)auth(?:-staging)?\.adobe\.com$/i;
const PASS_CONSOLE_HOST_RE = /(^|\.)auth(?:-staging)?\.adobe\.com$/i;
const IMS_HOST_RE = /^adobeid-[^.]+\.services\.adobe\.com$/i;

const PASS_RULES = [
  {
    id: "legacy-accessenabler-js",
    methods: ["GET"],
    phase: "Pass",
    label: "Legacy AccessEnabler JavaScript SDK",
    family: "legacy-v1",
    familyLabel: "Legacy SDK / V1",
    pathTemplate: "/entitlement/v4/AccessEnabler.js",
    summary: "Loads the legacy JavaScript AccessEnabler runtime instead of the modern DCR plus REST API V2 model.",
    purpose: "Bootstrap the old SDK-based Adobe Pass client flow from the hosted AccessEnabler script.",
    docs: [PASS_DOCS.accessEnablerJsSdk, PASS_DOCS.productAnnouncements, PASS_DOCS.legacyOverview],
    notes: [
      "HARPO treats every AccessEnabler SDK load as a legacy migration target, not a supported 2026 integration pattern.",
      "Modern implementation targets are DCR, REST API V2, and the current SSO service documentation."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Replace AccessEnabler SDK bootstrapping with explicit DCR plus REST API V2 calls.",
      replacementCalls: [
        {
          method: "POST",
          pathTemplate: "/o/client/register",
          label: "Process software statement",
          doc: PASS_DOCS.dcrInteractiveRegister
        },
        {
          method: "POST",
          pathTemplate: "/o/client/token",
          label: "Generate access token",
          doc: PASS_DOCS.dcrInteractiveToken
        },
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/configuration",
          label: "Retrieve configuration",
          doc: PASS_DOCS.restV2ConfigInteractive
        }
      ]
    },
    match({ hostname, pathname }) {
      return /^entitlement\.auth(?:-staging)?\.adobe\.com$/i.test(hostname) &&
        /^\/entitlement\/v4\/AccessEnabler(?:Proxy)?\.js$/i.test(pathname);
    }
  },
  {
    id: "legacy-sp-client-register",
    methods: ["POST"],
    phase: "DCR",
    label: "Legacy /register Host Flow",
    family: "legacy-v1",
    familyLabel: "Legacy Host / V1",
    pathTemplate: "/o/client/register",
    summary: "Uses the old sp.auth host surface for client registration instead of HARPO’s supported DCR target surface.",
    purpose: "Bootstrap client registration through the legacy sp.auth Adobe Pass host.",
    docs: [PASS_DOCS.dcrInteractiveRegister, PASS_DOCS.dcrOverview],
    notes: [
      "The path name matches DCR, but the host identifies this as legacy migration-required traffic in HARPO.",
      "Treat this as a DCR translation opportunity, not a supported modern Adobe Pass call."
    ],
    migration: {
      title: "DCR V2 migration",
      summary: "Move this registration step onto the supported DCR API surface documented in the interactive DCR reference.",
      replacementCalls: [
        {
          method: "POST",
          pathTemplate: "/o/client/register",
          label: "Process software statement",
          doc: PASS_DOCS.dcrInteractiveRegister
        }
      ]
    },
    match({ hostname, pathname }) {
      return /^sp\.auth(?:-staging)?\.adobe\.com$/i.test(hostname) && pathname === "/o/client/register";
    }
  },
  {
    id: "legacy-sp-client-token",
    methods: ["POST"],
    phase: "DCR",
    label: "Legacy /token Host Flow",
    family: "legacy-v1",
    familyLabel: "Legacy Host / V1",
    pathTemplate: "/o/client/token",
    summary: "Uses the old sp.auth host surface for token exchange instead of HARPO’s supported DCR target surface.",
    purpose: "Exchange client credentials through the legacy sp.auth Adobe Pass host.",
    docs: [PASS_DOCS.dcrInteractiveToken, PASS_DOCS.dcrOverview],
    notes: [
      "HARPO treats this sp.auth token exchange as legacy migration-required traffic.",
      "The supported implementation target is the documented DCR generate-access-token operation."
    ],
    migration: {
      title: "DCR V2 migration",
      summary: "Move this token exchange onto the supported DCR API surface documented in the interactive DCR reference.",
      replacementCalls: [
        {
          method: "POST",
          pathTemplate: "/o/client/token",
          label: "Generate access token",
          doc: PASS_DOCS.dcrInteractiveToken
        }
      ]
    },
    match({ hostname, pathname }) {
      return /^sp\.auth(?:-staging)?\.adobe\.com$/i.test(hostname) && pathname === "/o/client/token";
    }
  },
  {
    id: "legacy-sp-config",
    methods: ["GET"],
    phase: "Config",
    label: "Legacy Adobe Services Configuration",
    family: "legacy-v1",
    familyLabel: "Legacy Host / V1",
    pathTemplate: "/adobe-services/config/{requestorId}",
    summary: "Uses the old adobe-services config endpoint instead of REST API V2 configuration.",
    purpose: "Load configuration and MVPD data through the legacy sp.auth config surface.",
    docs: [PASS_DOCS.restV2ConfigInteractive, PASS_DOCS.legacyOverview],
    notes: [
      "This is legacy configuration traffic and should be translated to REST API V2 configuration.",
      "HARPO will no longer mark adobe-services config as supported."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Replace adobe-services config with the REST API V2 configuration operation.",
      replacementCalls: [
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/configuration",
          label: "Retrieve configuration",
          doc: PASS_DOCS.restV2ConfigInteractive
        }
      ]
    },
    match({ hostname, pathname }) {
      return /^sp\.auth(?:-staging)?\.adobe\.com$/i.test(hostname) &&
        matchPath(pathname, /^\/adobe-services\/config\/([^/]+)\/?$/);
    }
  },
  {
    id: "legacy-sp-indiv-devices",
    methods: ["GET", "POST", "DELETE"],
    phase: "SSO",
    label: "Legacy SSO Device Endpoint",
    family: "legacy-v1",
    familyLabel: "Legacy Host / V1",
    pathTemplate: "/indiv/devices",
    summary: "Legacy device-oriented SSO endpoint on the sp.auth host.",
    purpose: "Participate in the older Adobe Pass SSO service plumbing instead of a modern REST V2 entitlement step.",
    docs: [PASS_DOCS.ssoService, PASS_DOCS.legacyOverview],
    notes: [
      "This endpoint does not have a one-for-one REST API V2 replacement call.",
      "Use the official SSO service documentation to translate the behavior into a supported 2026 design."
    ],
    migration: {
      title: "Modern correlation",
      summary: "There is no direct REST API V2 replacement call. The supported reference for this legacy surface is the Adobe Pass SSO service guide.",
      replacementCalls: [
        {
          method: "GUIDE",
          pathTemplate: "Adobe Pass SSO service",
          label: "Adobe Pass SSO service",
          doc: PASS_DOCS.ssoService
        }
      ]
    },
    match({ hostname, pathname }) {
      return /^sp\.auth(?:-staging)?\.adobe\.com$/i.test(hostname) && pathname === "/indiv/devices";
    }
  },
  {
    id: "legacy-sp-regcode",
    methods: ["GET", "POST"],
    phase: "AuthN",
    label: "Legacy Regcode",
    family: "legacy-v1",
    familyLabel: "Legacy Host / V1",
    pathTemplate: "/reggie/v1/{requestorId}/regcode",
    summary: "Legacy regcode generation on the sp.auth host.",
    purpose: "Create or inspect the old second-screen registration-code flow on the legacy Adobe Pass host.",
    docs: [PASS_DOCS.restV2SessionStatusInteractive, PASS_DOCS.legacyRegcode, PASS_DOCS.legacyReference],
    notes: [
      "HARPO treats regcode traffic on sp.auth as legacy V1 clientless flow.",
      "Use the REST API V2 session-status model to translate this into the supported authentication-session contract."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Translate regcode handling to the REST API V2 session-status model.",
      replacementCalls: [
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/sessions/{code}",
          label: "Get session status",
          doc: PASS_DOCS.restV2SessionStatusInteractive
        }
      ]
    },
    match({ hostname, pathname }) {
      return /^sp\.auth(?:-staging)?\.adobe\.com$/i.test(hostname) &&
        matchPath(pathname, /^\/reggie\/v1\/([^/]+)\/regcode(?:\/([^/]+))?\/?$/);
    }
  },
  {
    id: "legacy-sp-saml-assertion-consumer",
    methods: ["GET", "POST"],
    phase: "SSO",
    label: "Legacy SAML Assertion Consumer",
    family: "legacy-v1",
    familyLabel: "Legacy Host / V1",
    pathTemplate: "/sp/saml/SAMLAssertionConsumer",
    summary: "Background SAML assertion consumer on the legacy sp.auth host.",
    purpose: "Accept MVPD SAML responses for older Adobe Pass browser and passive-authentication flows running behind the scenes.",
    docs: [PASS_DOCS.legacyMonitoring, PASS_DOCS.legacyPassiveAuthn, PASS_DOCS.legacyOverview],
    notes: [
      "Do not treat this as an active REST API V2 learning endpoint in HARPO.",
      "Adobe documents that this endpoint should not be monitored because it requires a real MVPD SAML response and otherwise returns 503.",
      "This is legacy Adobe Pass SAML plumbing, not a customer-facing DCR or REST API V2 operation."
    ],
    migration: {
      title: "Modern correlation",
      summary: "Correlate this legacy callback to the supported REST API V2 authentication flow, but do not model the ACS callback itself as a learnable REST V2 call.",
      replacementCalls: [
        {
          method: "GUIDE",
          pathTemplate: "REST API V2 create authentication session",
          label: "Create authentication session",
          doc: PASS_DOCS.sessionsCreate
        },
        {
          method: "GUIDE",
          pathTemplate: "REST API V2 perform authentication in user agent",
          label: "Perform authentication in user agent",
          doc: PASS_DOCS.authenticateUserAgent
        }
      ]
    },
    match({ hostname, pathname }) {
      return /^sp\.auth(?:-staging)?\.adobe\.com$/i.test(hostname) && pathname === "/sp/saml/SAMLAssertionConsumer";
    }
  },
  {
    id: "dcr-client-register",
    methods: ["POST"],
    phase: "DCR",
    label: "Register Client",
    family: "dcr-v2",
    familyLabel: "DCR",
    pathTemplate: "/o/client/register",
    summary: "Registers an application with Adobe Pass and returns durable client credentials.",
    purpose: "Exchange the TVE Dashboard software statement for a client_id and client_secret that can later mint bearer tokens.",
    docs: [PASS_DOCS.dcrInteractiveRegister, PASS_DOCS.dcrOverview, PASS_DOCS.dcrRegister],
    notes: [
      "This is the first step in the OAuth-based protection model for Adobe Pass protected APIs.",
      "The response should be cached because client credentials are intended to be reused, not reissued for every session."
    ],
    match({ pathname }) {
      return pathname === "/o/client/register";
    }
  },
  {
    id: "dcr-client-token",
    methods: ["POST"],
    phase: "DCR",
    label: "Get Access Token",
    family: "dcr-v2",
    familyLabel: "DCR",
    pathTemplate: "/o/client/token",
    summary: "Mints the bearer token required by REST API V2 and other protected Pass APIs.",
    purpose: "Exchange client credentials for an opaque access token that is later sent in the Authorization header.",
    docs: [PASS_DOCS.dcrInteractiveToken, PASS_DOCS.dcrOverview, PASS_DOCS.dcrToken],
    notes: [
      "Adobe documents this access token as a limited-lifetime bearer token, commonly around 24 hours.",
      "Every REST API V2 request should carry the bearer token in the Authorization header."
    ],
    match({ pathname }) {
      return pathname === "/o/client/token";
    }
  },
  {
    id: "rest-v2-configuration",
    methods: ["GET"],
    phase: "Config",
    label: "Get Configuration",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/{serviceProvider}/configuration",
    summary: "Loads the service provider configuration and MVPD catalog for a Pass integration.",
    purpose: "Return the configured MVPD list and platform-specific features for a service provider.",
    docs: [PASS_DOCS.restV2ConfigInteractive, PASS_DOCS.restV2Overview, PASS_DOCS.config, PASS_DOCS.restV2Interactive],
    notes: [
      "This replaces the legacy /api/v1/config/{requestorId} call.",
      "The request is protected by DCR and therefore expects an Authorization bearer token."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/([^/]+)\/configuration\/?$/);
    }
  },
  {
    id: "rest-v2-sessions-create",
    methods: ["POST"],
    phase: "AuthN",
    label: "Create Authentication Session",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/{serviceProvider}/sessions",
    summary: "Creates an authentication session and returns the next action required to authenticate.",
    purpose: "Start the authentication flow on the streaming device and receive a code plus the next step such as resume, authenticate, or authorize.",
    docs: [PASS_DOCS.restV2Overview, PASS_DOCS.sessionsCreate, PASS_DOCS.restV2Flows, PASS_DOCS.restV2Interactive],
    notes: [
      "This is the modern entry point for both regular MVPD auth and TempPass-driven flows.",
      "The response may include actionName, missingParameters, code, and session timing hints."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/([^/]+)\/sessions\/?$/);
    }
  },
  {
    id: "rest-v2-sessions-resume",
    methods: ["POST"],
    phase: "AuthN",
    label: "Resume Authentication Session",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/{serviceProvider}/sessions/{code}",
    summary: "Fills in missing authentication session inputs and returns the next required action.",
    purpose: "Resume a previously created session when MVPD, domain, or redirect parameters were not available at creation time.",
    docs: [PASS_DOCS.sessionsResume, PASS_DOCS.restV2Flows, PASS_DOCS.restV2Interactive],
    notes: [
      "Adobe uses this step when the initial session response returns actionName=resume.",
      "The same endpoint family is also used to retrieve session state with a GET."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/([^/]+)\/sessions\/([^/]+)\/?$/);
    }
  },
  {
    id: "rest-v2-sessions-retrieve",
    methods: ["GET"],
    phase: "AuthN",
    label: "Retrieve Authentication Session",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/{serviceProvider}/sessions/{code}",
    summary: "Reads the live status of an authentication session identified by code.",
    purpose: "Inspect whether a session is still waiting for user action or has advanced to the next Pass-directed step.",
    docs: [PASS_DOCS.sessionsRetrieve, PASS_DOCS.restV2Flows, PASS_DOCS.restV2Interactive],
    notes: [
      "This is useful for cross-device debugging because the authentication code is the bridge between devices.",
      "For completed authentication, profile lookup APIs are the stronger signal because they return active profile state."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/([^/]+)\/sessions\/([^/]+)\/?$/);
    }
  },
  {
    id: "rest-v2-authenticate-user-agent",
    methods: ["GET"],
    phase: "AuthN",
    label: "Perform Authentication in User Agent",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/authenticate/{serviceProvider}/{code}",
    summary: "Starts the browser-side redirect chain that eventually lands on the MVPD login page.",
    purpose: "Move the user agent from the Pass service to the selected MVPD while preserving the authentication code.",
    docs: [PASS_DOCS.authenticateUserAgent, PASS_DOCS.restV2Flows, PASS_DOCS.restV2Interactive],
    notes: [
      "The expected success path is a redirect chain rather than a JSON body.",
      "If the code has expired or the session is incomplete, the flow will not advance to the MVPD login page."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/authenticate\/([^/]+)\/([^/]+)\/?$/);
    }
  },
  {
    id: "rest-v2-profiles",
    methods: ["GET"],
    phase: "Profiles",
    label: "Retrieve Profiles",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/{serviceProvider}/profiles",
    summary: "Lists the active authentication profiles attached to the current device context.",
    purpose: "Confirm whether the user already has an active regular, temporary, or single sign-on profile.",
    docs: [PASS_DOCS.profiles, PASS_DOCS.restV2Flows, PASS_DOCS.restV2Interactive],
    notes: [
      "Modern user metadata is surfaced as profile attributes instead of a dedicated legacy /tokens/usermetadata call.",
      "This endpoint is the modern equivalent of legacy token-presence checks."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/([^/]+)\/profiles\/?$/);
    }
  },
  {
    id: "rest-v2-profile-code",
    methods: ["GET"],
    phase: "Profiles",
    label: "Retrieve Profile by Code",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/{serviceProvider}/profiles/code/{code}",
    summary: "Retrieves the active profile associated with an authentication code after second-screen login.",
    purpose: "Confirm that the cross-device authentication session represented by the code has completed and produced a usable profile.",
    docs: [PASS_DOCS.profileCode, PASS_DOCS.restV2Flows, PASS_DOCS.restV2Interactive],
    notes: [
      "This is the closest REST V2 equivalent to legacy second-screen checkauthn-by-code flows.",
      "It is the better completion check than polling the session endpoint once authentication should be finished."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/([^/]+)\/profiles\/code\/([^/]+)\/?$/);
    }
  },
  {
    id: "rest-v2-profile-mvpd",
    methods: ["GET"],
    phase: "Profiles",
    label: "Retrieve Profile by MVPD",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/{serviceProvider}/profiles/{mvpd}",
    summary: "Retrieves the active profile for one MVPD, including normalized user attributes when present.",
    purpose: "Inspect a specific MVPD profile, including type, expiry, issuer, and user metadata attributes.",
    docs: [PASS_DOCS.profileMvpd, PASS_DOCS.profileCode, PASS_DOCS.restV2Interactive],
    notes: [
      "Profile attributes replace the legacy dedicated user metadata endpoint in modern REST V2 flows.",
      "The same endpoint also covers TempPass and platform/service-token SSO profiles."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/([^/]+)\/profiles\/([^/]+)\/?$/);
    }
  },
  {
    id: "rest-v2-decisions-preauthorize",
    methods: ["POST"],
    phase: "PreAuth",
    label: "Retrieve Preauthorization Decisions",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/{serviceProvider}/decisions/preauthorize/{mvpd}",
    summary: "Asks Adobe Pass for fast entitlement hints for a set of resources.",
    purpose: "Return preauthorization decisions that can shape UI before a full authorize call is required.",
    docs: [PASS_DOCS.preauthorize, PASS_DOCS.restV2Flows, PASS_DOCS.restV2Interactive],
    notes: [
      "Decision source may be mvpd or degradation depending on the response.",
      "authorized=false is a content decision, not necessarily an HTTP transport failure."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/([^/]+)\/decisions\/preauthorize\/([^/]+)\/?$/);
    }
  },
  {
    id: "rest-v2-decisions-authorize",
    methods: ["POST"],
    phase: "AuthZ",
    label: "Retrieve Authorization Decisions",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/{serviceProvider}/decisions/authorize/{mvpd}",
    summary: "Performs the full authorization decision and may return the short-lived media token for playback.",
    purpose: "Return final entitlement decisions and token material required to start playback for the requested resource list.",
    docs: [PASS_DOCS.authorize, PASS_DOCS.restV2Flows, PASS_DOCS.restV2Interactive],
    notes: [
      "The response body is the authoritative place to inspect authorized, source, and token payloads.",
      "TempPass also uses this endpoint family in REST V2 rather than a dedicated freepreview endpoint."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/([^/]+)\/decisions\/authorize\/([^/]+)\/?$/);
    }
  },
  {
    id: "rest-v2-logout",
    methods: ["GET"],
    phase: "Logout",
    label: "Initiate Logout",
    family: "rest-v2",
    familyLabel: "REST V2",
    pathTemplate: "/api/v2/{serviceProvider}/logout/{mvpd}",
    summary: "Deletes the Adobe-side profile and returns the next action needed to complete MVPD logout.",
    purpose: "Coordinate Adobe-side profile removal and MVPD browser logout in one normalized REST V2 flow.",
    docs: [PASS_DOCS.logout, PASS_DOCS.restV2Flows, PASS_DOCS.restV2Interactive],
    notes: [
      "Unlike legacy logout, REST V2 explicitly models the next action for MVPD-side cleanup.",
      "If the response contains a logout action, the app still needs to drive the browser step."
    ],
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v2\/([^/]+)\/logout\/([^/]+)\/?$/);
    }
  },
  {
    id: "legacy-v1-config",
    methods: ["GET"],
    phase: "Config",
    label: "Legacy MVPD Configuration",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/config/{requestorId}",
    summary: "Legacy requestor configuration and MVPD list retrieval.",
    purpose: "Return the configured MVPD list for a legacy clientless integration.",
    docs: [PASS_DOCS.legacyOverview, PASS_DOCS.legacyConfig, PASS_DOCS.legacyReference],
    notes: [
      "Adobe’s current public overview says older SDK and REST integrations were supported through the end of 2025.",
      "Modern integrations should move to REST API V2 configuration under DCR protection."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Replace the requestor-scoped legacy config call with the DCR-protected service-provider configuration API.",
      replacementCalls: [
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/configuration",
          label: "Retrieve configuration",
          doc: PASS_DOCS.config
        }
      ]
    },
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v1\/config\/([^/]+)\/?$/);
    }
  },
  {
    id: "legacy-v1-regcode",
    methods: ["GET", "POST"],
    phase: "AuthN",
    label: "Legacy Registration Code",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/reggie/v1/{requestorId}/regcode",
    summary: "Legacy second-screen registration code creation.",
    purpose: "Create the short code and login URL used by clientless device authentication.",
    docs: [PASS_DOCS.legacyOverview, PASS_DOCS.legacyRegcode, PASS_DOCS.legacyReference],
    notes: [
      "REST V2 replaces regcode creation with authentication session creation and a first-class authentication code.",
      "The migration is not one-for-one because REST V2 separates session creation from user-agent authentication."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Create a REST V2 authentication session instead of creating a legacy regcode record.",
      replacementCalls: [
        {
          method: "POST",
          pathTemplate: "/api/v2/{serviceProvider}/sessions",
          label: "Create authentication session",
          doc: PASS_DOCS.sessionsCreate
        }
      ]
    },
    match({ pathname }) {
      return matchPath(pathname, /^\/reggie\/v1\/([^/]+)\/regcode(?:\/([^/]+))?\/?$/);
    }
  },
  {
    id: "legacy-v1-authenticate",
    methods: ["GET", "POST"],
    phase: "AuthN",
    label: "Legacy Initiate Authentication",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/authenticate",
    summary: "Legacy authentication bootstrap tied to regcode and MVPD selection.",
    purpose: "Inform Adobe Pass about MVPD selection and continue the legacy second-screen login flow.",
    docs: [PASS_DOCS.legacyOverview, PASS_DOCS.legacyAuthenticate, PASS_DOCS.legacyReference],
    notes: [
      "REST V2 splits this work into session creation or resume plus the explicit user-agent authentication redirect endpoint.",
      "In practice, modern migration usually means replacing a single legacy authenticate call with a small REST V2 sequence."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Use REST V2 session APIs plus the explicit browser authentication endpoint instead of legacy /api/v1/authenticate.",
      replacementCalls: [
        {
          method: "POST",
          pathTemplate: "/api/v2/{serviceProvider}/sessions",
          label: "Create authentication session",
          doc: PASS_DOCS.sessionsCreate
        },
        {
          method: "POST",
          pathTemplate: "/api/v2/{serviceProvider}/sessions/{code}",
          label: "Resume authentication session",
          doc: PASS_DOCS.sessionsResume
        },
        {
          method: "GET",
          pathTemplate: "/api/v2/authenticate/{serviceProvider}/{code}",
          label: "Perform authentication in user agent",
          doc: PASS_DOCS.authenticateUserAgent
        }
      ]
    },
    match({ pathname }) {
      return pathname === "/api/v1/authenticate";
    }
  },
  {
    id: "legacy-v1-freepreview",
    methods: ["POST"],
    phase: "AuthN",
    label: "Legacy TempPass Free Preview",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/authenticate/freepreview",
    summary: "Legacy endpoint that creates a TempPass or promotional TempPass authentication token.",
    purpose: "Grant temporary access without the standard MVPD second-screen authentication flow.",
    docs: [PASS_DOCS.legacyFreePreview, PASS_DOCS.temporaryAccess, PASS_DOCS.tempPassIdentity],
    notes: [
      "REST V2 moves TempPass into the normal session/profile/decision model instead of using a dedicated freepreview endpoint.",
      "Promotional TempPass identity is modeled with the AP-TempPass-Identity header in REST V2."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Model TempPass with REST V2 session, profile, and authorization flows rather than calling legacy freepreview.",
      replacementCalls: [
        {
          method: "POST",
          pathTemplate: "/api/v2/{serviceProvider}/sessions",
          label: "Create TempPass-capable authentication session",
          doc: PASS_DOCS.sessionsCreate
        },
        {
          method: "POST",
          pathTemplate: "/api/v2/{serviceProvider}/decisions/authorize/{mvpd}",
          label: "Retrieve authorization decisions",
          doc: PASS_DOCS.authorize
        },
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/profiles/{mvpd}",
          label: "Retrieve TempPass profile",
          doc: PASS_DOCS.profileMvpd
        }
      ]
    },
    match({ pathname }) {
      return pathname === "/api/v1/authenticate/freepreview";
    }
  },
  {
    id: "legacy-v1-checkauthn-code",
    methods: ["GET"],
    phase: "AuthN",
    label: "Legacy Second-Screen Auth Check",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/checkauthn/{code}",
    summary: "Legacy second-screen completion check keyed by registration code.",
    purpose: "Confirm that a browser-side authentication flow has produced a usable authenticated session for the device.",
    docs: [PASS_DOCS.legacyCheckAuthnCode, PASS_DOCS.profileCode, PASS_DOCS.legacyReference],
    notes: [
      "This is the legacy polling shape that REST V2 replaces with a code-based profile lookup.",
      "If you still depend on registration codes, the integration is still on the legacy clientless model."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Use the code-based REST V2 profile lookup instead of the legacy second-screen checkauthn endpoint.",
      replacementCalls: [
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/profiles/code/{code}",
          label: "Retrieve profile for specific code",
          doc: PASS_DOCS.profileCode
        }
      ]
    },
    match({ pathname }) {
      return matchPath(pathname, /^\/api\/v1\/checkauthn\/([^/]+)\/?$/);
    }
  },
  {
    id: "legacy-v1-checkauthn",
    methods: ["GET"],
    phase: "Profiles",
    label: "Legacy Check Authentication",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/checkauthn",
    summary: "Legacy token-presence check for whether the device is authenticated.",
    purpose: "Determine whether an unexpired AuthN token exists for the device context.",
    docs: [PASS_DOCS.legacyCheckAuthn, PASS_DOCS.profiles, PASS_DOCS.legacyReference],
    notes: [
      "REST V2 replaces token-presence checks with profile retrieval.",
      "The modern response surface is richer because it exposes MVPD, expiry, type, and attributes."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Check active profiles instead of polling a legacy AuthN token check.",
      replacementCalls: [
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/profiles",
          label: "Retrieve profiles",
          doc: PASS_DOCS.profiles
        }
      ]
    },
    match({ pathname }) {
      return pathname === "/api/v1/checkauthn";
    }
  },
  {
    id: "legacy-v1-authn-token",
    methods: ["GET"],
    phase: "Profiles",
    label: "Legacy Retrieve AuthN Token",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/tokens/authn",
    summary: "Legacy readback of the stored authentication token.",
    purpose: "Return the active AuthN token metadata for the current device context.",
    docs: [PASS_DOCS.legacyAuthnToken, PASS_DOCS.profileMvpd, PASS_DOCS.legacyReference],
    notes: [
      "REST V2 does not expose raw AuthN token retrieval as a first-class integration step.",
      "Modern debugging should inspect profile state instead of raw legacy token storage."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Inspect a REST V2 profile rather than retrieving the legacy AuthN token directly.",
      replacementCalls: [
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/profiles",
          label: "Retrieve profiles",
          doc: PASS_DOCS.profiles
        },
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/profiles/{mvpd}",
          label: "Retrieve profile for specific mvpd",
          doc: PASS_DOCS.profileMvpd
        }
      ]
    },
    match({ pathname }) {
      return pathname === "/api/v1/tokens/authn";
    }
  },
  {
    id: "legacy-v1-authz-token",
    methods: ["GET"],
    phase: "AuthZ",
    label: "Legacy Retrieve AuthZ Token",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/tokens/authz",
    summary: "Legacy readback of the stored authorization token.",
    purpose: "Return the current authorization token metadata for the device and resource context.",
    docs: [PASS_DOCS.legacyAuthzToken, PASS_DOCS.authorize, PASS_DOCS.legacyReference],
    notes: [
      "REST V2 collapses token retrieval into the authorize decision response instead of separate token endpoints.",
      "If you still read /tokens/authz directly, the flow is still anchored in legacy clientless semantics."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Use the REST V2 authorize decisions response rather than retrieving a stored legacy AuthZ token.",
      replacementCalls: [
        {
          method: "POST",
          pathTemplate: "/api/v2/{serviceProvider}/decisions/authorize/{mvpd}",
          label: "Retrieve authorization decisions",
          doc: PASS_DOCS.authorize
        }
      ]
    },
    match({ pathname }) {
      return pathname === "/api/v1/tokens/authz";
    }
  },
  {
    id: "legacy-v1-media-token",
    methods: ["GET", "POST"],
    phase: "AuthZ",
    label: "Legacy Short Media Token",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/mediatoken",
    summary: "Legacy media token retrieval endpoint.",
    purpose: "Fetch the short-lived media token used to authorize playback under the legacy flow.",
    docs: [PASS_DOCS.legacyMediaToken, PASS_DOCS.authorize, PASS_DOCS.legacyReference],
    notes: [
      "REST V2 returns media token material as part of the authorization decisions response.",
      "There is no need for a separate modern mediatoken endpoint."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Use the REST V2 authorization decision response as the playback token source.",
      replacementCalls: [
        {
          method: "POST",
          pathTemplate: "/api/v2/{serviceProvider}/decisions/authorize/{mvpd}",
          label: "Retrieve authorization decisions",
          doc: PASS_DOCS.authorize
        }
      ]
    },
    match({ pathname }) {
      return pathname === "/api/v1/mediatoken" || pathname === "/api/v1/tokens/media";
    }
  },
  {
    id: "legacy-v1-authorize",
    methods: ["GET", "POST"],
    phase: "AuthZ",
    label: "Legacy Authorize",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/authorize",
    summary: "Legacy full authorization request for a resource or resource fragment.",
    purpose: "Obtain the authorization response required before playback under the legacy clientless flow.",
    docs: [PASS_DOCS.legacyAuthorize, PASS_DOCS.authorize, PASS_DOCS.legacyReference],
    notes: [
      "This is the clearest signal that the integration is still on the legacy authorize contract instead of normalized decisions.",
      "The modern replacement is the REST V2 decisions authorize endpoint."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Replace legacy authorize with REST V2 decisions authorize for the selected MVPD.",
      replacementCalls: [
        {
          method: "POST",
          pathTemplate: "/api/v2/{serviceProvider}/decisions/authorize/{mvpd}",
          label: "Retrieve authorization decisions",
          doc: PASS_DOCS.authorize
        }
      ]
    },
    match({ pathname }) {
      return pathname === "/api/v1/authorize";
    }
  },
  {
    id: "legacy-v1-preauthorize",
    methods: ["GET", "POST"],
    phase: "PreAuth",
    label: "Legacy Preauthorize",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/preauthorize",
    summary: "Legacy entitlement preflight for a list of resources.",
    purpose: "Determine which resources can likely be shown as available before running a full authorize call.",
    docs: [PASS_DOCS.legacyPreauthorize, PASS_DOCS.preauthorize, PASS_DOCS.legacyReference],
    notes: [
      "REST V2 keeps the feature but renames it into the normalized decisions API family.",
      "A code-scoped legacy preauthorize call also indicates a second-screen legacy flow."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Move preauthorization checks to the REST V2 decisions API family.",
      replacementCalls: [
        {
          method: "POST",
          pathTemplate: "/api/v2/{serviceProvider}/decisions/preauthorize/{mvpd}",
          label: "Retrieve preauthorization decisions",
          doc: PASS_DOCS.preauthorize
        },
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/profiles/code/{code}",
          label: "Retrieve profile for specific code",
          doc: PASS_DOCS.profileCode
        }
      ]
    },
    match({ pathname }) {
      return pathname === "/api/v1/preauthorize" || /^\/api\/v1\/preauthorize\/[^/]+\/?$/.test(pathname);
    }
  },
  {
    id: "legacy-v1-logout",
    methods: ["DELETE", "GET"],
    phase: "Logout",
    label: "Legacy Logout",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/logout",
    summary: "Legacy device logout that clears stored AuthN and AuthZ tokens.",
    purpose: "Remove the Adobe-side device tokens from legacy storage.",
    docs: [PASS_DOCS.legacyLogout, PASS_DOCS.logout, PASS_DOCS.legacyReference],
    notes: [
      "Adobe documents a key legacy limitation: this endpoint clears Adobe-side storage but does not call the MVPD logout endpoint.",
      "REST V2 models the follow-up MVPD browser action explicitly."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Use the REST V2 logout endpoint so the response can direct any required MVPD-side logout action.",
      replacementCalls: [
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/logout/{mvpd}",
          label: "Initiate logout",
          doc: PASS_DOCS.logout
        }
      ]
    },
    match({ pathname }) {
      return pathname === "/api/v1/logout";
    }
  },
  {
    id: "legacy-v1-usermetadata",
    methods: ["GET"],
    phase: "Profiles",
    label: "Legacy User Metadata",
    family: "legacy-v1",
    familyLabel: "Legacy REST V1",
    pathTemplate: "/api/v1/tokens/usermetadata",
    summary: "Legacy metadata retrieval for the authenticated user.",
    purpose: "Return MVPD-provided user attributes such as zip, ratings, household ID, or user ID.",
    docs: [PASS_DOCS.legacyUserMetadata, PASS_DOCS.profileMvpd, PASS_DOCS.legacyReference],
    notes: [
      "REST V2 surfaces normalized user attributes in profile responses rather than a standalone metadata endpoint.",
      "The modern path is to inspect the profile attributes payload after authentication."
    ],
    migration: {
      title: "REST V2 migration",
      summary: "Retrieve the profile and read its normalized attributes instead of calling legacy /tokens/usermetadata.",
      replacementCalls: [
        {
          method: "GET",
          pathTemplate: "/api/v2/{serviceProvider}/profiles/{mvpd}",
          label: "Retrieve profile for specific mvpd",
          doc: PASS_DOCS.profileMvpd
        }
      ]
    },
    match({ pathname }) {
      return pathname === "/api/v1/tokens/usermetadata";
    }
  },
  {
    id: "pass-console-api",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    phase: "Pass",
    label: "Adobe Pass Console API",
    family: "pass-console",
    familyLabel: "Adobe Pass Console",
    pathTemplate: "/rest/api/…",
    summary: "Administrative API traffic for the Adobe Pass console.",
    purpose: "Drive the configuration and management surface rather than end-user entitlement flows.",
    docs: [PASS_DOCS.developerOverview],
    notes: [
      "This is Adobe Pass management traffic, not a TVE playback entitlement call.",
      "It is still useful in HARPO because console activity often explains configuration state or dashboard operations."
    ],
    match({ hostname, pathname }) {
      return /^console\./i.test(hostname) && pathname.startsWith("/rest/api/");
    }
  },
  {
    id: "pass-esm-api",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    phase: "Pass",
    label: "Adobe Pass ESM API",
    family: "pass-management",
    familyLabel: "Adobe Pass Management",
    pathTemplate: "/esm/…",
    summary: "Entitlement Service Monitoring and management telemetry traffic.",
    purpose: "Support operational and management workflows rather than end-user playback entitlement decisions.",
    docs: [PASS_DOCS.developerOverview],
    notes: [
      "ESM traffic is management-plane activity and should not be interpreted as an end-user entitlement step.",
      "HARPO still keeps it in the Pass domain because it is Adobe Pass infrastructure traffic."
    ],
    match({ hostname, pathname }) {
      return /^mgmt\./i.test(hostname) && pathname.startsWith("/esm/");
    }
  },
  {
    id: "pass-cmu-api",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    phase: "Pass",
    label: "Adobe Pass CMU API",
    family: "pass-management",
    familyLabel: "Adobe Pass Management",
    pathTemplate: "/cmu/…",
    summary: "Adobe Pass management-plane CMU traffic.",
    purpose: "Support management and provisioning operations outside the customer entitlement runtime.",
    docs: [PASS_DOCS.developerOverview],
    notes: [
      "CMU is management-plane traffic and should not be confused with runtime AuthN/AuthZ decisions.",
      "HARPO groups it into Pass because the host and path belong to Adobe Pass infrastructure."
    ],
    match({ hostname, pathname }) {
      return /^mgmt\./i.test(hostname) && pathname.startsWith("/cmu/");
    }
  }
];

function matchPath(pathname, regex) {
  const match = pathname.match(regex);
  return match || null;
}

function parseUrlLike(input) {
  if (input instanceof URL) return input;
  const raw = String(input || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    try {
      if (!raw.includes("://") && !raw.startsWith("/")) {
        return new URL(`https://${raw}`);
      }
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeHostname(hostname = "") {
  return String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
}

function renderTemplate(template, params = {}) {
  return String(template || "").replace(/\{([^}]+)\}/g, (_, key) => params[key] || `{${key}}`);
}

function withDocs(...docs) {
  return docs.filter(Boolean).map((doc) => ({ label: doc.label, url: doc.url }));
}

function buildPassClassification(rule, context) {
  const params = extractPathParams(rule, context);
  const docs = withDocs(...rule.docs);
  const migration = rule.migration
    ? {
        ...rule.migration,
        replacementCalls: (rule.migration.replacementCalls || []).map((call) => ({
          ...call,
          path: renderTemplate(call.pathTemplate, params),
          doc: call.doc ? { label: call.doc.label, url: call.doc.url } : null
        }))
      }
    : null;

  return {
    phase: rule.phase,
    label: rule.label,
    domain: "pass",
    pass: {
      endpointId: rule.id,
      family: rule.family,
      familyLabel: rule.familyLabel,
      pathTemplate: rule.pathTemplate,
      endpointPath: renderTemplate(rule.pathTemplate, params),
      summary: rule.summary,
      purpose: rule.purpose,
      notes: [...(rule.notes || [])],
      docs,
      migration,
      support: rule.family === "legacy-v1"
        ? {
            status: "legacy",
            label: "Legacy / migration required",
            windowEndedOn: LEGACY_SUPPORT_WINDOW_END,
            note: "HARPO treats this as legacy migration-required Adobe Pass traffic. Supported implementation targets are DCR, REST API V2, and the current SSO service documentation."
          }
        : {
            status: "current",
            label: rule.familyLabel
          },
      params
    }
  };
}

function extractPathParams(rule, context) {
  const { pathname } = context;
  if (rule.id === "rest-v2-configuration") {
    return capture(pathname, /^\/api\/v2\/(?<serviceProvider>[^/]+)\/configuration\/?$/);
  }
  if (rule.id === "rest-v2-sessions-create") {
    return capture(pathname, /^\/api\/v2\/(?<serviceProvider>[^/]+)\/sessions\/?$/);
  }
  if (rule.id === "rest-v2-sessions-resume" || rule.id === "rest-v2-sessions-retrieve") {
    return capture(pathname, /^\/api\/v2\/(?<serviceProvider>[^/]+)\/sessions\/(?<code>[^/]+)\/?$/);
  }
  if (rule.id === "rest-v2-authenticate-user-agent") {
    return capture(pathname, /^\/api\/v2\/authenticate\/(?<serviceProvider>[^/]+)\/(?<code>[^/]+)\/?$/);
  }
  if (rule.id === "rest-v2-profiles") {
    return capture(pathname, /^\/api\/v2\/(?<serviceProvider>[^/]+)\/profiles\/?$/);
  }
  if (rule.id === "rest-v2-profile-code") {
    return capture(pathname, /^\/api\/v2\/(?<serviceProvider>[^/]+)\/profiles\/code\/(?<code>[^/]+)\/?$/);
  }
  if (rule.id === "rest-v2-profile-mvpd") {
    return capture(pathname, /^\/api\/v2\/(?<serviceProvider>[^/]+)\/profiles\/(?<mvpd>[^/]+)\/?$/);
  }
  if (rule.id === "rest-v2-decisions-preauthorize" || rule.id === "rest-v2-decisions-authorize") {
    return capture(pathname, /^\/api\/v2\/(?<serviceProvider>[^/]+)\/decisions\/(?:preauthorize|authorize)\/(?<mvpd>[^/]+)\/?$/);
  }
  if (rule.id === "rest-v2-logout") {
    return capture(pathname, /^\/api\/v2\/(?<serviceProvider>[^/]+)\/logout\/(?<mvpd>[^/]+)\/?$/);
  }
  if (rule.id === "legacy-v1-config") {
    return capture(pathname, /^\/api\/v1\/config\/(?<requestorId>[^/]+)\/?$/);
  }
  if (rule.id === "legacy-sp-config") {
    return capture(pathname, /^\/adobe-services\/config\/(?<requestorId>[^/]+)\/?$/);
  }
  if (rule.id === "legacy-v1-regcode") {
    return capture(pathname, /^\/reggie\/v1\/(?<requestorId>[^/]+)\/regcode(?:\/(?<code>[^/]+))?\/?$/);
  }
  if (rule.id === "legacy-sp-regcode") {
    return capture(pathname, /^\/reggie\/v1\/(?<requestorId>[^/]+)\/regcode(?:\/(?<code>[^/]+))?\/?$/);
  }
  if (rule.id === "legacy-v1-checkauthn-code") {
    return capture(pathname, /^\/api\/v1\/checkauthn\/(?<code>[^/]+)\/?$/);
  }
  return {};
}

function capture(pathname, regex) {
  const match = pathname.match(regex);
  if (!match) return {};
  return { ...(match.groups || {}) };
}

function isPassHost(hostname) {
  return PASS_HOST_RE.test(hostname);
}

function isPassConsoleHost(hostname) {
  return PASS_CONSOLE_HOST_RE.test(hostname);
}

function isAdobeHost(hostname) {
  return hostname === "adobe.com" ||
    hostname.endsWith(".adobe.com") ||
    hostname.endsWith(".services.adobe.com") ||
    hostname.endsWith(".adobe.io") ||
    hostname.endsWith(".adobelogin.com");
}

function isAdobeSupportHost(hostname) {
  return ADOBE_SUPPORT_HOSTS.some((pattern) => pattern.test(hostname));
}

function findPassRule(method, hostname, pathname) {
  const upperMethod = String(method || "GET").toUpperCase();
  for (const rule of PASS_RULES) {
    if (rule.methods && !rule.methods.includes(upperMethod)) continue;
    const match = rule.match({ method: upperMethod, hostname, pathname });
    if (match) return rule;
  }
  return null;
}

function matchesProgrammerDomain(hostname, programmerDomains = []) {
  const normalizedHost = normalizeHostname(hostname);
  if (!normalizedHost) return false;
  return (Array.isArray(programmerDomains) ? programmerDomains : []).some((domain) => {
    const normalizedDomain = normalizeHostname(domain);
    if (!normalizedDomain) return false;
    return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
  });
}

export function getHarpoTrafficHostname(input) {
  const parsed = parseUrlLike(input);
  if (parsed?.hostname) return normalizeHostname(parsed.hostname);
  return normalizeHostname(input);
}

export function getHarpoTrafficDomainBucket(input) {
  const hostname = getHarpoTrafficHostname(input);
  if (!hostname) return "";
  if (hostname === "localhost" || /^[\d:.]+$/.test(hostname)) return hostname;
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;
  const tail = parts.slice(-2).join(".");
  if (SECOND_LEVEL_TLDS.has(tail) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

export function isHarpoAdobeTraffic(input) {
  const hostname = getHarpoTrafficHostname(input);
  if (!hostname) return false;
  return isAdobeHost(hostname);
}

export function isHarpoImsTraffic(input) {
  const parsed = parseUrlLike(input);
  const hostname = normalizeHostname(parsed?.hostname || input);
  const pathname = parsed?.pathname || "";
  return IMS_HOST_RE.test(hostname) && pathname.startsWith("/ims/");
}

export function isHarpoPassTraffic(input) {
  const parsed = parseUrlLike(input);
  const hostname = normalizeHostname(parsed?.hostname || input);
  const pathname = parsed?.pathname || "";
  if (!hostname) return false;
  if (isPassHost(hostname)) return true;
  if (isPassConsoleHost(hostname) && (pathname.startsWith("/rest/api/") || pathname.startsWith("/esm/") || pathname.startsWith("/cmu/"))) {
    return true;
  }
  return false;
}

export function classifyHarpoEntry(entry, options = {}) {
  const url = entry?.request?.url || "";
  const method = entry?.request?.method || "GET";
  const parsed = parseUrlLike(url);
  const hostname = normalizeHostname(parsed?.hostname);
  const pathname = parsed?.pathname || "";
  const resourceType = String(entry?._resourceType || "").toLowerCase();
  const programmerDomains = Array.isArray(options.programmerDomains) ? options.programmerDomains : [];

  if (!hostname) {
    return options?.adobeGateOpen ? { phase: "Other", label: "Unparsed Traffic", domain: "other" } : null;
  }

  if (ADOBE_ANALYTICS_HOSTS.has(hostname)) {
    return null;
  }

  if (isHarpoImsTraffic(url)) {
    return {
      phase: "IMS",
      label: "Adobe IMS Auth",
      domain: "ims"
    };
  }

  if (isHarpoPassTraffic(url)) {
    const rule = findPassRule(method, hostname, pathname);
    if (rule) return buildPassClassification(rule, { method, hostname, pathname });
    return {
      phase: "Pass",
      label: "Adobe Pass Traffic",
      domain: "pass",
      pass: {
        endpointId: "pass-generic",
        family: "pass-control-plane",
        familyLabel: "Adobe Pass",
        pathTemplate: pathname || "/",
        endpointPath: pathname || "/",
        summary: "Adobe Pass control-plane traffic that did not match a more specific HARPO rule.",
        purpose: "This request is still part of Adobe Pass infrastructure, but HARPO does not yet have a narrower endpoint contract for it.",
        notes: [
          "Treat this as Pass traffic because the host belongs to the Adobe Pass control plane.",
          "If this is a stable endpoint family, HARPO should learn a first-class rule for it."
        ],
        docs: withDocs(PASS_DOCS.developerOverview, PASS_DOCS.restV2Overview, PASS_DOCS.restV2Interactive),
        migration: null,
        support: {
          status: "current",
          label: "Adobe Pass"
        },
        params: {}
      }
    };
  }

  if (matchesProgrammerDomain(hostname, programmerDomains)) {
    return {
      phase: "Programmer",
      label: resourceType === "document" ? "Programmer Document" : "Programmer App",
      domain: "programmer"
    };
  }

  if (!options?.adobeGateOpen) return null;

  if (isAdobeHost(hostname)) {
    return {
      phase: "Other",
      label: "Adobe Ecosystem Traffic",
      domain: "adobe"
    };
  }

  if (isAdobeSupportHost(hostname)) {
    return {
      phase: "Other",
      label: "Adobe Supporting Traffic",
      domain: "adobe"
    };
  }

  if (options?.mvpdGateOpen) {
    return {
      phase: "MVPD",
      label: "MVPD / External Auth Traffic",
      domain: "mvpd"
    };
  }

  return {
    phase: "Other",
    label: "Supporting Traffic",
    domain: "other"
  };
}
