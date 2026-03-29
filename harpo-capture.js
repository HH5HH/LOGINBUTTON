import {
  getHarpoTrafficDomainBucket,
  getHarpoTrafficHostname,
  isHarpoAdobeTraffic,
  isHarpoLogoutTraffic,
  isHarpoPhysicalAssetTraffic,
  isHarpoPassSessionTrigger,
  isHarpoPassSamlAssertionConsumer
} from "./harpo-traffic.js";

function dedupeDomains(domains = []) {
  const normalized = Array.isArray(domains)
    ? domains.map((domain) => getHarpoTrafficHostname(domain)).filter(Boolean)
    : [];
  return Array.from(new Set(normalized));
}

function dedupeDomainBuckets(domains = []) {
  const normalized = Array.isArray(domains)
    ? domains.map((domain) => getHarpoTrafficDomainBucket(domain)).filter(Boolean)
    : [];
  return Array.from(new Set(normalized));
}

function matchesHarpoDomainList(input, domains = []) {
  const hostname = getHarpoTrafficHostname(input);
  if (!hostname) return false;
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function filterHarpoMvpdDomains(domains = [], session = createHarpoCaptureSession()) {
  return dedupeDomainBuckets(domains)
    .filter((domain) => !isHarpoAdobeTraffic(domain))
    .filter((domain) => !matchesHarpoDomainList(domain, session.safeDomains || []))
    .filter((domain) => !matchesHarpoDomainList(domain, session.programmerDomains || []));
}

export function deriveHarpoProgrammerDomains(safeDomains = []) {
  return dedupeDomains(safeDomains).filter((domain) => !isHarpoAdobeTraffic(domain));
}

export function createHarpoCaptureSession({
  safeDomains = [],
  programmerDomains = []
} = {}) {
  const normalizedSafeDomains = dedupeDomains(safeDomains);
  const normalizedProgrammerDomains = dedupeDomains(programmerDomains);
  return {
    safeDomains: normalizedSafeDomains,
    programmerDomains:
      normalizedProgrammerDomains.length > 0
        ? normalizedProgrammerDomains
        : deriveHarpoProgrammerDomains(normalizedSafeDomains),
    adobeEngaged: false,
    externalTrafficWindowOpen: false,
    externalTrafficObserved: false,
    mvpdDomains: [],
    returnDomains: [],
    returnedToProgrammerDomain: false,
    logoutDetected: false
  };
}

function normalizeHarpoHeaderRecords(headers = []) {
  if (Array.isArray(headers)) {
    return headers
      .map((header) => ({
        name: String(header?.name || "").trim().toLowerCase(),
        value: String(header?.value || "").trim()
      }))
      .filter((header) => header.name && header.value);
  }

  if (headers && typeof headers === "object") {
    return Object.entries(headers)
      .map(([name, value]) => ({
        name: String(name || "").trim().toLowerCase(),
        value: String(value || "").trim()
      }))
      .filter((header) => header.name && header.value);
  }

  return [];
}

function extractHarpoHeaderBuckets(headers = [], headerNames = []) {
  const normalizedHeaders = normalizeHarpoHeaderRecords(headers);
  const normalizedHeaderNames = Array.isArray(headerNames)
    ? headerNames.map((name) => String(name || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const candidateValues = normalizedHeaders
    .filter((header) => normalizedHeaderNames.includes(header.name))
    .flatMap((header) => String(header.value || "").split(","))
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => value !== "*");

  return dedupeDomainBuckets(candidateValues);
}

function extractHarpoRequestMvpdDomains(headers = []) {
  return extractHarpoHeaderBuckets(headers, ["origin", "referer"]);
}

function extractHarpoResponseMvpdDomains(headers = []) {
  return extractHarpoHeaderBuckets(headers, ["access-control-allow-origin"]);
}

function extractHarpoResponseRedirectDomains(headers = []) {
  return extractHarpoHeaderBuckets(headers, ["location"]);
}

function extractHarpoLocationUrls(headers = []) {
  const normalizedHeaders = normalizeHarpoHeaderRecords(headers);
  return normalizedHeaders
    .filter((header) => header.name === "location")
    .flatMap((header) => String(header.value || "").split(","))
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function extractHarpoNestedUrlDomains(value = "", domains = new Set()) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return [];
  }

  const hostname = getHarpoTrafficHostname(candidate);
  if (hostname) {
    domains.add(hostname);
    try {
      const parsed = new URL(candidate);
      for (const nestedValue of parsed.searchParams.values()) {
        extractHarpoNestedUrlDomains(nestedValue, domains);
      }
    } catch {
      // ignore malformed nested URLs
    }
  }

  return [...domains];
}

function extractHarpoResponseReturnDomains(headers = []) {
  const locationUrls = extractHarpoLocationUrls(headers);
  return dedupeDomains(
    locationUrls.flatMap((value) => extractHarpoNestedUrlDomains(value))
  );
}

function isHarpoLinkedToMvpdChain(
  session = createHarpoCaptureSession(),
  {
    url = "",
    initiatorUrl = "",
    documentUrl = "",
    headers = []
  } = {}
) {
  const currentSession =
    session && typeof session === "object" ? session : createHarpoCaptureSession();
  const linkedDomains = [
    ...extractHarpoRequestMvpdDomains(headers),
    getHarpoTrafficDomainBucket(initiatorUrl),
    getHarpoTrafficDomainBucket(documentUrl)
  ].filter(Boolean);

  return (
    matchesHarpoDomainList(url, currentSession.mvpdDomains || []) ||
    linkedDomains.some((domain) => matchesHarpoDomainList(domain, currentSession.mvpdDomains || []))
  );
}

export function updateHarpoCaptureSessionFromRequest(
  session = createHarpoCaptureSession(),
  url = "",
  { headers = [], initiatorUrl = "", documentUrl = "" } = {}
) {
  const currentSession =
    session && typeof session === "object" ? session : createHarpoCaptureSession();
  const nextSession = {
    ...currentSession,
    mvpdDomains: dedupeDomainBuckets(currentSession.mvpdDomains || []),
    returnDomains: dedupeDomains(currentSession.returnDomains || [])
  };

  if (!isHarpoPassSamlAssertionConsumer(url)) {
    return nextSession;
  }

  const requestMvpdDomains = filterHarpoMvpdDomains(
    extractHarpoRequestMvpdDomains(headers),
    nextSession
  );

  nextSession.adobeEngaged = true;
  nextSession.externalTrafficWindowOpen = true;
  nextSession.returnedToProgrammerDomain = false;
  nextSession.logoutDetected = false;
  if (requestMvpdDomains.length > 0) {
    nextSession.mvpdDomains = dedupeDomainBuckets([
      ...(nextSession.mvpdDomains || []),
      ...requestMvpdDomains
    ]);
  }

  return nextSession;
}

export function updateHarpoCaptureSessionFromResponse(
  session = createHarpoCaptureSession(),
  url = "",
  { headers = [], status = 0 } = {}
) {
  const currentSession =
    session && typeof session === "object" ? session : createHarpoCaptureSession();
  const nextSession = {
    ...currentSession,
    mvpdDomains: dedupeDomainBuckets(currentSession.mvpdDomains || []),
    returnDomains: dedupeDomains(currentSession.returnDomains || [])
  };
  const normalizedStatus = Number(status || 0);
  const responseMvpdDomains = filterHarpoMvpdDomains(
    extractHarpoResponseMvpdDomains(headers),
    nextSession
  );
  const returnDomains = dedupeDomains([
    ...extractHarpoResponseReturnDomains(headers),
    ...extractHarpoResponseRedirectDomains(headers)
  ]).filter((domain) => !isHarpoAdobeTraffic(domain));
  const samlAssertionConsumer = isHarpoPassSamlAssertionConsumer(url);

  if (samlAssertionConsumer) {
    nextSession.adobeEngaged = true;
    nextSession.externalTrafficWindowOpen = true;
    nextSession.returnedToProgrammerDomain = false;
    nextSession.logoutDetected = false;
    if (responseMvpdDomains.length > 0) {
      nextSession.mvpdDomains = dedupeDomainBuckets([
        ...(nextSession.mvpdDomains || []),
        ...responseMvpdDomains
      ]);
    }
    if (returnDomains.length > 0) {
      nextSession.returnDomains = dedupeDomains([
        ...(nextSession.returnDomains || []),
        ...returnDomains
      ]);
    }
  } else if (samlAssertionConsumer && normalizedStatus >= 300 && normalizedStatus < 400) {
    nextSession.adobeEngaged = true;
    nextSession.externalTrafficWindowOpen = true;
    nextSession.returnedToProgrammerDomain = false;
  }

  return nextSession;
}

export function evaluateHarpoCaptureSession(
  session = createHarpoCaptureSession(),
  url = "",
  { resourceType = "", initiatorUrl = "", documentUrl = "", headers = [] } = {}
) {
  const currentSession =
    session && typeof session === "object" ? session : createHarpoCaptureSession();
  const hostname = getHarpoTrafficHostname(url);
  const safeDomainHit = matchesHarpoDomainList(url, currentSession.safeDomains || []);
  const programmerDomainHit = matchesHarpoDomainList(url, currentSession.programmerDomains || []);
  const returnDomainHit = matchesHarpoDomainList(url, currentSession.returnDomains || []);
  const adobeTraffic = isHarpoAdobeTraffic(url);
  const passSessionTrigger = isHarpoPassSessionTrigger(url);
  const logoutTraffic = isHarpoLogoutTraffic(url);
  const normalizedResourceType = String(resourceType || "").trim().toLowerCase();
  const physicalAssetTraffic = isHarpoPhysicalAssetTraffic({
    url,
    resourceType: normalizedResourceType,
    headers
  });
  const nextSession = {
    ...currentSession
  };

  if (passSessionTrigger) {
    nextSession.adobeEngaged = true;
    nextSession.returnedToProgrammerDomain = false;
  }

  const captureAllTraffic =
    nextSession.adobeEngaged &&
    nextSession.externalTrafficWindowOpen;
  const knownExternalAuthDomainHit = isHarpoLinkedToMvpdChain(nextSession, {
    url,
    initiatorUrl,
    documentUrl,
    headers
  });
  const externalAuthTraffic = captureAllTraffic && !safeDomainHit && !adobeTraffic;
  const allowedExternalAuthTraffic = externalAuthTraffic && !physicalAssetTraffic;

  if (allowedExternalAuthTraffic) {
    nextSession.externalTrafficObserved = true;
  }

  const returnedToProgrammerDomain =
    captureAllTraffic &&
    !adobeTraffic &&
    normalizedResourceType === "document" &&
    (returnDomainHit || programmerDomainHit);

  if (returnedToProgrammerDomain) {
    nextSession.externalTrafficWindowOpen = false;
    nextSession.returnedToProgrammerDomain = true;
  }

  if (logoutTraffic && nextSession.adobeEngaged) {
    nextSession.logoutDetected = true;
  }

  const allowCapture =
    !physicalAssetTraffic &&
    (safeDomainHit || adobeTraffic || passSessionTrigger || captureAllTraffic);

  return {
    nextSession,
    allowCapture,
    safeDomainHit,
    programmerDomainHit,
    returnDomainHit,
    externalAuthDomainHit: knownExternalAuthDomainHit,
    adobeTraffic,
    passSessionTrigger,
    physicalAssetTraffic,
    logoutTraffic,
    returnedToProgrammerDomain
  };
}
