function normalizeHarpoPlatformText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function collectHarpoPlatformTokens(input = null, seen = new Set()) {
  if (input === null || input === undefined) return [];
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    const text = String(input || "").trim();
    return text ? [text] : [];
  }
  if (seen.has(input)) return [];
  seen.add(input);
  if (Array.isArray(input)) {
    return input.flatMap((item) => collectHarpoPlatformTokens(item, seen));
  }
  if (typeof input === "object") {
    return Object.values(input).flatMap((value) => collectHarpoPlatformTokens(value, seen));
  }
  return [];
}

function findHarpoPlatformEvidence(haystack = "", patterns = [], evidence = []) {
  for (const pattern of Array.isArray(patterns) ? patterns : []) {
    if (!pattern) continue;
    const normalizedPattern = normalizeHarpoPlatformText(pattern);
    if (!normalizedPattern) continue;
    if (haystack.includes(normalizedPattern)) {
      evidence.push(pattern);
    }
  }
  return evidence;
}

export function inferHarpoClientPlatform({
  userAgent = "",
  requestUrl = "",
  requestValues = {},
  queryValues = {},
  requestDeviceInfo = null,
  callbackDeviceInfo = null,
  partnerFrameworkStatusDetails = null
} = {}) {
  const signalTexts = [
    userAgent,
    requestUrl,
    ...collectHarpoPlatformTokens(requestValues),
    ...collectHarpoPlatformTokens(queryValues),
    ...collectHarpoPlatformTokens(requestDeviceInfo),
    ...collectHarpoPlatformTokens(callbackDeviceInfo),
    ...collectHarpoPlatformTokens(partnerFrameworkStatusDetails)
  ].filter(Boolean);
  const haystack = signalTexts.map((value) => normalizeHarpoPlatformText(value)).filter(Boolean).join(" ");
  if (!haystack) {
    return { label: "", evidence: [] };
  }

  const platformChecks = [
    { label: "Electron desktop", patterns: ["electron", "chrome-extension://", "chromiumapp.org"] },
    { label: "Roku", patterns: ["roku", "roku-connect", "x-roku-reserved-roku-connect-token"] },
    { label: "Apple platform", patterns: ["appletv", "apple tv", "tvos", "ios", "iphone", "ipad", "cfnetwork", "darwin/"] },
    { label: "Android", patterns: ["android", "okhttp", "pixel", "fire tv", "firetv", "aft", "androidtv"] },
    { label: "LG webOS", patterns: ["webos", "lge", "lg "] },
    { label: "Samsung Tizen", patterns: ["tizen", "samsung"] },
    { label: "Web / Desktop browser", patterns: ["windows", "macintosh", "mac os", "linux", "pc", "chrome/", "safari/", "firefox/", "edg/"] }
  ];

  for (const check of platformChecks) {
    const evidence = findHarpoPlatformEvidence(haystack, check.patterns, []);
    if (evidence.length) {
      return {
        label: check.label,
        evidence: [...new Set(evidence)]
      };
    }
  }

  return {
    label: "Unknown client platform",
    evidence: signalTexts.slice(0, 3).map((value) => String(value || "").trim()).filter(Boolean)
  };
}
