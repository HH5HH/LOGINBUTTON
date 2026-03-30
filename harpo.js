/**
 * HARPO Workspace — harpo.js
 * Reads session from IndexedDB (no storage quota limits).
 * Classifies Adobe Pass + MVPD calls, renders full analysis workspace.
 * Download via URL.createObjectURL — handles HAR files of any size.
 */

import { harpoIdbGet, harpoIdbDelete, harpoIdbPurgeExpired } from "./harpo-idb.js";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  getThemeAccentMeta,
  normalizeThemePreference
} from "./theme-palette.js";
import {
  classifyHarpoEntry,
  getHarpoTrafficDomainBucket,
  getHarpoTrafficHostname,
  isHarpoAdobeTraffic,
  isHarpoPassSamlAssertionConsumer,
  isHarpoPassTraffic
} from "./harpo-traffic.js";
import {
  buildHarpoDcrInteractiveDocsUrl,
  getHarpoDcrInteractiveDocsEntryFromEndpointId,
  openHarpoDcrInteractiveDocsPlan,
  buildHarpoRestV2InteractiveDocsUrl,
  getHarpoRestV2InteractiveDocsEntryFromEndpointId,
  openHarpoRestV2InteractiveDocsPlan
} from "./harpo-restv2-learning.js";
import { inferHarpoClientPlatform } from "./harpo-platform.js";

const HARPO_STORAGE_PREFIX = "harpo:";
const HARPO_THEME_RAMP_STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600];
const sharedDecodeHelpers = globalThis.AdobePassDecodeHelpers || {};

// ─── HARPO analysis annotations per call type ─────────────────────────────────

function buildAnnotations(entry, classification) {
  const annotations = [];
  const reqHeaders  = indexHeaders(entry?.request?.headers);
  const status      = entry?.response?.status || 0;

  if (classification.phase === "DCR") {
    if (classification.label.includes("Register")) {
      annotations.push({ key: "Purpose", value: "Obtain client_id + client_secret from software_statement." });
      annotations.push({ key: "Next step", value: "POST to /o/client/token to get Bearer access_token." });
    } else {
      annotations.push({ key: "Purpose", value: "Exchange client credentials for Bearer access_token used on all REST V2 calls." });
    }
    if (status === 400) annotations.push({ key: "⚠ 400", value: "Invalid software_statement or missing redirect_uri. Regenerate from TVE Dashboard." });
    if (status === 401) annotations.push({ key: "⚠ 401", value: "Access token expired. Re-run /o/client/token." });
  }

  if (classification.phase === "Config") {
    annotations.push({ key: "Purpose", value: "Load active MVPD list for this Service Provider. Used to populate the MVPD picker." });
    if (status === 401) annotations.push({ key: "⚠ 401", value: "DCR access_token missing or expired." });
  }

  if (classification.phase === "AuthN") {
    if (classification.label.includes("Partner")) {
      annotations.push({ key: "Purpose", value: "Ask Adobe Pass to translate partner framework state into the next partner SSO action." });
      annotations.push({ key: "Next step", value: "Inspect actionName/actionType and any returned request payload before deciding whether to authorize, resume, authenticate, or submit the partner response." });
    } else if (classification.label.includes("Create")) {
      annotations.push({ key: "Purpose", value: "Initiate auth session. Returns auth code + MVPD login URL." });
      if (reqHeaders["ap-device-identifier"]) annotations.push({ key: "Device ID", value: reqHeaders["ap-device-identifier"] });
    } else {
      annotations.push({ key: "Purpose", value: "Resume or poll existing auth session using the auth code." });
    }
  }

  if (classification.phase === "Profiles") {
    if (classification.label.includes("Partner")) {
      annotations.push({ key: "Purpose", value: "Submit the partner authentication response and retrieve the resulting Adobe Pass profile set." });
    } else {
      annotations.push({ key: "Purpose", value: "Check for valid authenticated profile. Non-empty response = user is authenticated." });
    }
    const notAfter = tryExtract(entry?.response, "notAfter");
    if (notAfter) annotations.push({ key: "Profile expires", value: new Date(Number(notAfter)).toISOString() });
  }

  if (classification.phase === "PreAuth") {
    annotations.push({ key: "Purpose", value: "Preflight check — determines which resources are accessible without a full AuthZ call." });
    annotations.push({ key: "Note", value: "authorized=false in response body is a per-resource denial, not an HTTP error." });
  }

  if (classification.phase === "AuthZ") {
    annotations.push({ key: "Purpose", value: "Full authorization. Returns short-lived media token when authorized=true." });
    const source = tryExtract(entry?.response, "source");
    if (source) annotations.push({ key: "Decision source", value: source + (source === "degradation" ? " ← ⚠ DEGRADATION ACTIVE" : source === "temppass" ? " ← TempPass" : "") });
  }

  if (classification.phase === "Logout") {
    annotations.push({ key: "Purpose", value: "Delete authenticated profile(s). May include redirect URL for MVPD-side logout." });
  }

  if (classification.phase === "IMS") {
    annotations.push({ key: "Note", value: "Adobe IMS call — credential exchange or token validation." });
  }

  if (classification.phase === "MVPD") {
    annotations.push({ key: "Note", value: "MVPD or external call triggered during the authentication/authorization flow." });
  }

  if (status >= 400) {
    const code   = tryExtract(entry?.response, "code");
    const action = tryExtract(entry?.response, "action");
    if (code)   annotations.push({ key: "Error code",       value: code   });
    if (action) annotations.push({ key: "Suggested action", value: action });
  }

  return annotations;
}

function tryExtract(responseEntry, field) {
  try {
    const text   = responseEntry?.content?.text || "";
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed[field] !== undefined) return String(parsed[field]);
    if (Array.isArray(parsed.decisions) && parsed.decisions[0]?.[field] !== undefined) {
      return String(parsed.decisions[0][field]);
    }
  } catch { }
  return null;
}

function indexHeaders(headers = []) {
  const map = {};
  (Array.isArray(headers) ? headers : []).forEach((h) => {
    if (h?.name) map[h.name.toLowerCase()] = h.value || "";
  });
  return map;
}

function getHeaderValue(headers = [], name) {
  return indexHeaders(headers)[String(name || "").toLowerCase()] || "";
}

function getHarpoEntryStartTimeMs(entry = null, fallbackOrder = 0) {
  const startedDateTime = String(entry?.startedDateTime || "").trim();
  const parsed = startedDateTime ? Date.parse(startedDateTime) : Number.NaN;
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return Number(fallbackOrder || 0);
}

function formatHarpoTimestamp(timestampMs = 0, { includeDate = false } = {}) {
  const safeTimestampMs = Number(timestampMs || 0);
  if (!Number.isFinite(safeTimestampMs) || safeTimestampMs <= 0) {
    return "Timestamp unavailable";
  }
  const options = includeDate
    ? {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3
      }
    : {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3
      };
  try {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(safeTimestampMs));
  } catch {
    return new Date(safeTimestampMs).toLocaleString();
  }
}

function formatHarpoSequence(sequence = 0) {
  const safeSequence = Math.max(0, Number(sequence || 0));
  return `#${String(safeSequence).padStart(3, "0")}`;
}

function getHarpoDisplayPath(url = "") {
  try {
    const parsedUrl = new URL(String(url || ""));
    return parsedUrl.pathname || parsedUrl.hostname || String(url || "");
  } catch {
    return String(url || "");
  }
}

function dedupeHarpoDomainBuckets(domains = []) {
  return [...new Set(
    (Array.isArray(domains) ? domains : [])
      .map((domain) => getHarpoTrafficDomainBucket(domain))
      .filter(Boolean)
  )];
}

function matchesHarpoDomainList(hostname = "", domains = []) {
  const normalizedHost = getHarpoTrafficHostname(hostname);
  if (!normalizedHost) return false;
  return (Array.isArray(domains) ? domains : []).some((domain) => {
    const normalizedDomain = getHarpoTrafficHostname(domain);
    if (!normalizedDomain) return false;
    return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
  });
}

function extractSamlMvpdDomains(entry) {
  const headerValues = [
    getHeaderValue(entry?.request?.headers || [], "origin"),
    getHeaderValue(entry?.request?.headers || [], "referer"),
    getHeaderValue(entry?.response?.headers || [], "access-control-allow-origin")
  ];
  return dedupeHarpoDomainBuckets(
    headerValues
      .flatMap((value) => String(value || "").split(","))
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .filter((value) => value !== "*")
      .filter((value) => {
        const hostname = getHarpoTrafficHostname(value);
        return hostname && !isHarpoAdobeTraffic(hostname) && !isSafeDomainHost(hostname);
      })
  );
}

function truncateMiddle(value, edge = 10) {
  const text = String(value || "");
  if (!text || text.length <= edge * 2 + 3) return text;
  return `${text.slice(0, edge)}...${text.slice(-edge)}`;
}

function safeDateString(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return String(value || "");
  try {
    return new Date(numeric).toISOString();
  } catch {
    return String(value || "");
  }
}

function parseHarpoUrlLike(rawValue = "", baseUrl = "") {
  const text = String(rawValue || "").trim();
  if (!text) return null;
  try {
    return new URL(text, baseUrl || undefined);
  } catch {
    return null;
  }
}

function isHarpoInternalHost(hostname = "") {
  const normalizedHost = getHarpoTrafficHostname(hostname);
  if (!normalizedHost) return false;
  return isHarpoAdobeTraffic(normalizedHost) || isSafeDomainHost(normalizedHost);
}

function getHarpoLookupValue(lookup = {}, keys = []) {
  const source = lookup && typeof lookup === "object" ? lookup : {};
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (!normalizedKey) continue;
    const value = source[normalizedKey];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function decodeHarpoBase64JsonObject(rawValue = "") {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  if (typeof sharedDecodeHelpers.inspectBase64Value === "function") {
    const inspection = sharedDecodeHelpers.inspectBase64Value(value);
    if (inspection?.decodedValue) {
      const parsed = tryParseJson(inspection.decodedValue);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }
  }
  const decoded = decodeBase64Text(sanitizeBase64Value(value));
  const parsed = tryParseJson(decoded);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function summarizeHarpoObjectFields(input = null, preferredKeys = []) {
  if (!input || typeof input !== "object") return "";
  const keys = Array.isArray(preferredKeys) && preferredKeys.length
    ? preferredKeys
    : Object.keys(input);
  const parts = [];
  keys.forEach((key) => {
    const value = input?.[key];
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      if (!value.length) return;
      parts.push(`${key}=${value.map((item) => String(item ?? "")).filter(Boolean).join(", ")}`);
      return;
    }
    if (typeof value === "object") return;
    parts.push(`${key}=${String(value)}`);
  });
  return parts.join(" | ");
}

function addHarpoUsageRow(rows = [], seen = new Set(), name = "", value = "", { truncate = 0 } = {}) {
  const normalizedName = String(name || "").trim();
  const rawValue = value === undefined || value === null ? "" : String(value).trim();
  if (!normalizedName || !rawValue) return;
  const finalValue = truncate > 0 ? truncateMiddle(rawValue, truncate) : rawValue;
  const dedupeKey = `${normalizedName.toLowerCase()}::${finalValue.toLowerCase()}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  rows.push({ name: normalizedName, value: finalValue });
}

function getHarpoObservedResources(harvest = null) {
  const requestJson = harvest?.requestJson && typeof harvest.requestJson === "object" ? harvest.requestJson : null;
  if (Array.isArray(requestJson?.resources)) {
    return requestJson.resources.map((value) => String(value || "").trim()).filter(Boolean);
  }
  const fallback = getHarpoLookupValue(harvest?.requestValues || {}, ["resources", "resource"]);
  if (!fallback) return [];
  const parsed = tryParseJson(fallback);
  if (Array.isArray(parsed)) {
    return parsed.map((value) => String(value || "").trim()).filter(Boolean);
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.resources)) {
    return parsed.resources.map((value) => String(value || "").trim()).filter(Boolean);
  }
  return fallback.split(",").map((value) => value.trim()).filter(Boolean);
}

function buildLegacySamlAssertionConsumerHeaderNotes(entry, formValues = {}) {
  const notes = [];
  const requestUrl = String(entry?.request?.url || "");
  const reqHeaders = indexHeaders(entry?.request?.headers);
  const respHeaders = indexHeaders(entry?.response?.headers);
  const refererUrl = parseHarpoUrlLike(reqHeaders.referer, requestUrl);
  const originUrl = parseHarpoUrlLike(reqHeaders.origin, requestUrl);
  const locationUrl = parseHarpoUrlLike(respHeaders.location, requestUrl);
  const headerMvpdDomains = extractSamlMvpdDomains(entry);
  const secFetchSite = String(reqHeaders["sec-fetch-site"] || "").trim();
  const secFetchMode = String(reqHeaders["sec-fetch-mode"] || "").trim();
  const secFetchDest = String(reqHeaders["sec-fetch-dest"] || "").trim();

  if (headerMvpdDomains.length) {
    notes.push(`Header-derived MVPD or external auth domains: ${headerMvpdDomains.join(", ")}.`);
  }

  if (locationUrl) {
    const locationHost = getHarpoTrafficHostname(locationUrl.hostname);
    const locationTarget = `${locationHost}${locationUrl.pathname || ""}`;
    if (locationHost && !isHarpoInternalHost(locationHost)) {
      notes.push(`Location header shows Adobe Pass handing the browser to the selected TV Provider or partner identity page at ${locationTarget}.`);
    } else if (locationHost && isSafeDomainHost(locationHost)) {
      notes.push(`Location header shows Adobe Pass returning the browser to the programmer domain at ${locationTarget}.`);
    } else if (locationHost) {
      notes.push(`Location header keeps the browser on Adobe-controlled infrastructure at ${locationTarget}.`);
    }
  }

  if (refererUrl) {
    const refererHost = getHarpoTrafficHostname(refererUrl.hostname);
    if (refererHost && !isHarpoInternalHost(refererHost)) {
      notes.push(`Referer indicates this request came back from ${refererHost}, so the MVPD or external identity provider just handed control to Adobe Pass.`);
    } else if (refererHost && isHarpoAdobeTraffic(refererHost)) {
      notes.push(`Referer shows Adobe Pass itself initiated this browser hop from ${refererHost}.`);
    }
  }

  if (originUrl) {
    const originHost = getHarpoTrafficHostname(originUrl.hostname);
    if (originHost && !isHarpoInternalHost(originHost)) {
      notes.push(`Origin indicates the posted assertion originated from ${originHost}.`);
    }
  }

  if (reqHeaders.cookie) {
    notes.push("Request cookies show this browser hop is attached to an existing Adobe Pass session state.");
  }

  if (respHeaders["set-cookie"]) {
    notes.push("Response Set-Cookie shows Adobe Pass is updating browser session state for the next handoff step.");
  }

  if (secFetchSite || secFetchMode || secFetchDest) {
    notes.push(`Fetch metadata says site=${secFetchSite || "n/a"}, mode=${secFetchMode || "n/a"}, dest=${secFetchDest || "n/a"}.`);
  }

  if (formValues.samlresponse) {
    notes.push("SAMLResponse is present, which means Adobe Pass is consuming the returning MVPD assertion on this hop instead of sending the user out.");
  }

  if (formValues.relaystate) {
    notes.push(`RelayState traveled with the handoff: ${truncateMiddle(formValues.relaystate, 18)}.`);
  }

  return notes;
}

function getRequestQueryPairs(entry) {
  const pairs = Array.isArray(entry?.request?.queryString) ? entry.request.queryString : [];
  if (pairs.length) {
    return pairs.map((pair) => ({
      name: pair?.name || "",
      value: pair?.value || ""
    }));
  }
  try {
    const url = new URL(entry?.request?.url || "");
    return [...url.searchParams.entries()].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function tryParseJson(text) {
  if (typeof sharedDecodeHelpers.tryParseJson === "function") {
    return sharedDecodeHelpers.tryParseJson(text, null);
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeContentType(contentType = "") {
  return String(contentType || "").split(";")[0].trim().toLowerCase();
}

function isJsonContentType(contentType = "") {
  const normalized = normalizeContentType(contentType);
  return normalized === "application/json" || normalized.endsWith("+json");
}

function isXmlLikeContentType(contentType = "") {
  const normalized = normalizeContentType(contentType);
  return normalized === "application/xml" ||
    normalized === "text/xml" ||
    normalized === "application/xhtml+xml" ||
    normalized === "text/html" ||
    normalized.endsWith("+xml");
}

function isUrlEncodedContentType(contentType = "") {
  return normalizeContentType(contentType) === "application/x-www-form-urlencoded";
}

function isTextualContentType(contentType = "") {
  const normalized = normalizeContentType(contentType);
  if (!normalized) return false;
  return normalized.startsWith("text/") ||
    normalized.includes("javascript") ||
    normalized.includes("ecmascript") ||
    normalized.includes("graphql") ||
    isJsonContentType(normalized) ||
    isXmlLikeContentType(normalized) ||
    isUrlEncodedContentType(normalized);
}

function prettyPrintJson(text) {
  if (typeof sharedDecodeHelpers.prettyPrintJson === "function") {
    return sharedDecodeHelpers.prettyPrintJson(text);
  }
  const parsed = tryParseJson(text);
  return parsed === null ? text : JSON.stringify(parsed, null, 2);
}

function prettyPrintXml(text) {
  if (typeof sharedDecodeHelpers.prettyPrintXml === "function") {
    return sharedDecodeHelpers.prettyPrintXml(text);
  }
  const normalized = String(text || "").trim().replace(/>\s*</g, ">\n<");
  if (!normalized) return "";
  const lines = normalized.split("\n");
  let depth = 0;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (/^<\//.test(trimmed)) {
      depth = Math.max(depth - 1, 0);
    }
    const formatted = `${"  ".repeat(depth)}${trimmed}`;
    if (/^<[^!?/][^>]*[^/]>\s*$/.test(trimmed) && !trimmed.includes("</")) {
      depth += 1;
    }
    return formatted;
  }).join("\n");
}

function decodeHtmlEntities(text) {
  if (typeof sharedDecodeHelpers.decodeHtmlEntities === "function") {
    return sharedDecodeHelpers.decodeHtmlEntities(text);
  }
  const value = String(text || "");
  if (!value || typeof DOMParser !== "function") return value;
  try {
    const doc = new DOMParser().parseFromString(`<!doctype html><body>${value}`, "text/html");
    return doc.body?.textContent || value;
  } catch {
    return value;
  }
}

function decodeBase64Text(text) {
  if (typeof sharedDecodeHelpers.decodeBase64Binary === "function") {
    return sharedDecodeHelpers.decodeBase64Binary(text);
  }
  if (!text || typeof atob !== "function") return "";
  try {
    return atob(text);
  } catch {
    return "";
  }
}

function binaryStringToUint8Array(text = "") {
  return Uint8Array.from(String(text || ""), (char) => char.charCodeAt(0));
}

function sanitizeBase64Value(text = "") {
  if (typeof sharedDecodeHelpers.sanitizeBase64Value === "function") {
    return sharedDecodeHelpers.sanitizeBase64Value(text);
  }
  const normalized = String(text || "").trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) return "";
  const remainder = normalized.length % 4;
  return remainder === 0 ? normalized : `${normalized}${"=".repeat(4 - remainder)}`;
}

function tryDecodeURIComponentValue(text = "") {
  if (typeof sharedDecodeHelpers.tryDecodeURIComponentValue === "function") {
    return sharedDecodeHelpers.tryDecodeURIComponentValue(text);
  }
  const value = String(text || "");
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function looksLikeSamlXml(text = "") {
  if (typeof sharedDecodeHelpers.looksLikeSamlXml === "function") {
    return sharedDecodeHelpers.looksLikeSamlXml(text);
  }
  const value = String(text || "").trim();
  if (!value.startsWith("<")) return false;
  return /<(?:\w+:)?(?:AuthnRequest|Response|Assertion|LogoutRequest|LogoutResponse|ArtifactResolve|EntityDescriptor|EntitiesDescriptor)\b/i.test(value) ||
    /urn:oasis:names:tc:SAML/i.test(value);
}

function isSamlFieldName(name = "") {
  if (typeof sharedDecodeHelpers.isSamlFieldName === "function") {
    return sharedDecodeHelpers.isSamlFieldName(name);
  }
  return /(saml|wresult)/i.test(String(name || ""));
}

function isSamlSupportFieldName(name = "") {
  if (typeof sharedDecodeHelpers.isSamlSupportFieldName === "function") {
    return sharedDecodeHelpers.isSamlSupportFieldName(name);
  }
  return /^(RelayState|SigAlg|Signature|SAMLEncoding|KeyInfo|wa|wctx|wreply|wtrealm)$/i.test(String(name || ""));
}

function getSamlSupportingFields(originName, pairs = []) {
  if (typeof sharedDecodeHelpers.getSamlSupportingFields === "function") {
    return sharedDecodeHelpers.getSamlSupportingFields(originName, pairs);
  }
  const useWsFedSupport = /^wresult$/i.test(String(originName || ""));
  return (Array.isArray(pairs) ? pairs : []).filter((pair) => {
    const name = String(pair?.name || "");
    if (!name) return false;
    if (name === originName) return false;
    if (useWsFedSupport) {
      return /^(wa|wctx|wreply|wtrealm)$/i.test(name);
    }
    return /^(RelayState|SigAlg|Signature|SAMLEncoding|KeyInfo)$/i.test(name);
  });
}

function extractHtmlFormPairs(text = "") {
  if (typeof sharedDecodeHelpers.extractHtmlFormPairs === "function") {
    return sharedDecodeHelpers.extractHtmlFormPairs(text);
  }
  if (!text || typeof DOMParser !== "function") return [];
  try {
    const doc = new DOMParser().parseFromString(text, "text/html");
    return [...doc.querySelectorAll("input[name], textarea[name], select[name]")]
      .map((field) => ({
        name: field.getAttribute("name") || "",
        value: field.getAttribute("value") ?? field.textContent ?? ""
      }))
      .filter((pair) => pair.name);
  } catch {
    return [];
  }
}

function extractJsonFieldPairs(text = "") {
  if (typeof sharedDecodeHelpers.extractJsonFieldPairs === "function") {
    return sharedDecodeHelpers.extractJsonFieldPairs(text);
  }
  const parsed = tryParseJson(text);
  if (parsed === null) return [];

  const pairs = [];
  const visit = (value, keyPath = "", depth = 0) => {
    if (depth > 6) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, keyPath ? `${keyPath}[${index}]` : `[${index}]`, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, child]) => {
        const nextPath = keyPath ? `${keyPath}.${key}` : key;
        visit(child, nextPath, depth + 1);
      });
      return;
    }
    if (typeof value !== "string") return;
    if (!keyPath) return;
    if (isSamlFieldName(keyPath) || isSamlSupportFieldName(keyPath) || /(saml|oasis:names:tc:SAML)/i.test(value)) {
      pairs.push({ name: keyPath, value });
    }
  };

  visit(parsed);
  return pairs;
}

function extractPayloadFieldPairs(text = "", contentType = "") {
  if (typeof sharedDecodeHelpers.extractPayloadFieldPairs === "function") {
    return sharedDecodeHelpers.extractPayloadFieldPairs(text, contentType);
  }
  const bodyText = String(text || "");
  const normalizedType = normalizeContentType(contentType);
  if (!bodyText) return [];

  if (isUrlEncodedContentType(normalizedType)) {
    return [...new URLSearchParams(bodyText).entries()].map(([name, value]) => ({ name, value }));
  }

  if (isJsonContentType(normalizedType) || /^\s*[\[{]/.test(bodyText)) {
    return extractJsonFieldPairs(bodyText);
  }

  if (normalizedType === "text/html" || /<form\b/i.test(bodyText) || /<(?:input|textarea|select)\b/i.test(bodyText)) {
    return extractHtmlFormPairs(bodyText);
  }

  return [];
}

async function inflateBytes(bytes, format) {
  if (typeof sharedDecodeHelpers.inflateBytes === "function") {
    return sharedDecodeHelpers.inflateBytes(bytes, format);
  }
  if (!bytes?.length || typeof DecompressionStream !== "function") return "";
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    const buffer = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(buffer);
  } catch {
    return "";
  }
}

function buildSamlDecodeMethod(decodeHint = "", finalStep = "") {
  const steps = [];
  const normalizedHint = String(decodeHint || "").trim();
  const normalizedFinalStep = String(finalStep || "").trim();
  if (normalizedHint && normalizedHint !== "original") {
    steps.push(normalizedHint);
  }
  if (normalizedFinalStep) {
    steps.push(normalizedFinalStep);
  }
  return steps.join(" + ") || "raw XML";
}

async function decodeSamlValue(fieldName = "", rawValue = "") {
  if (typeof sharedDecodeHelpers.decodeSamlValue === "function") {
    return sharedDecodeHelpers.decodeSamlValue(fieldName, rawValue);
  }
  const value = String(rawValue || "").trim();
  if (!value) return null;

  const candidates = [];
  const pushCandidate = (candidate, decodeHint = "") => {
    const text = String(candidate || "").trim();
    if (!text) return;
    if (candidates.some((item) => item.text === text)) return;
    candidates.push({ text, decodeHint });
  };

  pushCandidate(value, "original");
  pushCandidate(decodeHtmlEntities(value), "html-entity decode");
  pushCandidate(tryDecodeURIComponentValue(value), "URL decode");

  for (const candidate of candidates) {
    if (looksLikeSamlXml(candidate.text)) {
      return {
        decodedXml: prettyPrintXml(candidate.text),
        decodeMethod: candidate.decodeHint === "original" ? "raw XML" : (candidate.decodeHint || "raw XML")
      };
    }
  }

  for (const candidate of candidates) {
    const binary = decodeBase64Text(sanitizeBase64Value(candidate.text));
    if (!binary) continue;
    const directText = decodeHtmlEntities(binary);
    if (looksLikeSamlXml(directText)) {
      return {
        decodedXml: prettyPrintXml(directText),
        decodeMethod: buildSamlDecodeMethod(candidate.decodeHint, "base64 decode")
      };
    }

    const bytes = binaryStringToUint8Array(binary);
    const inflatedRaw = await inflateBytes(bytes, "deflate-raw");
    if (looksLikeSamlXml(inflatedRaw)) {
      return {
        decodedXml: prettyPrintXml(inflatedRaw),
        decodeMethod: buildSamlDecodeMethod(candidate.decodeHint, "base64 decode + DEFLATE")
      };
    }

    const inflated = await inflateBytes(bytes, "deflate");
    if (looksLikeSamlXml(inflated)) {
      return {
        decodedXml: prettyPrintXml(inflated),
        decodeMethod: buildSamlDecodeMethod(candidate.decodeHint, "base64 decode + zlib inflate")
      };
    }
  }

  if (isSamlFieldName(fieldName) && /%3C|<\??xml|<saml/i.test(value)) {
    const decoded = decodeHtmlEntities(tryDecodeURIComponentValue(value) || value);
    if (looksLikeSamlXml(decoded)) {
      return {
        decodedXml: prettyPrintXml(decoded),
        decodeMethod: "URL decode"
      };
    }
  }

  return null;
}

function buildJwtDecodedMessage(match) {
  const inspection = match?.inspection || {};
  const summary = inspection?.summary || {};
  const summaryCards = [
    ["Algorithm", summary.algorithm],
    ["Issuer", summary.issuer],
    ["Subject", summary.subject],
    ["Audience", summary.audience],
    ["Client ID", summary.clientId],
    ["Expires", summary.expiresAt]
  ].filter(([, value]) => String(value || "").trim());

  return `
    <article class="harpo-samlMessage">
      <div class="harpo-samlMessage-header">
        <span class="harpo-samlFieldName">${escHtml(match.originName)}</span>
        <span class="harpo-samlDecodeMethod">JWT</span>
      </div>
      <div class="harpo-samlLabel">Original Value</div>
      <pre class="harpo-bodyViewer">${escHtml(match.originValue)}</pre>
      <div class="harpo-samlLabel">Token</div>
      <pre class="harpo-bodyViewer">${escHtml(match.token || "")}</pre>
      ${summaryCards.length ? `
        <div class="harpo-samlLabel">Decoded Summary</div>
        ${buildNameValueTable(summaryCards.map(([name, value]) => ({ name, value })))}
      ` : ""}
      <div class="harpo-samlLabel">Decoded Header</div>
      <pre class="harpo-bodyViewer">${escHtml(prettyPrintJson(JSON.stringify(inspection.header || {})))}</pre>
      <div class="harpo-samlLabel">Decoded Payload</div>
      <pre class="harpo-bodyViewer">${escHtml(prettyPrintJson(JSON.stringify(inspection.payload || {})))}</pre>
    </article>
  `;
}

function buildBase64DecodedMessage(match) {
  const inspection = match?.inspection || {};
  const formatLabel =
    inspection.decodedFormat === "json"
      ? "JSON"
      : inspection.decodedFormat === "xml"
        ? "XML / HTML"
        : "Text";

  return `
    <article class="harpo-samlMessage">
      <div class="harpo-samlMessage-header">
        <span class="harpo-samlFieldName">${escHtml(match.originName)}</span>
        <span class="harpo-samlDecodeMethod">Base64</span>
      </div>
      <div class="harpo-samlLabel">Original Value</div>
      <pre class="harpo-bodyViewer">${escHtml(match.originValue)}</pre>
      <div class="harpo-samlLabel">Decoded Summary</div>
      ${buildNameValueTable([
        { name: "Format", value: formatLabel },
        { name: "Characters", value: String(inspection.characterCount || 0) },
        { name: "Decode State", value: "Decoded locally" }
      ])}
      <div class="harpo-samlLabel">Decoded Value</div>
      <pre class="harpo-bodyViewer${inspection.decodedFormat === "xml" ? " harpo-bodyViewer--xml" : ""}">${escHtml(String(inspection.displayValue || "").trim())}</pre>
    </article>
  `;
}

function extractJwtMatches(options = {}) {
  if (typeof sharedDecodeHelpers.extractJwtMatches === "function") {
    return sharedDecodeHelpers.extractJwtMatches(options);
  }
  return [];
}

function extractBase64Matches(options = {}) {
  if (typeof sharedDecodeHelpers.extractBase64Matches === "function") {
    return sharedDecodeHelpers.extractBase64Matches(options);
  }
  return [];
}

async function extractSamlMatches(options = {}) {
  if (typeof sharedDecodeHelpers.extractSamlMatches === "function") {
    return sharedDecodeHelpers.extractSamlMatches(options);
  }
  return [];
}

function buildSamlDecodedMessage(match) {
  const supportFields = Array.isArray(match?.supportingFields) && match.supportingFields.length
    ? match.supportingFields
    : getSamlSupportingFields(match.originName, match.contextPairs);
  return `
    <article class="harpo-samlMessage">
      <div class="harpo-samlMessage-header">
        <span class="harpo-samlFieldName">${escHtml(match.originName)}</span>
        <span class="harpo-samlDecodeMethod">${escHtml(match.decodeMethod)}</span>
      </div>
      <div class="harpo-samlLabel">Original Value</div>
      <pre class="harpo-bodyViewer">${escHtml(match.originValue)}</pre>
      ${supportFields.length ? `
        <div class="harpo-samlLabel">Supporting Fields</div>
        ${buildNameValueTable(supportFields)}
      ` : ""}
      <div class="harpo-samlLabel">Decoded XML</div>
      <pre class="harpo-bodyViewer harpo-bodyViewer--xml">${escHtml(match.decodedXml)}</pre>
    </article>
  `;
}

async function buildSamlInspectorMarkup({ sourceLabel = "", pairs = [], rawText = "", rawFieldName = "raw-body" } = {}) {
  const matches = await extractSamlMatches({ pairs, rawText, rawFieldName });
  if (!matches.length) return "";
  return buildDetailSubsection(
    "SAML Inspector",
    `<div class="harpo-samlMessages">${matches.map(buildSamlDecodedMessage).join("")}</div>`,
    `${matches.length} decoded message${matches.length === 1 ? "" : "s"} from ${escHtml(sourceLabel || "payload")}`
  );
}

function buildJwtInspectorMarkup({ sourceLabel = "", pairs = [], rawText = "", rawFieldName = "raw-body" } = {}) {
  const matches = extractJwtMatches({ pairs, rawText, rawFieldName });
  if (!matches.length) return "";
  return buildDetailSubsection(
    "JWT Inspector",
    `<div class="harpo-samlMessages">${matches.map(buildJwtDecodedMessage).join("")}</div>`,
    `${matches.length} decoded token${matches.length === 1 ? "" : "s"} from ${escHtml(sourceLabel || "payload")}`
  );
}

function buildBase64InspectorMarkup({ sourceLabel = "", pairs = [], rawText = "", rawFieldName = "raw-body" } = {}) {
  const matches = extractBase64Matches({ pairs, rawText, rawFieldName });
  if (!matches.length) return "";
  return buildDetailSubsection(
    "Base64 Inspector",
    `<div class="harpo-samlMessages">${matches.map(buildBase64DecodedMessage).join("")}</div>`,
    `${matches.length} decoded value${matches.length === 1 ? "" : "s"} from ${escHtml(sourceLabel || "payload")}`
  );
}

function buildNameValueTable(rows = [], emptyMessage = "Nothing recorded.") {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) {
    return `<p class="harpo-detailEmptyNote">${escHtml(emptyMessage)}</p>`;
  }
  return `<table class="harpo-kv-table">${
    safeRows.map((row) => `<tr><td>${escHtml(row?.name || "")}</td><td>${escHtml(row?.value || "")}</td></tr>`).join("")
  }</table>`;
}

function buildDetailSubsection(title, body, meta = "") {
  return `
    <section class="harpo-detailSubsection">
      <div class="harpo-detailSubsection-header">
        <span class="harpo-detailSubsection-title">${escHtml(title)}</span>
        ${meta ? `<span class="harpo-detailSubsection-meta">${meta}</span>` : ""}
      </div>
      <div class="harpo-detailSubsection-body">${body}</div>
    </section>
  `;
}

function buildPayloadMetaBadges({ contentType = "", encoding = "", size = 0, decoded = false, sizeLabel = "bytes" }) {
  const badges = [];
  if (contentType) badges.push(`<span class="harpo-payloadBadge">${escHtml(normalizeContentType(contentType))}</span>`);
  if (Number.isFinite(size) && size > 0) badges.push(`<span class="harpo-payloadMetaItem">${escHtml(`${size} ${sizeLabel}`)}</span>`);
  if (encoding) badges.push(`<span class="harpo-payloadMetaItem">${escHtml(`encoding: ${encoding}`)}</span>`);
  if (decoded) badges.push(`<span class="harpo-payloadMetaItem">decoded</span>`);
  return badges.join("");
}

function getDecodedPayloadText({ rawText = "", contentType = "", encoding = "" } = {}) {
  const normalizedType = normalizeContentType(contentType);
  const decodedText = encoding === "base64" && isTextualContentType(normalizedType)
    ? decodeBase64Text(rawText)
    : rawText;
  const decoded = encoding === "base64" && Boolean(decodedText);
  return {
    normalizedType,
    decoded,
    bodyText: decoded ? decodedText : rawText
  };
}

function buildPayloadViewer({ rawText = "", contentType = "", encoding = "", size = 0, sizeLabel = "bytes", emptyMessage = "No body recorded." }) {
  const { normalizedType, decoded, bodyText } = getDecodedPayloadText({ rawText, contentType, encoding });

  if (!bodyText) {
    if (encoding === "base64" && !isTextualContentType(normalizedType)) {
      return {
        hasBody: true,
        meta: buildPayloadMetaBadges({ contentType, encoding, size, sizeLabel }),
        bodyText,
        normalizedType,
        html: `<div class="harpo-payloadNotice">Binary response captured as base64. HARPO is preserving the payload metadata instead of dumping unreadable bytes.</div>`
      };
    }
    return {
      hasBody: false,
      meta: buildPayloadMetaBadges({ contentType, encoding, size, decoded, sizeLabel }),
      bodyText,
      normalizedType,
      html: `<p class="harpo-detailEmptyNote">${escHtml(emptyMessage)}</p>`
    };
  }

  if (isJsonContentType(normalizedType) || tryParseJson(bodyText) !== null) {
    return {
      hasBody: true,
      meta: buildPayloadMetaBadges({ contentType: normalizedType || "application/json", encoding, size, decoded }),
      bodyText,
      normalizedType,
      html: `<pre class="harpo-bodyViewer">${escHtml(prettyPrintJson(bodyText))}</pre>`
    };
  }

  if (isUrlEncodedContentType(normalizedType)) {
    const pairs = [...new URLSearchParams(bodyText).entries()].map(([name, value]) => ({ name, value }));
    return {
      hasBody: true,
      meta: buildPayloadMetaBadges({ contentType: normalizedType, encoding, size, decoded }),
      bodyText,
      normalizedType,
      html: `
        ${buildNameValueTable(pairs, "No form parameters were recorded.")}
        <pre class="harpo-bodyViewer">${escHtml(bodyText)}</pre>
      `
    };
  }

  if (isXmlLikeContentType(normalizedType) || /^\s*</.test(bodyText)) {
    return {
      hasBody: true,
      meta: buildPayloadMetaBadges({ contentType: normalizedType || "text/xml", encoding, size, decoded }),
      bodyText,
      normalizedType,
      html: `<pre class="harpo-bodyViewer">${escHtml(prettyPrintXml(bodyText))}</pre>`
    };
  }

  return {
    hasBody: true,
    meta: buildPayloadMetaBadges({ contentType: normalizedType || "text/plain", encoding, size, decoded }),
    bodyText,
    normalizedType,
    html: `<pre class="harpo-bodyViewer">${escHtml(bodyText)}</pre>`
  };
}

function getFormPairs(entry) {
  const params = Array.isArray(entry?.request?.postData?.params) ? entry.request.postData.params : [];
  if (params.length) {
    return params.map((param) => ({
      name: param?.name || "",
      value: param?.value || param?.fileName || param?.contentType || ""
    }));
  }
  const contentType = entry?.request?.postData?.mimeType || getHeaderValue(entry?.request?.headers || [], "content-type");
  const rawText = entry?.request?.postData?.text || "";
  if (rawText && isUrlEncodedContentType(contentType)) {
    return [...new URLSearchParams(rawText).entries()].map(([name, value]) => ({ name, value }));
  }
  return [];
}

function buildHarpoPairLookup(pairs = []) {
  return Object.fromEntries(
    (Array.isArray(pairs) ? pairs : [])
      .map((pair) => [String(pair?.name || "").trim().toLowerCase(), String(pair?.value || "").trim()])
      .filter(([key]) => key)
  );
}

async function buildRequestContentsBody(entry) {
  const request = entry?.request || {};
  const queryPairs = getRequestQueryPairs(entry);
  const formPairs = getFormPairs(entry);
  const rawBody = request?.postData?.text || "";
  const contentType = request?.postData?.mimeType || getHeaderValue(request?.headers || [], "content-type");
  const sections = [];

  if (queryPairs.length) {
    sections.push(buildDetailSubsection("Query String", buildNameValueTable(queryPairs), `${queryPairs.length} pair${queryPairs.length === 1 ? "" : "s"}`));
    const queryJwtMarkup = buildJwtInspectorMarkup({
      sourceLabel: "request query string",
      pairs: queryPairs
    });
    if (queryJwtMarkup) sections.push(queryJwtMarkup);
    const queryBase64Markup = buildBase64InspectorMarkup({
      sourceLabel: "request query string",
      pairs: queryPairs
    });
    if (queryBase64Markup) sections.push(queryBase64Markup);
    const querySamlMarkup = await buildSamlInspectorMarkup({
      sourceLabel: "request query string",
      pairs: queryPairs
    });
    if (querySamlMarkup) sections.push(querySamlMarkup);
  }

  if (formPairs.length) {
    sections.push(buildDetailSubsection("Form Fields", buildNameValueTable(formPairs), `${formPairs.length} field${formPairs.length === 1 ? "" : "s"}`));
    const formJwtMarkup = buildJwtInspectorMarkup({
      sourceLabel: "request form fields",
      pairs: formPairs
    });
    if (formJwtMarkup) sections.push(formJwtMarkup);
    const formBase64Markup = buildBase64InspectorMarkup({
      sourceLabel: "request form fields",
      pairs: formPairs
    });
    if (formBase64Markup) sections.push(formBase64Markup);
    const formSamlMarkup = await buildSamlInspectorMarkup({
      sourceLabel: "request form fields",
      pairs: formPairs
    });
    if (formSamlMarkup) sections.push(formSamlMarkup);
  }

  const shouldRenderRawBody = Boolean(rawBody) && !(isUrlEncodedContentType(contentType) && formPairs.length);
  if (shouldRenderRawBody) {
    const payload = buildPayloadViewer({
      rawText: rawBody,
      contentType,
      size: rawBody.length,
      emptyMessage: "No raw request body was recorded."
    });
    sections.push(buildDetailSubsection("Request Body", `${payload.meta ? `<div class="harpo-payloadMeta">${payload.meta}</div>` : ""}${payload.html}`));
    const bodyJwtMarkup = buildJwtInspectorMarkup({
      sourceLabel: "request body",
      pairs: extractPayloadFieldPairs(payload.bodyText || "", payload.normalizedType || contentType),
      rawText: payload.bodyText || rawBody,
      rawFieldName: "request-body"
    });
    if (bodyJwtMarkup) sections.push(bodyJwtMarkup);
    const bodyBase64Markup = buildBase64InspectorMarkup({
      sourceLabel: "request body",
      pairs: extractPayloadFieldPairs(payload.bodyText || "", payload.normalizedType || contentType),
      rawText: payload.bodyText || rawBody,
      rawFieldName: "request-body"
    });
    if (bodyBase64Markup) sections.push(bodyBase64Markup);
    const bodySamlMarkup = await buildSamlInspectorMarkup({
      sourceLabel: "request body",
      pairs: extractPayloadFieldPairs(payload.bodyText || "", payload.normalizedType || contentType),
      rawText: payload.bodyText || rawBody,
      rawFieldName: "request-body"
    });
    if (bodySamlMarkup) sections.push(bodySamlMarkup);
  }

  if (!sections.length) {
    return "";
  }

  return sections.join("");
}

async function extractResponsePayload(entry) {
  const content = entry?.response?.content || {};
  const headers = entry?.response?.headers || [];
  const contentType = content?.mimeType || getHeaderValue(headers, "content-type");
  const responseBodyText = String(content?.text || "");
  const responseBodySize = Number(content?.size || 0);
  const payload = buildPayloadViewer({
    rawText: responseBodyText,
    contentType,
    encoding: content?.encoding || "",
    size: responseBodySize,
    sizeLabel: responseBodyText ? "bytes" : "wire bytes",
    emptyMessage: "No response body recorded."
  });
  if (!payload.hasBody) {
    const comment = String(content?.comment || "").trim();
    if (comment) {
      payload.html = `<div class="harpo-payloadNotice">${escHtml(comment)}</div>`;
      payload.hasBody = true;
      return payload;
    }
    if (responseBodySize > 0) {
      payload.html = `<div class="harpo-payloadNotice">${escHtml(`Chrome reported ${responseBodySize} wire bytes, but no readable response body was recorded.`)}</div>`;
      payload.hasBody = true;
      return payload;
    }
  }
  payload.samlMarkup = await buildSamlInspectorMarkup({
    sourceLabel: payload.normalizedType === "text/html" ? "response HTML form" : "response body",
    pairs: extractPayloadFieldPairs(payload.bodyText || "", payload.normalizedType || contentType),
    rawText: payload.bodyText || "",
    rawFieldName: "response-body"
  });
  payload.jwtMarkup = buildJwtInspectorMarkup({
    sourceLabel: "response body",
    pairs: extractPayloadFieldPairs(payload.bodyText || "", payload.normalizedType || contentType),
    rawText: payload.bodyText || "",
    rawFieldName: "response-body"
  });
  payload.base64Markup = buildBase64InspectorMarkup({
    sourceLabel: "response body",
    pairs: extractPayloadFieldPairs(payload.bodyText || "", payload.normalizedType || contentType),
    rawText: payload.bodyText || "",
    rawFieldName: "response-body"
  });
  return payload;
}

function collectHarpoAnalysisContext(entry, responsePayload = null) {
  const requestHeaders = Array.isArray(entry?.request?.headers) ? entry.request.headers : [];
  const responseHeaders = Array.isArray(entry?.response?.headers) ? entry.response.headers : [];
  const reqHeaders = indexHeaders(requestHeaders);
  const respHeaders = indexHeaders(responseHeaders);
  const requestUrl = String(entry?.request?.url || "").trim();
  const requestUrlObject = parseHarpoUrlLike(requestUrl);
  const queryPairs = getRequestQueryPairs(entry);
  const formPairs = getFormPairs(entry);
  const requestContentType = entry?.request?.postData?.mimeType || getHeaderValue(requestHeaders, "content-type");
  const requestRawText = String(entry?.request?.postData?.text || "");
  const requestPayload = requestRawText
    ? buildPayloadViewer({
        rawText: requestRawText,
        contentType: requestContentType,
        size: requestRawText.length,
        emptyMessage: "No raw request body was recorded."
      })
    : { bodyText: "", normalizedType: normalizeContentType(requestContentType), meta: "", hasBody: false };
  const requestPayloadPairs = extractPayloadFieldPairs(
    requestPayload.bodyText || requestRawText,
    requestPayload.normalizedType || requestContentType
  );
  const responsePayloadPairs = extractPayloadFieldPairs(
    responsePayload?.bodyText || "",
    responsePayload?.normalizedType || entry?.response?.content?.mimeType || getHeaderValue(responseHeaders, "content-type")
  );
  const harvestedPairs = [
    ...queryPairs,
    ...formPairs,
    ...requestPayloadPairs,
    ...responsePayloadPairs
  ];
  const queryValues = buildHarpoPairLookup(queryPairs);
  const requestValues = buildHarpoPairLookup([...queryPairs, ...formPairs, ...requestPayloadPairs]);
  const redirectUrlRaw = getHarpoLookupValue(
    requestValues,
    ["redirect_url", "redirecturl", "redirect-url", "requestorRedirectUrl"]
  );
  const redirectUrl = parseHarpoUrlLike(redirectUrlRaw, requestUrl);
  const redirectPairs = redirectUrl
    ? [...redirectUrl.searchParams.entries()].map(([name, value]) => ({ name, value }))
    : [];
  const redirectValues = buildHarpoPairLookup(redirectPairs);

  return {
    requestHeaders,
    responseHeaders,
    reqHeaders,
    respHeaders,
    requestUrl,
    requestUrlObject,
    queryPairs,
    formPairs,
    requestPayload,
    responsePayload,
    requestPayloadPairs,
    responsePayloadPairs,
    queryValues,
    requestRawText,
    requestJson: tryParseJson(requestPayload.bodyText || requestRawText),
    requestValues,
    responseValues: buildHarpoPairLookup(responsePayloadPairs),
    harvestedValues: buildHarpoPairLookup(harvestedPairs),
    responseJson: tryParseJson(responsePayload?.bodyText || "") || getJsonBodyFromResponse(entry),
    redirectUrl,
    redirectPairs,
    redirectValues,
    locationUrl: parseHarpoUrlLike(respHeaders.location, entry?.request?.url || ""),
    refererUrl: parseHarpoUrlLike(reqHeaders.referer, entry?.request?.url || ""),
    originUrl: parseHarpoUrlLike(reqHeaders.origin, entry?.request?.url || ""),
    headerMvpdDomains: extractSamlMvpdDomains(entry)
  };
}

function getJsonBodyFromResponse(entry) {
  const content = entry?.response?.content || {};
  const contentType = content?.mimeType || getHeaderValue(entry?.response?.headers || [], "content-type");
  const rawText = content?.encoding === "base64" && isTextualContentType(contentType)
    ? decodeBase64Text(content?.text || "")
    : (content?.text || "");
  return tryParseJson(rawText);
}

function buildPassUsageSummary(entry, classification, harvest = null) {
  const pass = classification?.pass || {};
  const queryValues = harvest?.queryValues || {};
  const requestValues = harvest?.requestValues || {};
  const reqHeaders = harvest?.reqHeaders || indexHeaders(entry?.request?.headers);
  const responseJson = harvest?.responseJson || getJsonBodyFromResponse(entry);
  const resources = getHarpoObservedResources(harvest);
  const requestorId = getHarpoLookupValue(queryValues, ["requestor_id", "requestorId"]) ||
    getHarpoLookupValue(requestValues, ["requestor_id", "requestorId"]) ||
    String(pass?.params?.serviceProvider || pass?.params?.requestorId || "").trim();
  const mvpd = getHarpoLookupValue(queryValues, ["mso_id"]) ||
    getHarpoLookupValue(requestValues, ["mvpd", "mso_id", "provider"]) ||
    String(pass?.params?.mvpd || "").trim();
  const domainName = getHarpoLookupValue(queryValues, ["domain_name"]) ||
    getHarpoLookupValue(requestValues, ["domainname", "domain_name"]) ||
    "";
  const redirectUrl = harvest?.redirectUrl;
  const redirectTarget = redirectUrl ? `${redirectUrl.hostname}${redirectUrl.pathname}` : "";
  const actionName = String(responseJson?.actionName || "").trim();
  const actionType = String(responseJson?.actionType || "").trim();
  const locationTarget = harvest?.locationUrl ? `${harvest.locationUrl.hostname}${harvest.locationUrl.pathname}` : "";
  const partner = String(pass?.params?.partner || "").trim();
  const code = String(pass?.params?.code || getHarpoLookupValue(queryValues, ["reg_code", "code"]) || "").trim();

  if (pass?.endpointId === "legacy-v1-authenticate") {
    const fragments = [
      requestorId ? `for RequestorId ${requestorId}` : "",
      mvpd ? `with MVPD ${mvpd}` : "",
      domainName ? `on domain ${domainName}` : "",
      code ? `using registration code ${code}` : ""
    ].filter(Boolean);
    const callbackText = redirectTarget ? ` Callback returns to ${redirectTarget}.` : "";
    return fragments.length
      ? `Adobe Pass is bootstrapping the legacy second-screen authentication flow ${fragments.join(" ")}.${callbackText}`.trim()
      : "Adobe Pass is bootstrapping the legacy second-screen authentication flow.";
  }

  if (pass?.endpointId === "system-sp-saml-assertion-consumer") {
    if (getHarpoLookupValue(requestValues, ["samlresponse"])) {
      const source = harvest?.refererUrl ? getHarpoTrafficHostname(harvest.refererUrl.hostname) : "";
      return source
        ? `Adobe Pass is consuming the returning MVPD SAML assertion from ${source} and continuing the browser handoff back into Pass-controlled flow state.`
        : "Adobe Pass is consuming the returning MVPD SAML assertion and continuing the browser handoff back into Pass-controlled flow state.";
    }
    if (locationTarget && !isHarpoInternalHost(harvest?.locationUrl?.hostname || "")) {
      return `Adobe Pass is sending the browser to the selected TV Provider at ${locationTarget}.`;
    }
    if (locationTarget && isSafeDomainHost(harvest?.locationUrl?.hostname || "")) {
      return `Adobe Pass is returning the browser from system SAML handling back to the programmer at ${locationTarget}.`;
    }
    return "Adobe Pass is brokering the browser handoff between the programmer, Adobe Pass, and the selected TV Provider.";
  }

  if (pass?.family === "rest-v2") {
    if (pass?.endpointId === "rest-v2-configuration") {
      return requestorId
        ? `Adobe Pass is returning the live service-provider configuration for ${requestorId}, including domain and MVPD footprint.`
        : "Adobe Pass is returning the live service-provider configuration.";
    }
    if (classification?.phase === "AuthN") {
      const fragments = [
        requestorId ? `service provider ${requestorId}` : "",
        pass?.params?.code ? `code ${pass.params.code}` : "",
        mvpd ? `MVPD ${mvpd}` : "",
        domainName ? `domain ${domainName}` : "",
        partner ? `partner ${partner}` : ""
      ].filter(Boolean);
      const actionText = actionName || actionType ? ` Adobe returned ${[actionName, actionType].filter(Boolean).join(" / ")} as the next step.` : "";
      return fragments.length
        ? `Adobe Pass is executing the REST V2 authentication flow for ${fragments.join(", ")}.${actionText}`.trim()
        : "Adobe Pass is executing the REST V2 authentication flow.";
    }
    if (classification?.phase === "Profiles") {
      const target = mvpd ? ` for MVPD ${mvpd}` : pass?.params?.code ? ` for code ${pass.params.code}` : "";
      return `Adobe Pass is reading profile state${target}.`;
    }
    if (classification?.phase === "PreAuth" || classification?.phase === "AuthZ") {
      const resourceText = resources.length ? ` across ${resources.length} resource${resources.length === 1 ? "" : "s"}` : "";
      const mvpdText = mvpd ? ` for MVPD ${mvpd}` : "";
      return `Adobe Pass is evaluating entitlement${resourceText}${mvpdText}.`;
    }
    if (classification?.phase === "Logout") {
      return mvpd
        ? `Adobe Pass is tearing down the profile and logout path for MVPD ${mvpd}.`
        : "Adobe Pass is tearing down profile state and any MVPD logout continuation.";
    }
  }

  return "";
}

function buildPassObservedUsageRows(entry, classification, harvest = null) {
  const pass = classification?.pass || {};
  const queryValues = harvest?.queryValues || {};
  const requestValues = harvest?.requestValues || {};
  const responseJson = harvest?.responseJson || getJsonBodyFromResponse(entry);
  const reqHeaders = harvest?.reqHeaders || indexHeaders(entry?.request?.headers);
  const respHeaders = harvest?.respHeaders || indexHeaders(entry?.response?.headers);
  const rows = [];
  const seen = new Set();
  const requestorId = getHarpoLookupValue(queryValues, ["requestor_id", "requestorId"]) ||
    getHarpoLookupValue(requestValues, ["requestor_id", "requestorId"]) ||
    String(pass?.params?.serviceProvider || pass?.params?.requestorId || "").trim();
  const regCode = getHarpoLookupValue(queryValues, ["reg_code"]) || getHarpoLookupValue(requestValues, ["reg_code"]) || String(pass?.params?.code || "").trim();
  const mvpd = getHarpoLookupValue(queryValues, ["mso_id"]) ||
    getHarpoLookupValue(requestValues, ["mvpd", "mso_id", "provider"]) ||
    String(pass?.params?.mvpd || "").trim();
  const domainName = getHarpoLookupValue(queryValues, ["domain_name"]) ||
    getHarpoLookupValue(requestValues, ["domainname", "domain_name"]);
  const redirectUrlRaw = String(harvest?.redirectUrl?.href || "").trim() ||
    getHarpoLookupValue(queryValues, ["redirect_url"]) ||
    getHarpoLookupValue(requestValues, ["redirecturl", "redirect_url"]);
  const resources = getHarpoObservedResources(harvest);
  const callbackDeviceInfo = decodeHarpoBase64JsonObject(getHarpoLookupValue(harvest?.redirectValues || {}, ["deviceinfo"]));
  const requestDeviceInfo = decodeHarpoBase64JsonObject(reqHeaders["x-device-info"]);
  const partnerFrameworkStatusDetails = decodeHarpoBase64JsonObject(reqHeaders["ap-partner-framework-status"]);
  const observedClientPlatform = inferHarpoClientPlatform({
    userAgent: reqHeaders["user-agent"],
    requestUrl: entry?.request?.url || "",
    requestValues,
    queryValues,
    requestDeviceInfo,
    callbackDeviceInfo,
    partnerFrameworkStatusDetails
  });

  addHarpoUsageRow(rows, seen, "RequestorId", requestorId);
  addHarpoUsageRow(rows, seen, "Registration code", regCode);
  addHarpoUsageRow(rows, seen, "Authentication code", String(pass?.params?.code || "").trim());
  addHarpoUsageRow(rows, seen, "Selected MVPD", mvpd);
  addHarpoUsageRow(rows, seen, "Channel domain", domainName);
  addHarpoUsageRow(rows, seen, "Redirect URL", redirectUrlRaw, { truncate: 22 });
  if (harvest?.redirectUrl) {
    addHarpoUsageRow(rows, seen, "Redirect target", `${harvest.redirectUrl.hostname}${harvest.redirectUrl.pathname}`);
  }
  addHarpoUsageRow(rows, seen, "Callback deviceId", getHarpoLookupValue(harvest?.redirectValues || {}, ["deviceid"]));
  addHarpoUsageRow(
    rows,
    seen,
    "Callback deviceInfo",
    summarizeHarpoObjectFields(callbackDeviceInfo, ["model", "osName", "type", "platform", "browser"])
  );
  addHarpoUsageRow(rows, seen, "Observed client platform", observedClientPlatform.label);
  addHarpoUsageRow(rows, seen, "Legacy noflash", getHarpoLookupValue(queryValues, ["noflash"]));
  addHarpoUsageRow(rows, seen, "Legacy no_iframe", getHarpoLookupValue(queryValues, ["no_iframe"]));
  addHarpoUsageRow(rows, seen, "Service provider", String(pass?.params?.serviceProvider || "").trim());
  addHarpoUsageRow(rows, seen, "Partner", String(pass?.params?.partner || "").trim());
  addHarpoUsageRow(rows, seen, "Device identifier", reqHeaders["ap-device-identifier"], { truncate: 18 });
  addHarpoUsageRow(rows, seen, "Visitor identifier", reqHeaders["ap-visitor-identifier"], { truncate: 18 });
  addHarpoUsageRow(
    rows,
    seen,
    "Device info header",
    summarizeHarpoObjectFields(requestDeviceInfo, ["model", "deviceType", "platform", "operatingSystem", "browser"])
  );
  addHarpoUsageRow(rows, seen, "Partner framework status", summarizeDecodedBase64Payload(
    reqHeaders["ap-partner-framework-status"],
    "AP-Partner-Framework-Status",
    ["accountProviderIdentifier", "frameworkPermissionInfo", "platformMappingId", "expirationDate"]
  ).replace(/^AP-Partner-Framework-Status decodes as Base64 JSON with keys: [^.]+\.\s*/i, ""));
  addHarpoUsageRow(rows, seen, "Submitted RelayState", getHarpoLookupValue(requestValues, ["relaystate"]), { truncate: 18 });
  addHarpoUsageRow(rows, seen, "Submitted SAMLResponse", getHarpoLookupValue(requestValues, ["samlresponse"]) ? "Present in request body" : "");
  if (resources.length) {
    addHarpoUsageRow(rows, seen, "Requested resources", resources.join(", "));
  }
  addHarpoUsageRow(rows, seen, "Next Adobe action", [responseJson?.actionName, responseJson?.actionType].filter(Boolean).join(" / "));
  if (Array.isArray(responseJson?.missingParameters) && responseJson.missingParameters.length) {
    addHarpoUsageRow(rows, seen, "Missing parameters", responseJson.missingParameters.join(", "));
  }
  addHarpoUsageRow(rows, seen, "Decision source", String(responseJson?.source || responseJson?.decisions?.[0]?.source || "").trim());
  addHarpoUsageRow(rows, seen, "Authorized", responseJson?.authorized !== undefined ? String(responseJson.authorized) : "");
  addHarpoUsageRow(rows, seen, "TempPass", responseJson?.isTempPass !== undefined ? String(responseJson.isTempPass) : "");
  if (harvest?.locationUrl) {
    addHarpoUsageRow(rows, seen, "Browser redirect", `${harvest.locationUrl.hostname}${harvest.locationUrl.pathname}`);
  }
  if (harvest?.headerMvpdDomains?.length) {
    addHarpoUsageRow(rows, seen, "Detected MVPD auth domains", harvest.headerMvpdDomains.join(", "));
  }

  if (pass?.endpointId === "system-sp-saml-assertion-consumer") {
    const refererUrl = harvest?.refererUrl || null;
    const originUrl = harvest?.originUrl || null;
    const locationUrl = harvest?.locationUrl || null;
    const secFetchSite = String(reqHeaders["sec-fetch-site"] || "").trim();
    const secFetchMode = String(reqHeaders["sec-fetch-mode"] || "").trim();
    const secFetchDest = String(reqHeaders["sec-fetch-dest"] || "").trim();
    const handoffLeg = getHarpoLookupValue(requestValues, ["samlresponse"])
      ? "Returning MVPD assertion leg"
      : locationUrl && !isHarpoInternalHost(locationUrl.hostname || "")
        ? "Outbound redirect to MVPD"
        : locationUrl && isSafeDomainHost(locationUrl.hostname || "")
          ? "Return to programmer"
          : "Adobe Pass system handoff";

    addHarpoUsageRow(rows, seen, "System handoff leg", handoffLeg);
    addHarpoUsageRow(rows, seen, "Request Referer", refererUrl ? `${refererUrl.hostname}${refererUrl.pathname}` : "");
    addHarpoUsageRow(rows, seen, "Request Origin", originUrl ? `${originUrl.hostname}${originUrl.pathname}` : "");
    addHarpoUsageRow(rows, seen, "Response Location", locationUrl ? `${locationUrl.hostname}${locationUrl.pathname}` : "");
    addHarpoUsageRow(rows, seen, "Adobe Pass cookies", reqHeaders.cookie ? "Present on request" : "");
    addHarpoUsageRow(rows, seen, "Adobe Pass Set-Cookie", respHeaders["set-cookie"] ? "Present on response" : "");
    addHarpoUsageRow(rows, seen, "Fetch metadata", [secFetchSite, secFetchMode, secFetchDest].filter(Boolean).length
      ? `site=${secFetchSite || "n/a"}, mode=${secFetchMode || "n/a"}, dest=${secFetchDest || "n/a"}`
      : "");
  }

  return rows;
}

function buildHarpoRestV2LearningPlan(entry, classification, harvest = null) {
  const pass = classification?.pass || {};
  const docsEntry = getHarpoRestV2InteractiveDocsEntryFromEndpointId(pass?.endpointId || "");
  if (!docsEntry) return null;

  const reqHeaders = harvest?.reqHeaders || indexHeaders(entry?.request?.headers);
  const queryValues = harvest?.queryValues || {};
  const requestValues = harvest?.requestValues || {};
  const requestUrlObject = harvest?.requestUrlObject || parseHarpoUrlLike(entry?.request?.url || "");
  const resources = getHarpoObservedResources(harvest);
  const fieldValues = {
    server: requestUrlObject ? `${requestUrlObject.protocol}//${requestUrlObject.host}` : "https://sp.auth.adobe.com",
    "path.serviceProvider": String(pass?.params?.serviceProvider || pass?.params?.requestorId || "").trim(),
    "header.Accept": String(reqHeaders.accept || "application/json").trim() || "application/json",
    "header.User-Agent": String(reqHeaders["user-agent"] || (typeof navigator !== "undefined" ? navigator.userAgent : "HARPO")).trim()
  };
  const requiredFields = ["path.serviceProvider"];
  const notes = [];

  if (docsEntry.requiresAccessToken !== false) {
    fieldValues["header.Authorization"] = String(reqHeaders.authorization || "").trim();
    requiredFields.push("header.Authorization");
  }
  if (docsEntry.usesDeviceHeaders === true) {
    fieldValues["header.AP-Device-Identifier"] = String(reqHeaders["ap-device-identifier"] || "").trim();
    fieldValues["header.X-Device-Info"] = String(reqHeaders["x-device-info"] || "").trim();
  }
  if (docsEntry.usesAdobeSubjectToken === true) {
    fieldValues["header.Adobe-Subject-Token"] = String(reqHeaders["adobe-subject-token"] || "").trim();
  }
  if (docsEntry.usesAdServiceToken === true) {
    fieldValues["header.AD-Service-Token"] = String(reqHeaders["ad-service-token"] || "").trim();
  }
  if (docsEntry.usesTempPassIdentity === true) {
    fieldValues["header.AP-Temppass-Identity"] = String(reqHeaders["ap-temppass-identity"] || reqHeaders["ap-temp-pass-identity"] || "").trim();
  }
  if (docsEntry.usesVisitorIdentifier === true) {
    fieldValues["header.AP-Visitor-Identifier"] = String(reqHeaders["ap-visitor-identifier"] || "").trim();
  }
  if (docsEntry.usesPartnerFrameworkStatus === true) {
    fieldValues["header.AP-Partner-Framework-Status"] = String(reqHeaders["ap-partner-framework-status"] || "").trim();
    if (docsEntry.requirePartnerFrameworkStatus === true) {
      requiredFields.push("header.AP-Partner-Framework-Status");
    }
  }
  if (docsEntry.contentType) {
    fieldValues["header.Content-Type"] = String(reqHeaders["content-type"] || docsEntry.contentType).trim();
  }
  if (docsEntry.usesSessionCode === true) {
    fieldValues["path.code"] = String(pass?.params?.code || getHarpoLookupValue(queryValues, ["code", "reg_code"]) || "").trim();
    if (docsEntry.requireSessionCode === true) {
      requiredFields.push("path.code");
    }
  }
  if (docsEntry.usesMvpdPath === true) {
    fieldValues["path.mvpd"] = String(pass?.params?.mvpd || getHarpoLookupValue(requestValues, ["mvpd"]) || "").trim();
    if (docsEntry.requireMvpdPath === true) {
      requiredFields.push("path.mvpd");
    }
  }
  if (docsEntry.usesPartnerPath === true) {
    fieldValues["path.partner"] = String(pass?.params?.partner || "").trim();
    if (docsEntry.requirePartnerPath === true) {
      requiredFields.push("path.partner");
    }
  }
  if (docsEntry.usesBodyMvpd === true) {
    fieldValues["body.mvpd"] = getHarpoLookupValue(requestValues, ["mvpd", "mso_id"]);
  }
  if (docsEntry.usesBodyDomainName === true) {
    fieldValues["body.domainName"] = getHarpoLookupValue(requestValues, ["domainname", "domain_name"]);
    if (docsEntry.requireBodyDomainName === true) {
      requiredFields.push("body.domainName");
    }
  }
  if (docsEntry.usesBodyRedirectUrl === true) {
    fieldValues["body.redirectUrl"] = String(harvest?.redirectUrl?.href || "").trim() || getHarpoLookupValue(requestValues, ["redirecturl", "redirect_url"]);
    if (docsEntry.requireBodyRedirectUrl === true) {
      requiredFields.push("body.redirectUrl");
    }
  }
  if (docsEntry.usesQueryRedirectUrl === true) {
    fieldValues["query.redirectUrl"] = String(harvest?.redirectUrl?.href || "").trim() || getHarpoLookupValue(queryValues, ["redirect_url"]);
  }
  if (docsEntry.usesBodyResources === true) {
    fieldValues["body.resources"] = resources;
    if (docsEntry.requireBodyResources === true) {
      requiredFields.push("body.resources");
    }
  }
  if (docsEntry.usesBodySamlResponse === true) {
    fieldValues["body.SAMLResponse"] = getHarpoLookupValue(requestValues, ["samlresponse"]);
    if (docsEntry.requireBodySamlResponse === true) {
      requiredFields.push("body.SAMLResponse");
    }
  }

  const normalizedFieldValues = Object.entries(fieldValues).reduce((result, [key, value]) => {
    if (Array.isArray(value)) {
      if (value.length) {
        result[key] = value.slice();
      }
      return result;
    }
    const normalizedValue = String(value || "").trim();
    if (normalizedValue) {
      result[key] = normalizedValue;
    }
    return result;
  }, {});

  const missingRequiredFields = requiredFields.filter((fieldName) => {
    if (!fieldName) return false;
    if (!Object.prototype.hasOwnProperty.call(normalizedFieldValues, fieldName)) {
      return true;
    }
    const value = normalizedFieldValues[fieldName];
    return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
  });

  if (missingRequiredFields.length) {
    notes.push(`Freshen ${missingRequiredFields.join(", ")} before Send.`);
  } else {
    notes.push("HARPO can hydrate the Adobe Pass REST V2 Run form directly from this captured call.");
  }

  return {
    kind: "rest-v2",
    productLabel: "REST V2",
    learningLabel: "LEARN THIS REST V2 CALL",
    entryKey: docsEntry.key,
    label: docsEntry.label,
    docsUrl: buildHarpoRestV2InteractiveDocsUrl(docsEntry.operationAnchor || ""),
    operationId: String(docsEntry.operationId || "").trim(),
    operationAnchor: String(docsEntry.operationAnchor || "").trim(),
    fieldValues: normalizedFieldValues,
    requiredFields,
    missingRequiredFields,
    clearFieldNames: [],
    notes
  };
}

function buildHarpoDcrLearningPlan(entry, classification, harvest = null) {
  const pass = classification?.pass || {};
  const docsEntry = getHarpoDcrInteractiveDocsEntryFromEndpointId(pass?.endpointId || "");
  if (!docsEntry) return null;

  const reqHeaders = harvest?.reqHeaders || indexHeaders(entry?.request?.headers);
  const queryValues = harvest?.queryValues || {};
  const requestValues = harvest?.requestValues || {};
  const requestJson = harvest?.requestJson && typeof harvest.requestJson === "object" ? harvest.requestJson : {};
  const requestUrlObject = harvest?.requestUrlObject || parseHarpoUrlLike(entry?.request?.url || "");
  const fieldValues = {
    server: requestUrlObject ? `${requestUrlObject.protocol}//${requestUrlObject.host}` : "https://sp.auth.adobe.com",
    "header.Accept": String(reqHeaders.accept || "application/json").trim() || "application/json",
    "header.User-Agent": String(reqHeaders["user-agent"] || (typeof navigator !== "undefined" ? navigator.userAgent : "HARPO")).trim()
  };
  const requiredFields = [];
  const notes = [];

  if (docsEntry.contentType) {
    fieldValues["header.Content-Type"] = String(reqHeaders["content-type"] || docsEntry.contentType).trim();
  }
  if (docsEntry.usesDeviceHeaders === true) {
    fieldValues["header.AP-Device-Identifier"] = String(reqHeaders["ap-device-identifier"] || "").trim();
    fieldValues["header.X-Device-Info"] = String(reqHeaders["x-device-info"] || "").trim();
  }
  if (docsEntry.usesBodySoftwareStatement === true) {
    fieldValues["body.software_statement"] = String(
      getHarpoLookupValue(requestValues, ["software_statement"]) || requestJson?.software_statement || ""
    ).trim();
    if (docsEntry.requireBodySoftwareStatement === true) {
      requiredFields.push("body.software_statement");
    }
  }
  if (docsEntry.usesBodyRedirectUri === true) {
    fieldValues["body.redirect_uri"] = String(
      getHarpoLookupValue(requestValues, ["redirect_uri", "redirectUri"]) || requestJson?.redirect_uri || requestJson?.redirectUri || ""
    ).trim();
    if (docsEntry.requireBodyRedirectUri === true) {
      requiredFields.push("body.redirect_uri");
    }
  }
  if (docsEntry.usesQueryClientId === true) {
    fieldValues["query.client_id"] = String(
      getHarpoLookupValue(queryValues, ["client_id"]) || getHarpoLookupValue(requestValues, ["client_id"]) || requestJson?.client_id || ""
    ).trim();
    if (docsEntry.requireQueryClientId === true) {
      requiredFields.push("query.client_id");
    }
  }
  if (docsEntry.usesQueryClientSecret === true) {
    fieldValues["query.client_secret"] = String(
      getHarpoLookupValue(queryValues, ["client_secret"]) || getHarpoLookupValue(requestValues, ["client_secret"]) || requestJson?.client_secret || ""
    ).trim();
    if (docsEntry.requireQueryClientSecret === true) {
      requiredFields.push("query.client_secret");
    }
  }
  if (docsEntry.usesQueryRefreshToken === true) {
    fieldValues["query.refresh_token"] = String(
      getHarpoLookupValue(queryValues, ["refresh_token"]) || getHarpoLookupValue(requestValues, ["refresh_token"]) || requestJson?.refresh_token || ""
    ).trim();
  }

  const normalizedFieldValues = Object.entries(fieldValues).reduce((result, [key, value]) => {
    if (Array.isArray(value)) {
      if (value.length) {
        result[key] = value.slice();
      }
      return result;
    }
    const normalizedValue = String(value || "").trim();
    if (normalizedValue) {
      result[key] = normalizedValue;
    }
    return result;
  }, {});

  const missingRequiredFields = requiredFields.filter((fieldName) => {
    if (!fieldName) return false;
    if (!Object.prototype.hasOwnProperty.call(normalizedFieldValues, fieldName)) {
      return true;
    }
    return !String(normalizedFieldValues[fieldName] || "").trim();
  });

  if (missingRequiredFields.length) {
    notes.push(`Freshen ${missingRequiredFields.join(", ")} before Send.`);
  } else {
    notes.push("HARPO can hydrate the Adobe Pass DCR Run form directly from this captured call.");
  }

  return {
    kind: "dcr",
    productLabel: "DCR",
    learningLabel: String(docsEntry.learningLabel || "LEARN THIS DCR CALL").trim(),
    entryKey: docsEntry.key,
    label: docsEntry.label,
    docsUrl: buildHarpoDcrInteractiveDocsUrl(docsEntry.operationAnchor || ""),
    operationId: String(docsEntry.operationId || "").trim(),
    operationAnchor: String(docsEntry.operationAnchor || "").trim(),
    fieldValues: normalizedFieldValues,
    requiredFields,
    missingRequiredFields,
    clearFieldNames: [],
    notes
  };
}

function buildHarpoPassLearningPlan(entry, classification, harvest = null) {
  const family = String(classification?.pass?.family || "").trim();
  if (family === "rest-v2") {
    return buildHarpoRestV2LearningPlan(entry, classification, harvest);
  }
  if (family === "dcr-v2") {
    return buildHarpoDcrLearningPlan(entry, classification, harvest);
  }
  return null;
}

function buildHarpoLearningStatusMessage(plan = null, stage = "ready", unresolved = []) {
  const productLabel = String(plan?.productLabel || "interactive docs").trim();
  if (stage === "opening") {
    return `Opening Adobe Pass ${productLabel} interactive docs and hydrating the Run form from this HAR call...`;
  }
  if (stage === "success") {
    return `Adobe Pass ${productLabel} interactive docs opened with this call hydrated into the Run form.`;
  }
  if (stage === "partial") {
    const pending = Array.isArray(unresolved) ? unresolved.filter(Boolean) : [];
    return pending.length
      ? `Docs opened. HARPO filled what it could; freshen ${pending.join(", ")} before Send.`
      : `Docs opened. HARPO partially hydrated the ${productLabel} Run form from this HAR call.`;
  }
  return `HARPO can open the Adobe Pass ${productLabel} interactive docs and hydrate the Run form from this exact call.`;
}

function summarizeDecodedBase64Payload(rawValue = "", label = "", interestingKeys = []) {
  if (typeof sharedDecodeHelpers.inspectBase64Value !== "function") {
    return "";
  }
  const inspection = sharedDecodeHelpers.inspectBase64Value(rawValue);
  if (!inspection?.decodedValue) {
    return "";
  }
  const parsed = tryParseJson(inspection.decodedValue);
  if (!parsed || typeof parsed !== "object") {
    return `${label} decodes as Base64 ${inspection.decodedFormat}.`;
  }
  const keys = Object.keys(parsed);
  const highlights = (Array.isArray(interestingKeys) ? interestingKeys : [])
    .map((key) => [key, findFirstObjectValueByKey(parsed, key)])
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${truncateMiddle(value, 18)}`);
  return `${label} decodes as Base64 JSON with keys: ${keys.join(", ")}.${highlights.length ? ` ${highlights.join(" | ")}.` : ""}`;
}

function summarizeJwtPayload(rawValue = "", label = "") {
  if (typeof sharedDecodeHelpers.decodeJwtToken !== "function") {
    return "";
  }
  const inspection = sharedDecodeHelpers.decodeJwtToken(rawValue);
  if (!inspection?.valid) {
    return "";
  }
  const summary = inspection.summary || {};
  const parts = [
    summary.issuer ? `issuer=${summary.issuer}` : "",
    summary.subject ? `subject=${truncateMiddle(summary.subject, 18)}` : "",
    summary.clientId ? `clientId=${summary.clientId}` : "",
    summary.audience ? `aud=${truncateMiddle(summary.audience, 18)}` : "",
    summary.expiresAt ? `expires=${summary.expiresAt}` : ""
  ].filter(Boolean);
  return `${label} decodes as JWT.${parts.length ? ` ${parts.join(" | ")}.` : ""}`;
}

function findFirstObjectValueByKey(input, keyName = "", seen = new Set()) {
  const normalizedKey = String(keyName || "").trim().toLowerCase();
  if (!normalizedKey || !input || typeof input !== "object") {
    return "";
  }
  if (seen.has(input)) {
    return "";
  }
  seen.add(input);
  if (Array.isArray(input)) {
    for (const value of input) {
      const match = findFirstObjectValueByKey(value, normalizedKey, seen);
      if (match) {
        return match;
      }
    }
    return "";
  }
  for (const [key, value] of Object.entries(input)) {
    if (String(key || "").trim().toLowerCase() === normalizedKey) {
      if (value === null || value === undefined) {
        return "";
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      try {
        return JSON.stringify(value);
      } catch {
        return "";
      }
    }
  }
  for (const value of Object.values(input)) {
    const match = findFirstObjectValueByKey(value, normalizedKey, seen);
    if (match) {
      return match;
    }
  }
  return "";
}

function buildPassRuntimeNotes(entry, classification, harvest = null) {
  const notes = [];
  const reqHeaders = harvest?.reqHeaders || indexHeaders(entry?.request?.headers);
  const respHeaders = harvest?.respHeaders || indexHeaders(entry?.response?.headers);
  const responseJson = harvest?.responseJson || getJsonBodyFromResponse(entry);
  const formPairs = harvest?.formPairs || getFormPairs(entry);
  const formValues = harvest?.requestValues || buildHarpoPairLookup(formPairs);
  const pass = classification?.pass || {};
  const status = Number(entry?.response?.status || 0);

  if (pass?.params?.serviceProvider) {
    notes.push(`Service provider in path: ${pass.params.serviceProvider}.`);
  }
  if (pass?.params?.requestorId) {
    notes.push(`Legacy requestor in path: ${pass.params.requestorId}.`);
  }
  if (pass?.params?.mvpd) {
    notes.push(`MVPD in path: ${pass.params.mvpd}.`);
  }
  if (pass?.params?.partner) {
    notes.push(`Partner in path: ${pass.params.partner}.`);
  }
  if (pass?.params?.code) {
    notes.push(`Authentication code carried in the path: ${truncateMiddle(pass.params.code)}.`);
  }

  if (pass?.family === "rest-v2" && !reqHeaders.authorization) {
    notes.push("REST API V2 normally expects an Authorization bearer token, but this request did not record one.");
  }
  if (reqHeaders.authorization) {
    notes.push(`Authorization header present (${reqHeaders.authorization.toLowerCase().startsWith("bearer ") ? "Bearer token" : "custom scheme"}).`);
  }
  if (reqHeaders["user-agent"]) {
    notes.push(`User-Agent sent: ${truncateMiddle(reqHeaders["user-agent"], 32)}.`);
  }
  if (reqHeaders["ap-device-identifier"]) {
    notes.push(`AP-Device-Identifier was sent: ${truncateMiddle(reqHeaders["ap-device-identifier"])}`);
  }
  if (reqHeaders["x-device-info"]) {
    const deviceInfoSummary = summarizeDecodedBase64Payload(
      reqHeaders["x-device-info"],
      "X-Device-Info",
      ["type", "deviceType", "model", "platform", "platformCategory", "browser", "operatingSystem"]
    );
    notes.push(deviceInfoSummary || "X-Device-Info was sent, so the request carried explicit device metadata for Adobe Pass.");
  }
  if (reqHeaders["ap-visitor-identifier"]) {
    notes.push(`AP-Visitor-Identifier was sent: ${truncateMiddle(reqHeaders["ap-visitor-identifier"])}`);
  }
  if (reqHeaders["ad-service-token"]) {
    const serviceTokenSummary = summarizeJwtPayload(reqHeaders["ad-service-token"], "AD-Service-Token");
    notes.push(serviceTokenSummary || `AD-Service-Token was sent: ${truncateMiddle(reqHeaders["ad-service-token"])}`);
  }
  if (reqHeaders["adobe-subject-token"]) {
    const subjectTokenSummary = summarizeJwtPayload(reqHeaders["adobe-subject-token"], "Adobe-Subject-Token");
    notes.push(subjectTokenSummary || `Adobe-Subject-Token was sent: ${truncateMiddle(reqHeaders["adobe-subject-token"])}`);
  }
  if (reqHeaders["ap-partner-framework-status"]) {
    const partnerStatusSummary = summarizeDecodedBase64Payload(
      reqHeaders["ap-partner-framework-status"],
      "AP-Partner-Framework-Status",
      ["frameworkPermissionInfo", "accountProviderIdentifier", "platformMappingId", "authenticationExpirationDate", "expirationDate"]
    );
    notes.push(partnerStatusSummary || "AP-Partner-Framework-Status was sent for a documented partner SSO flow.");
  }
  if (reqHeaders["x-roku-reserved-roku-connect-token"]) {
    const rokuTokenSummary = summarizeJwtPayload(
      reqHeaders["x-roku-reserved-roku-connect-token"],
      "X-Roku-Reserved-Roku-Connect-Token"
    );
    notes.push(rokuTokenSummary || `X-Roku-Reserved-Roku-Connect-Token was sent: ${truncateMiddle(reqHeaders["x-roku-reserved-roku-connect-token"])}`);
  }
  if (reqHeaders["x-forwarded-for"]) {
    notes.push(`X-Forwarded-For was present, which is recommended when the programmer service calls REST API V2 on behalf of a device.`);
  }
  if (reqHeaders["ap-temppass-identity"]) {
    notes.push(`AP-TempPass-Identity was present, so this call is participating in a TempPass or promotional TempPass flow.`);
  }
  if (formValues.mvpd) {
    notes.push(`Request body MVPD=${formValues.mvpd}.`);
  }
  if (formValues.domainname) {
    notes.push(`Request body domainName=${formValues.domainname}.`);
  }
  if (formValues.redirecturl) {
    notes.push(`Request body redirectUrl=${truncateMiddle(formValues.redirecturl, 28)}.`);
  }
  if (formValues.samlresponse) {
    notes.push("Request body includes SAMLResponse, which is the documented partner authentication response field for partner profile creation.");
  }
  if (formValues.relaystate) {
    notes.push(`Request body relayState=${truncateMiddle(formValues.relaystate, 18)}.`);
  }

  if (status >= 400) {
    notes.push(`HTTP ${status} means the network call failed at transport level, so inspect the response payload for Adobe-specific code, action, or message fields.`);
  }

  if (harvest?.responsePayload?.meta && harvest.responsePayload.hasBody) {
    notes.push(`Response payload metadata: ${harvest.responsePayload.meta.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}.`);
  }

  if (respHeaders.location) {
    const locationUrl = harvest?.locationUrl || parseHarpoUrlLike(respHeaders.location, entry?.request?.url || "");
    if (locationUrl) {
      notes.push(`Response redirects to ${locationUrl.hostname}${locationUrl.pathname}.`);
    } else {
      notes.push("Response includes a Location header, which means the browser is being redirected to the next authentication step.");
    }
  }

  if (responseJson && typeof responseJson === "object") {
    if (responseJson.actionName) {
      notes.push(`Adobe Pass returned actionName=${responseJson.actionName}, which is the next runtime instruction from the control plane.`);
    }
    if (responseJson.actionType) {
      notes.push(`Adobe Pass returned actionType=${responseJson.actionType}.`);
    }
    if (responseJson.reasonType) {
      notes.push(`Adobe Pass returned reasonType=${responseJson.reasonType}.`);
    }
    if (Array.isArray(responseJson.missingParameters) && responseJson.missingParameters.length) {
      notes.push(`Session is still waiting for missingParameters: ${responseJson.missingParameters.join(", ")}.`);
    }
    if (responseJson.sessionId) {
      notes.push(`Session identifier: ${truncateMiddle(responseJson.sessionId, 18)}.`);
    }
    if (responseJson.url) {
      try {
        const nextUrl = new URL(responseJson.url);
        notes.push(`Response body points to next URL ${nextUrl.hostname}${nextUrl.pathname}.`);
      } catch {
        notes.push(`Response body included next URL ${truncateMiddle(responseJson.url, 28)}.`);
      }
    }
    if (responseJson.authorized !== undefined) {
      notes.push(`Authorization decision: authorized=${String(responseJson.authorized)}.`);
    }
    if (responseJson.authenticationRequest && typeof responseJson.authenticationRequest === "object") {
      const requestType = responseJson.authenticationRequest.type ? ` type=${responseJson.authenticationRequest.type}` : "";
      const attributeNames = Array.isArray(responseJson.authenticationRequest.attributesNames)
        ? responseJson.authenticationRequest.attributesNames
        : [];
      notes.push(`authenticationRequest object present.${requestType}${attributeNames.length ? ` attributes=${attributeNames.join(", ")}` : ""}`);
    }
    if (Array.isArray(responseJson.decisions) && responseJson.decisions.length) {
      notes.push(`Response contains ${responseJson.decisions.length} decision record${responseJson.decisions.length === 1 ? "" : "s"}.`);
      const firstDecision = responseJson.decisions[0];
      if (firstDecision?.source) {
        const sourceNote = firstDecision.source === "degradation"
          ? "degradation is active, so Adobe returned a fallback decision source."
          : firstDecision.source === "temppass"
            ? "TempPass supplied the entitlement."
            : `decision source is ${firstDecision.source}.`;
        notes.push(`First decision source: ${sourceNote}`);
      }
      if (firstDecision?.authorized !== undefined) {
        notes.push(`First decision authorized=${String(firstDecision.authorized)}.`);
      }
    }
    if (responseJson.source) {
      notes.push(`Response source=${responseJson.source}.`);
    }
    if (responseJson.code) {
      notes.push(`Adobe-specific code=${responseJson.code}.`);
    }
    if (responseJson.action) {
      notes.push(`Suggested follow-up action=${responseJson.action}.`);
    }
    if (responseJson.message) {
      notes.push(`Adobe message: ${responseJson.message}`);
    }
    if (responseJson.description) {
      notes.push(`Description: ${responseJson.description}`);
    }
    if (responseJson.notAfter) {
      notes.push(`Profile expiry (notAfter): ${safeDateString(responseJson.notAfter)}.`);
    }
    if (responseJson.expiresIn) {
      notes.push(`expiresIn=${responseJson.expiresIn}.`);
    }
    if (responseJson.type) {
      notes.push(`Profile or token type=${responseJson.type}.`);
    }
    if (responseJson.isTempPass !== undefined) {
      notes.push(`isTempPass=${String(responseJson.isTempPass)}.`);
    }
    if (responseJson.attributes && typeof responseJson.attributes === "object") {
      const attributeKeys = Object.keys(responseJson.attributes);
      if (attributeKeys.length) {
        notes.push(`Profile attributes returned: ${attributeKeys.join(", ")}.`);
      }
    }
    if (responseJson.profiles && typeof responseJson.profiles === "object") {
      const profileKeys = Object.keys(responseJson.profiles);
      notes.push(`Response contains ${profileKeys.length} profile record${profileKeys.length === 1 ? "" : "s"}${profileKeys.length ? `: ${profileKeys.join(", ")}` : ""}.`);
    }
    if (responseJson.logouts && typeof responseJson.logouts === "object") {
      const logoutKeys = Object.keys(responseJson.logouts);
      notes.push(`Response contains ${logoutKeys.length} logout instruction${logoutKeys.length === 1 ? "" : "s"}${logoutKeys.length ? `: ${logoutKeys.join(", ")}` : ""}.`);
    }
  }

  if (pass?.endpointId === "system-sp-saml-assertion-consumer") {
    notes.push(...buildLegacySamlAssertionConsumerHeaderNotes(entry, formValues));
  }

  return [...new Set(notes.filter(Boolean))];
}

function buildDocumentationLinks(docs = []) {
  const safeDocs = Array.isArray(docs) ? docs.filter((doc) => doc?.url && doc?.label) : [];
  if (!safeDocs.length) return `<p class="harpo-detailEmptyNote">No official documentation link is attached to this rule yet.</p>`;
  return `
    <div class="harpo-docLinks">
      ${safeDocs.map((doc) => `<a class="harpo-docLink" href="${escHtml(doc.url)}" target="_blank" rel="noreferrer noopener">${escHtml(doc.label)}</a>`).join("")}
    </div>
  `;
}

function getPassSupportDocumentation(pass) {
  const docs = Array.isArray(pass?.docs) ? pass.docs : [];
  if (pass?.family === "rest-v2") {
    return docs.find((doc) => /rest_api_v2\/interactive/i.test(String(doc?.url || ""))) || docs[0] || null;
  }
  if (pass?.family === "dcr-v2") {
    return docs.find((doc) => /dcr_api\/interactive/i.test(String(doc?.url || ""))) || docs[0] || null;
  }
  return docs[0] || null;
}

function getPassSupportStatusLabel(pass) {
  if (pass?.support?.status === "legacy") {
    return `Legacy V1 in 2026 (support window ended ${pass.support.windowEndedOn || "2025-12-31"})`;
  }
  if (pass?.support?.status === "system") {
    return "Adobe Pass system call (browser SSO / SAML plumbing)";
  }
  if (pass?.support?.status === "current") {
    return pass?.support?.model === "dcr-v2"
      ? "Current 2026 supported DCR"
      : "Current 2026 supported REST API V2";
  }
  return "Adobe Pass-adjacent infrastructure";
}

function buildPassVerdict(pass, classification) {
  if (pass?.endpointId === "system-sp-saml-assertion-consumer") {
    return "Adobe Pass SAML system call detected. This endpoint brokers the browser between Adobe Pass and the selected TV Provider (MVPD), or consumes the returning MVPD SAML assertion, in the browser handoff flow.";
  }
  const familySummary = pass?.summary || classification?.label || "Adobe Pass traffic";
  if (pass?.support?.status === "legacy") {
    return `Legacy Adobe Pass V1 usage detected in a 2026 review. ${familySummary}`;
  }
  if (pass?.support?.status === "system") {
    return `Adobe Pass system-call usage detected. ${familySummary}`;
  }
  if (pass?.support?.status === "current") {
    return `Modern ${pass.familyLabel} usage detected on the supported 2026 surface. ${familySummary}`;
  }
  return `Adobe Pass infrastructure traffic detected outside the spec-backed 2026 DCR and REST API V2 endpoint list. ${familySummary}`;
}

function buildPassIdentityRows(entry, classification, harvest = null) {
  const pass = classification?.pass || {};
  const params = pass?.params && typeof pass.params === "object" ? pass.params : {};
  const startedDateTime = String(entry?.startedDateTime || "").trim();
  const status = Number(entry?.response?.status || 0);
  const statusText = String(entry?.response?.statusText || "").trim();
  const rows = [
    { name: "2026 fit", value: getPassSupportStatusLabel(pass) },
    { name: "Detected model", value: pass.familyLabel || pass.family || classification?.phase || "Unknown" },
    { name: "HARPO endpoint", value: pass.endpointId || "pass-generic" },
    { name: "Observed path", value: pass.endpointPath || pass.pathTemplate || "/" },
    { name: "Phase", value: classification?.phase || "Pass" },
    { name: "HTTP result", value: statusText ? `${status} ${statusText}` : String(status || "—") }
  ];

  if (pass?.endpointId === "system-sp-saml-assertion-consumer") {
    rows.splice(3, 0, {
      name: "Observed role",
      value: "Adobe Pass system traffic cop for browser handoff to the selected TV Provider and the returning SAML assertion leg"
    });
  }

  if (startedDateTime) {
    const parsedTime = Date.parse(startedDateTime);
    rows.push({
      name: "Observed at",
      value: Number.isFinite(parsedTime) ? formatHarpoTimestamp(parsedTime, { includeDate: true }) : startedDateTime
    });
  }

  Object.entries(params).forEach(([key, value]) => {
    const text = String(value || "").trim();
    if (!text) return;
    const label = key === "serviceProvider"
      ? "Service provider"
      : key === "requestorId"
        ? "Legacy requestor"
        : key === "mvpd"
          ? "MVPD"
          : key === "partner"
            ? "Partner"
            : key === "code"
              ? "Auth code"
              : key;
    rows.push({ name: label, value: key === "code" ? truncateMiddle(text, 18) : text });
  });

  return rows;
}

function buildPassDocumentationSummary(pass) {
  const docs = Array.isArray(pass?.docs) ? pass.docs.filter((doc) => doc?.url && doc?.label) : [];
  if (!docs.length) {
    return `<p class="harpo-detailEmptyNote">No official documentation link is attached to this rule yet.</p>`;
  }
  const primaryDocs = docs.slice(0, 2);
  const supportingDocs = docs.slice(2);
  return `
    <div class="harpo-docDeck">
      <div class="harpo-docDeckSection">
        <div class="harpo-docDeckTitle">Primary references</div>
        ${buildDocumentationLinks(primaryDocs)}
      </div>
      ${supportingDocs.length ? `
        <div class="harpo-docDeckSection">
          <div class="harpo-docDeckTitle">Supporting references</div>
          ${buildDocumentationLinks(supportingDocs)}
        </div>
      ` : ""}
    </div>
  `;
}

function buildPassLiveActionItems(entry, classification, harvest = null) {
  const pass = classification?.pass || {};
  const reqHeaders = harvest?.reqHeaders || indexHeaders(entry?.request?.headers);
  const responseJson = harvest?.responseJson || getJsonBodyFromResponse(entry);
  const formValues = harvest?.requestValues || buildHarpoPairLookup(getFormPairs(entry));
  const status = Number(entry?.response?.status || 0);
  const locationUrl = harvest?.locationUrl || parseHarpoUrlLike(entry?.response?.headers ? indexHeaders(entry.response.headers).location : "", entry?.request?.url || "");
  const locationHost = getHarpoTrafficHostname(locationUrl?.hostname || "");
  const refererUrl = harvest?.refererUrl || parseHarpoUrlLike(reqHeaders.referer, entry?.request?.url || "");
  const refererHost = getHarpoTrafficHostname(refererUrl?.hostname || "");
  const decisions = Array.isArray(responseJson?.decisions) ? responseJson.decisions : [];
  const firstDecision = decisions[0] && typeof decisions[0] === "object" ? decisions[0] : null;
  const nextUrl = typeof responseJson?.url === "string" ? responseJson.url : "";
  const items = [];

  if (pass?.support?.status === "system") {
    items.push("This is an Adobe Pass system call. Do not treat the endpoint itself as a direct migrate-away target; use it to verify browser handoff direction, MVPD assertion handling, cookies, RelayState continuity, and the next redirect.");
  } else if (pass?.support?.status === "legacy") {
    const firstReplacement = pass?.migration?.replacementCalls?.[0] || null;
    items.push(
      firstReplacement?.path
        ? `This is legacy Adobe Pass V1 traffic. Keep the customer moving by mapping this call onto ${firstReplacement.method || "GET"} ${firstReplacement.path} first, then unwind the rest of the legacy chain.`
        : "This is legacy Adobe Pass V1 traffic. The customer should migrate this flow onto DCR and REST API V2 instead of extending the legacy surface."
    );
  } else if (pass?.support?.status === "current") {
    items.push(`This call is already on the supported ${pass.familyLabel} surface. The active fix path is runtime correctness, not endpoint migration.`);
  } else {
    items.push("This call is Adobe Pass infrastructure but not one of HARPO's spec-backed 2026 endpoints. Use it as correlation context and anchor code changes on the nearest supported DCR or REST API V2 operation.");
  }

  if (classification?.phase === "DCR") {
    if (!reqHeaders.authorization && String(pass?.endpointId || "").includes("token")) {
      items.push("Confirm the DCR access token exchange is using the documented client credentials payload and not relying on an inherited browser session.");
    } else {
      items.push("Verify the DCR registration and token pair are both succeeding before debugging downstream REST API V2 failures.");
    }
  }

  if (classification?.phase === "Config") {
    items.push("Use this response to validate the service provider’s live domain and MVPD footprint. If the customer says MVPDs are missing, compare the returned configuration against the requestor they intended to test.");
  }

  if (classification?.phase === "AuthN") {
    if (responseJson?.actionName || responseJson?.actionType) {
      items.push(`Adobe Pass is telling the client exactly what to do next via actionName/actionType. Implement that directive before guessing at the next network step.`);
    }
    if (Array.isArray(responseJson?.missingParameters) && responseJson.missingParameters.length) {
      items.push(`The session is not complete yet. Supply the missing parameters Adobe listed: ${responseJson.missingParameters.join(", ")}.`);
    }
    if (nextUrl) {
      items.push(`The next live step is the returned URL from Adobe Pass. Open or follow ${truncateMiddle(nextUrl, 30)} rather than synthesizing a partner URL client-side.`);
    }
    if (formValues.samlresponse) {
      items.push("This request already carries a SAMLResponse. The customer should be validating the partner-response submission step and the follow-on profile call, not restarting the authentication session.");
    }
  }

  if (pass?.endpointId === "system-sp-saml-assertion-consumer") {
    if (formValues.samlresponse || (refererHost && !isHarpoInternalHost(refererHost))) {
      items.push("This is the return leg of the Adobe Pass browser-SAML loop. Validate the incoming MVPD assertion, RelayState continuity, cookies, and the next redirect or profile-establishing step.");
    } else if (locationHost && !isHarpoInternalHost(locationHost)) {
      items.push(`This hop is Adobe Pass sending the browser to the selected TV Provider. The live MVPD handoff target is ${locationHost}.`);
    } else if (locationHost && isSafeDomainHost(locationHost)) {
      items.push(`This hop is Adobe Pass returning the browser back to the programmer. The live return target is ${locationHost}.`);
    } else {
      items.push("Treat this endpoint as the Adobe Pass browser traffic cop. Use Location, Referer, Origin, Cookie, RelayState, and any SAMLResponse to determine the exact handoff direction.");
    }
  }

  if (classification?.phase === "Profiles") {
    if (responseJson?.profiles && typeof responseJson.profiles === "object" && Object.keys(responseJson.profiles).length) {
      items.push("Adobe Pass returned live profile records. The customer should now inspect entitlement, logout, or downstream authorization behavior rather than re-debugging authentication.");
    } else {
      items.push("No durable profile evidence was returned. Focus on why authentication did not materialize into a profile for the intended MVPD or code.");
    }
  }

  if (classification?.phase === "PreAuth") {
    items.push("Use the preauthorization decisions to verify resource-level availability before assuming a full authorization regression.");
  }

  if (classification?.phase === "AuthZ") {
    if (firstDecision?.authorized === true || responseJson?.authorized === true) {
      items.push("Authorization succeeded. The next customer fix should target token consumption or programmer-side playback usage, not Adobe Pass entitlement generation.");
    } else if (firstDecision?.authorized === false || responseJson?.authorized === false) {
      items.push("Authorization was explicitly denied. Validate resource identifiers, MVPD selection, and degradation or TempPass expectations before changing the transport layer.");
    } else {
      items.push("This authorization step did not return a clean allow/deny answer. Inspect Adobe-specific code, action, and source fields before changing the entitlement flow.");
    }
  }

  if (classification?.phase === "Logout") {
    items.push("Use this logout call to confirm the profile lifecycle is being torn down on both Adobe Pass and MVPD sides. If logout loops, inspect the returned logout instructions and redirect targets.");
  }

  if (status >= 400) {
    items.push(`HTTP ${status} means the current failure is observable on the wire. Fix the request contract or Adobe-specific action/code payload from this response before debugging UI state.`);
  }

  if (pass?.family === "rest-v2" && !reqHeaders.authorization) {
    items.push("The recorded request is missing an Authorization bearer token even though this is REST API V2. Fix token injection before treating the endpoint contract as broken.");
  }

  if (responseJson?.source === "degradation" || firstDecision?.source === "degradation") {
    items.push("Degradation is active in this flow. Customers should validate fallback expectations before calling the entitlement logic broken.");
  }

  if (responseJson?.isTempPass === true) {
    items.push("TempPass is active. Keep the customer focused on temporary-access headers and rules instead of normal MVPD-authenticated profile assumptions.");
  }

  return [...new Set(items.filter(Boolean))];
}

function buildSupportStatusListLead(pass) {
  const supportDoc = getPassSupportDocumentation(pass);
  if (pass?.support?.status === "system") {
    const systemLabel = supportDoc?.url
      ? `<a class="harpo-inlineLink" href="${escHtml(supportDoc.url)}" target="_blank" rel="noreferrer noopener">ADOBE PASS SYSTEM CALL</a>`
      : "ADOBE PASS SYSTEM CALL";
    return `<li>${systemLabel} used for browser SSO / SAML handoff. HARPO should decode the request and response completely, then correlate this traffic to the surrounding customer flow instead of classifying it as a direct migrate-away endpoint.</li>`;
  }
  if (pass?.support?.status === "legacy") {
    const unsupportedLabel = supportDoc?.url
      ? `<a class="harpo-inlineLink" href="${escHtml(supportDoc.url)}" target="_blank" rel="noreferrer noopener">UNSUPPORTED LEGACY V1</a>`
      : "UNSUPPORTED LEGACY V1";
    return `<li>${unsupportedLabel} Adobe Pass call. HARPO treats only DCR, REST API V2, and the current SSO service guidance as supported implementation targets, so this flow should be migrated.</li>`;
  }
  if (pass?.support?.status === "current") {
    const supportedLabel = supportDoc?.url
      ? `<a class="harpo-inlineLink" href="${escHtml(supportDoc.url)}" target="_blank" rel="noreferrer noopener">SUPPORTED</a>`
      : "SUPPORTED";
    const supportFamily = pass?.support?.model === "dcr-v2" ? "Adobe Pass 2026 DCR" : "Adobe Pass 2026 REST V2";
    return `<li>${supportedLabel} ${escHtml(supportFamily)} call.</li>`;
  }
  const adjacentLabel = supportDoc?.url
    ? `<a class="harpo-inlineLink" href="${escHtml(supportDoc.url)}" target="_blank" rel="noreferrer noopener">NOT IN 2026 API SPEC</a>`
    : "NOT IN 2026 API SPEC";
  return `<li>${adjacentLabel} Adobe Pass infrastructure call. HARPO can correlate it, but it is not one of the attached supported 2026 DCR or REST API V2 endpoints.</li>`;
}

function buildAdobePassAnalysisCard(entry, classification, harvest = null, passLearningPlan = null) {
  const pass = classification?.pass;
  if (!pass) return "";
  const identityRows = buildPassIdentityRows(entry, classification, harvest);
  const usageRows = buildPassObservedUsageRows(entry, classification, harvest);
  const usageSummary = buildPassUsageSummary(entry, classification, harvest);
  const liveActionItems = buildPassLiveActionItems(entry, classification, harvest);
  const runtimeNotes = buildPassRuntimeNotes(entry, classification, harvest);
  const familyBadgeClass = pass.family === "legacy-v1"
    ? "harpo-analysisBadge--legacy"
    : pass.family === "pass-system"
      ? "harpo-analysisBadge--system"
    : pass.family === "dcr-v2"
      ? "harpo-analysisBadge--dcr"
      : "harpo-analysisBadge--modern";
  const supportBadge = pass.support?.status === "legacy"
    ? `<span class="harpo-analysisBadge harpo-analysisBadge--unsupported">Past published support window</span>`
    : pass.support?.status === "system"
      ? `<span class="harpo-analysisBadge harpo-analysisBadge--system">System call</span>`
    : pass.support?.status === "current"
      ? `<span class="harpo-analysisBadge harpo-analysisBadge--supported">Supported model</span>`
      : `<span class="harpo-analysisBadge harpo-analysisBadge--unsupported">Not in 2026 API spec</span>`;
  const migrationBlock = pass.migration ? `
    <div class="harpo-migrationBox">
      <div class="harpo-migrationBox-title">${escHtml(pass.migration.title || "REST V2 migration")}</div>
      <p class="harpo-migrationBox-copy">${escHtml(pass.migration.summary || "")}</p>
      ${(pass.migration.observations || []).length ? `
        <ul class="harpo-analysisList harpo-analysisList--tight">
          ${(pass.migration.observations || []).map((note) => `<li>${escHtml(note)}</li>`).join("")}
        </ul>
      ` : ""}
      <div class="harpo-migrationCalls">
        ${(pass.migration.replacementCalls || []).map((call) => `
          <div class="harpo-migrationCall">
            <div class="harpo-migrationCall-header">
              <span class="harpo-migrationMethod">${escHtml(call.method || "GET")}</span>
              <span class="harpo-migrationLabel">${escHtml(call.label || "")}</span>
            </div>
            <div class="harpo-migrationPath">${escHtml(call.path || call.pathTemplate || "")}</div>
            ${call.doc?.url ? `<a class="harpo-docLink harpo-docLink--inline" href="${escHtml(call.doc.url)}" target="_blank" rel="noreferrer noopener">${escHtml(call.doc.label)}</a>` : ""}
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";
  const observedFacts = [
    buildSupportStatusListLead(pass),
    `<li>${escHtml(pass.purpose || pass.summary || classification.label || "Adobe Pass activity detected.")}</li>`,
    ...[...(pass.notes || []), ...runtimeNotes].map((note) => `<li>${escHtml(note)}</li>`)
  ].join("");
  const learningButtonAttributes = passLearningPlan ? [
    `data-harpo-pass-learning="true"`,
    passLearningPlan.kind === "rest-v2" ? `data-harpo-restv2-learning="true"` : "",
    passLearningPlan.kind === "dcr" ? `data-harpo-dcr-learning="true"` : ""
  ].filter(Boolean).join(" ") : "";
  const learningStatusAttributes = passLearningPlan ? [
    `data-harpo-pass-learning-status`,
    passLearningPlan.kind === "rest-v2" ? `data-harpo-restv2-learning-status` : "",
    passLearningPlan.kind === "dcr" ? `data-harpo-dcr-learning-status` : ""
  ].filter(Boolean).join(" ") : "";
  const passLearningBlock = passLearningPlan ? `
    <div class="harpo-docDeckSection">
      <div class="harpo-docDeckTitle">Interactive learning</div>
      <div class="harpo-docLinks">
        <button type="button" class="harpo-docLink harpo-docLink--action" ${learningButtonAttributes}>${escHtml(passLearningPlan.learningLabel || `LEARN THIS ${passLearningPlan.productLabel || "ADOBE PASS"} CALL`)}</button>
        <a class="harpo-docLink" href="${escHtml(passLearningPlan.docsUrl)}" target="_blank" rel="noreferrer noopener">Open docs only</a>
      </div>
      <p class="harpo-detailEmptyNote harpo-learningStatus" ${learningStatusAttributes}>${escHtml(
        Array.isArray(passLearningPlan.notes) && passLearningPlan.notes.length
          ? passLearningPlan.notes[0]
          : buildHarpoLearningStatusMessage(passLearningPlan)
      )}</p>
    </div>
  ` : "";

  return `
    <div class="harpo-detailCard harpo-analysisCard${pass.support?.status === "legacy" ? " harpo-analysisCard--legacy" : ""}">
      <div class="harpo-detailCard-header" data-card="analysis">
        <span class="harpo-detailCard-title">Adobe Pass Analysis</span>
        <span class="harpo-detailCard-toggle harpo-detailCard-toggle--open">▼</span>
      </div>
      <div class="harpo-detailCard-body" id="harpo-card-analysis">
        <div class="harpo-analysisBadgeRow">
          <span class="harpo-analysisBadge ${familyBadgeClass}">${escHtml(pass.familyLabel)}</span>
          <span class="harpo-analysisBadge harpo-analysisBadge--phase">${escHtml(classification.phase)}</span>
          ${supportBadge}
        </div>
        <div class="harpo-analysisLead">${escHtml(buildPassVerdict(pass, classification))}</div>
        <div class="harpo-analysisSection">
          <div class="harpo-analysisSection-title">Implementation identification</div>
          ${buildNameValueTable(identityRows)}
        </div>
        <div class="harpo-analysisSection">
          <div class="harpo-analysisSection-title">Observed usage</div>
          ${usageSummary ? `<p class="harpo-analysisParagraph">${escHtml(usageSummary)}</p>` : ""}
          ${buildNameValueTable(usageRows, "HARPO did not harvest any Adobe Pass usage fields from this event.")}
        </div>
        <div class="harpo-analysisSection">
          <div class="harpo-analysisSection-title">Live action helper</div>
          <ul class="harpo-analysisList">
            ${liveActionItems.map((item) => `<li>${escHtml(item)}</li>`).join("")}
          </ul>
        </div>
        <div class="harpo-analysisSection">
          <div class="harpo-analysisSection-title">Live runtime evidence</div>
          <ul class="harpo-analysisList">
            ${observedFacts}
          </ul>
        </div>
        <div class="harpo-analysisSection">
          <div class="harpo-analysisSection-title">Official documentation</div>
          ${passLearningBlock}
          ${buildPassDocumentationSummary(pass)}
        </div>
        ${migrationBlock}
      </div>
    </div>
  `;
}

function buildGenericAnalysisCard(entry, classification) {
  const annotations = buildAnnotations(entry, classification);
  if (!annotations.length) return "";
  return `
    <div class="harpo-detailCard harpo-analysisCard">
      <div class="harpo-detailCard-header" data-card="analysis">
        <span class="harpo-detailCard-title">HARPO Analysis</span>
        <span class="harpo-detailCard-toggle harpo-detailCard-toggle--open">▼</span>
      </div>
      <div class="harpo-detailCard-body" id="harpo-card-analysis">
        <div>
          <span class="harpo-analysisPhase harpo-phase--${classification.phase}">${classification.phase}</span>
          <span class="harpo-analysisDesc harpo-analysisDesc--spaced">${escHtml(classification.label)}</span>
        </div>
        <div class="harpo-analysisAnnotations">
          ${annotations.map((annotation) => `<div class="harpo-annotation">
            <span class="harpo-annotation-key">${escHtml(annotation.key)}:</span>
            <span class="harpo-annotation-value">${escHtml(annotation.value)}</span>
          </div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function isSafeDomainHost(hostname) {
  const normalizedHost = String(hostname || "").toLowerCase();
  return safeDomains.some((domain) => {
    const normalizedDomain = String(domain || "").toLowerCase().replace(/\.$/, "");
    return normalizedDomain && (normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`));
  });
}

// ─── State ────────────────────────────────────────────────────────────────────

let harData            = null;
let classifiedEntries  = [];
let activeDomainFilter = "all";
let activeStatusFilter = "all";
let selectedIndex      = -1;
let rawHarPayload      = null;
let programmerName     = "";
let requestorId        = "";
let requestorName      = "";
let safeDomains        = [];   // requestor config domains plus adobe.com
let reproDomains       = [];
let expectedMvpds      = [];
let sessionKey         = "";
let detailRenderToken  = 0;
let pendingCallListAnchor = false;
let activeDetailTab    = "analysis";
let activeTheme        = normalizeThemePreference(DEFAULT_THEME);
let harpoThemeSyncWired = false;

const HARPO_SIDEBAR_WIDTH_STORAGE_KEY = "harpo.workspace.sidebarWidth";
const HARPO_SIDEBAR_MIN_WIDTH = 280;
const HARPO_SIDEBAR_MAX_WIDTH = 620;

function applyHarpoThemePreference(themePreference) {
  const theme = normalizeThemePreference(themePreference);
  const accentMeta = getThemeAccentMeta(theme.accent);
  const tokenFamily = String(accentMeta?.tokenFamily || DEFAULT_THEME.accent).trim().toLowerCase();
  const body = document.body;

  if (!body || !tokenFamily) {
    return;
  }

  activeTheme = theme;
  body.classList.toggle("spectrum--light", theme.stop === "light");
  body.classList.toggle("spectrum--dark", theme.stop === "dark");
  body.dataset.themeStop = theme.stop;
  body.dataset.themeAccent = accentMeta.id;
  body.style.colorScheme = theme.stop;

  HARPO_THEME_RAMP_STEPS.forEach((step) => {
    body.style.setProperty(`--spectrum-accent-color-${step}`, `var(--spectrum-${tokenFamily}-${step})`);
  });
  body.style.setProperty("--spectrum-accent-visual-color", `var(--spectrum-${tokenFamily}-visual-color)`);
  body.style.setProperty("--spectrum-focus-indicator-color", `var(--spectrum-${tokenFamily}-visual-color)`);
  body.style.setProperty("--harpo-theme-ring", theme.stop === "light"
    ? "color-mix(in srgb, var(--spectrum-accent-color-400) 28%, var(--spectrum-gray-200) 72%)"
    : "color-mix(in srgb, var(--spectrum-accent-color-1000) 34%, var(--spectrum-gray-700) 66%)");
}

async function hydrateHarpoThemePreference(fallbackTheme = DEFAULT_THEME) {
  const fallback = normalizeThemePreference(fallbackTheme || rawHarPayload?.theme || DEFAULT_THEME);
  try {
    const stored = await chrome.storage.local.get([THEME_STORAGE_KEY]);
    applyHarpoThemePreference(stored?.[THEME_STORAGE_KEY] || fallback);
  } catch {
    applyHarpoThemePreference(fallback);
  }
}

function wireHarpoThemePreferenceSync() {
  if (harpoThemeSyncWired || !globalThis.chrome?.storage?.onChanged) {
    return;
  }

  harpoThemeSyncWired = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes || {}, THEME_STORAGE_KEY)) {
      return;
    }
    applyHarpoThemePreference(changes[THEME_STORAGE_KEY]?.newValue || DEFAULT_THEME);
  });
}

// ─── IndexedDB load ───────────────────────────────────────────────────────────

async function loadFromIdb(key) {
  setLoadStatus("Reading HAR from IndexedDB…");
  try {
    const payload = await harpoIdbGet(key);
    if (!payload) {
      setLoadStatus("Session not found. It may have expired or been from a previous browser session.");
      return;
    }
    sessionKey      = key;
    programmerName  = payload.programmerName || "";
    requestorId     = payload.requestorId || "";
    requestorName   = payload.requestorName || "";
    safeDomains     = Array.isArray(payload.safeDomains)
      ? payload.safeDomains
      : Array.isArray(payload.programmerDomains)
        ? payload.programmerDomains
        : [];
    reproDomains    = Array.isArray(payload.reproDomains) ? payload.reproDomains : [];
    expectedMvpds   = Array.isArray(payload.expectedMvpds) ? payload.expectedMvpds : [];
    rawHarPayload   = payload;
    applyHarpoThemePreference(payload.theme || activeTheme || DEFAULT_THEME);
    processHar(payload.har);
  } catch (err) {
    setLoadStatus(`Error reading IndexedDB: ${err?.message || err}`);
  }
}

function processHar(har) {
  if (!har?.log) { setLoadStatus("Invalid HAR — missing .log"); return; }
  const entries = Array.isArray(har.log.entries) ? har.log.entries : [];
  if (entries.length === 0) { setLoadStatus("HAR contains no network entries."); return; }

  harData = har;
  const orderedEntries = entries
    .map((entry, originalIndex) => ({
      entry,
      originalIndex,
      startedMs: getHarpoEntryStartTimeMs(entry, originalIndex)
    }))
    .sort((a, b) => a.startedMs - b.startedMs || a.originalIndex - b.originalIndex);

  // Two gates, tracked sequentially across all entries in chronological order:
  //
  // 1. Adobe gate: opens on the FIRST call to any Adobe ecosystem host.
  //    Before this, the HAR is just the programmer's own page loading — CSS, JS,
  //    fonts, analytics, etc. None of it is relevant. Drop everything.
  //
  // 2. Pass gate: opens on the FIRST Adobe Pass control-plane call, including
  //    REST V2 on api.auth.adobe.com or sp.auth.adobe.com and related auth
  //    hosts. MVPD classification is locked until this gate opens, because the
  //    MVPD redirect chain cannot exist until Pass has loaded and redirected the
  //    browser to the MVPD login page.
  let adobeGateOpen = false;
  let passGateOpen  = false;
  let mvpdGateOpen  = false;
  let mvpdDomains   = dedupeHarpoDomainBuckets(rawHarPayload?.mvpdDomains || []);

  classifiedEntries = orderedEntries
    .map(({ entry, originalIndex, startedMs }, idx) => {
      const url = entry?.request?.url || "";
      const hostname = getHarpoTrafficHostname(url);
      const domainBucket = getHarpoTrafficDomainBucket(hostname);

      if (!adobeGateOpen && isHarpoAdobeTraffic(url)) {
        adobeGateOpen = true;
      }
      if (!passGateOpen && isHarpoPassTraffic(url)) {
        passGateOpen = true;
      }

      if (
        !mvpdGateOpen &&
        isHarpoPassSamlAssertionConsumer(url)
      ) {
        const samlMvpdDomains = extractSamlMvpdDomains(entry);
        if (samlMvpdDomains.length > 0) {
          mvpdDomains = dedupeHarpoDomainBuckets([...mvpdDomains, ...samlMvpdDomains]);
          mvpdGateOpen = true;
        }
      } else if (
        !mvpdGateOpen &&
        mvpdDomains.length > 0 &&
        matchesHarpoDomainList(hostname, mvpdDomains) &&
        !isSafeDomainHost(hostname) &&
        !isHarpoAdobeTraffic(hostname)
      ) {
        mvpdGateOpen = true;
      }

      const classification = classifyHarpoEntry(entry, {
        programmerDomains: safeDomains,
        adobeGateOpen,
        passGateOpen,
        mvpdGateOpen,
        mvpdDomains
      });

      if (mvpdGateOpen && classification?.domain === "programmer" && String(entry?._resourceType || "").toLowerCase() === "document") {
        mvpdGateOpen = false;
      }
      if (!classification) return null;
      return { idx, entry, classification, hostname, domainBucket, originalIndex, startedMs, sequence: idx + 1 };
    })
    .filter(Boolean);

  renderAll();
}

// ─── Render pipeline ──────────────────────────────────────────────────────────

function setLoadStatus(msg) {
  const el = document.getElementById("harpoLoadStatus");
  if (el) el.textContent = msg;
}

function clampHarpoSidebarWidth(width = HARPO_SIDEBAR_MIN_WIDTH) {
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth)) {
    return HARPO_SIDEBAR_MIN_WIDTH;
  }
  return Math.min(HARPO_SIDEBAR_MAX_WIDTH, Math.max(HARPO_SIDEBAR_MIN_WIDTH, numericWidth));
}

function applyHarpoSidebarWidth(width = HARPO_SIDEBAR_MIN_WIDTH) {
  const workspaceEl = document.querySelector(".harpo-workspace");
  const dividerEl = document.getElementById("harpoWorkspaceDivider");
  if (!workspaceEl) return;
  const clampedWidth = clampHarpoSidebarWidth(width);
  workspaceEl.style.setProperty("--harpo-sidebar-width", `${clampedWidth}px`);
  if (dividerEl) {
    dividerEl.setAttribute("aria-valuemin", String(HARPO_SIDEBAR_MIN_WIDTH));
    dividerEl.setAttribute("aria-valuemax", String(HARPO_SIDEBAR_MAX_WIDTH));
    dividerEl.setAttribute("aria-valuenow", String(clampedWidth));
  }
}

function wireWorkspaceDivider() {
  const workspaceEl = document.querySelector(".harpo-workspace");
  const sidebarEl = document.querySelector(".harpo-sidebar");
  const dividerEl = document.getElementById("harpoWorkspaceDivider");
  if (!workspaceEl || !sidebarEl || !dividerEl) return;

  let savedWidth = HARPO_SIDEBAR_MIN_WIDTH;
  try {
    savedWidth = clampHarpoSidebarWidth(window.localStorage.getItem(HARPO_SIDEBAR_WIDTH_STORAGE_KEY));
  } catch {
    savedWidth = HARPO_SIDEBAR_MIN_WIDTH;
  }
  applyHarpoSidebarWidth(savedWidth);

  if (dividerEl.dataset.harpoWired === "true") return;
  dividerEl.dataset.harpoWired = "true";

  const persistWidth = (width) => {
    const clampedWidth = clampHarpoSidebarWidth(width);
    applyHarpoSidebarWidth(clampedWidth);
    try {
      window.localStorage.setItem(HARPO_SIDEBAR_WIDTH_STORAGE_KEY, String(clampedWidth));
    } catch { }
  };

  dividerEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarEl.getBoundingClientRect().width;
    workspaceEl.classList.add("harpo-workspace--resizing");
    dividerEl.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      persistWidth(startWidth + delta);
    };

    const handlePointerEnd = () => {
      workspaceEl.classList.remove("harpo-workspace--resizing");
      dividerEl.removeEventListener("pointermove", handlePointerMove);
      dividerEl.removeEventListener("pointerup", handlePointerEnd);
      dividerEl.removeEventListener("pointercancel", handlePointerEnd);
    };

    dividerEl.addEventListener("pointermove", handlePointerMove);
    dividerEl.addEventListener("pointerup", handlePointerEnd);
    dividerEl.addEventListener("pointercancel", handlePointerEnd);
  });

  dividerEl.addEventListener("keydown", (event) => {
    const currentWidth = sidebarEl.getBoundingClientRect().width;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      persistWidth(currentWidth - 24);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      persistWidth(currentWidth + 24);
    }
  });
}

function renderAll() {
  renderMeta();
  renderDomainFilters();
  renderStatusFilters();
  renderCallList();
  wireHarExportButtons();
}

function renderMeta() {
  const el = document.getElementById("harpoMeta");
  if (!el) return;
  const parts = [];
  const uniqueDomainCount = new Set(classifiedEntries.map((entry) => entry.domainBucket)).size;
  const currentLabel = [programmerName, requestorName || requestorId].filter(Boolean).join(" / ");
  if (currentLabel)               parts.push(currentLabel);
  if (harData?.log?.creator?.name) parts.push(`via ${harData.log.creator.name}`);
  if (classifiedEntries.length) {
    parts.push(`${classifiedEntries.length} entries across ${uniqueDomainCount} domains`);
    const firstEntry = classifiedEntries[0];
    const lastEntry = classifiedEntries[classifiedEntries.length - 1];
    if (firstEntry?.startedMs && lastEntry?.startedMs) {
      parts.push(`chronological · ${formatHarpoTimestamp(firstEntry.startedMs, { includeDate: true })} → ${formatHarpoTimestamp(lastEntry.startedMs)}`);
    }
  }
  el.textContent = parts.join("  ·  ");
}

function buildDomainFilters() {
  const counts = new Map();
  classifiedEntries.forEach((entry) => {
    const existing = counts.get(entry.domainBucket) || { label: entry.domainBucket, count: 0 };
    existing.count += 1;
    counts.set(entry.domainBucket, existing);
  });
  return [...counts.entries()]
    .map(([key, value]) => ({ key, label: value.label, count: value.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function renderDomainFilters() {
  const el = document.getElementById("harpoFilterBar");
  const select = document.getElementById("harpoDomainFilter");
  if (!el || !select) return;
  const domainFilters = buildDomainFilters();
  if (activeDomainFilter !== "all" && !domainFilters.some((filter) => filter.key === activeDomainFilter)) {
    activeDomainFilter = "all";
  }
  const filters = [
    { key: "all", label: "ALL" },
    ...domainFilters
  ];
  el.hidden = classifiedEntries.length === 0;
  select.innerHTML = filters
    .map((filter) => `<option value="${escHtml(filter.key)}">${escHtml(filter.label)}</option>`)
    .join("");
  select.value = activeDomainFilter;
  if (select.dataset.harpoWired === "true") return;
  select.dataset.harpoWired = "true";
  select.addEventListener("change", () => {
    activeDomainFilter = select.value || "all";
    pendingCallListAnchor = true;
    renderStatusFilters();
    renderCallList();
  });
}

function getDomainScopedEntries() {
  return classifiedEntries.filter((entry) => activeDomainFilter === "all" || entry.domainBucket === activeDomainFilter);
}

function buildStatusFilters() {
  const statuses = new Set();
  getDomainScopedEntries().forEach((entry) => {
    const status = Number(entry?.entry?.response?.status || 0);
    if (!Number.isFinite(status) || status <= 0) return;
    statuses.add(status);
  });
  return [...statuses]
    .map((status) => ({ key: String(status), label: String(status) }))
    .sort((a, b) => Number(a.key) - Number(b.key));
}

function renderStatusFilters() {
  const el = document.getElementById("harpoStatusFilters");
  const pillsEl = document.getElementById("harpoStatusFilterPills");
  if (!el || !pillsEl) return;
  const statusFilters = buildStatusFilters();
  if (activeStatusFilter !== "all" && !statusFilters.some((filter) => filter.key === activeStatusFilter)) {
    activeStatusFilter = "all";
  }
  const filters = [
    { key: "all", label: "ALL" },
    ...statusFilters
  ];
  el.hidden = statusFilters.length === 0;
  pillsEl.innerHTML = filters.map((filter) => `
    <button class="harpo-filterPill${activeStatusFilter === filter.key ? " harpo-filterPill--active" : ""}"
            type="button"
            data-status-filter="${escHtml(filter.key)}"
            aria-pressed="${activeStatusFilter === filter.key ? "true" : "false"}">
      <span class="harpo-filterPill-label">${escHtml(filter.label)}</span>
    </button>
  `).join("");
  pillsEl.querySelectorAll("[data-status-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeStatusFilter = button.dataset.statusFilter || "all";
      pendingCallListAnchor = true;
      renderStatusFilters();
      renderCallList();
    });
  });
}

function getFilteredEntries() {
  return getDomainScopedEntries().filter(c => {
    if (activeDomainFilter !== "all" && c.domainBucket !== activeDomainFilter) return false;
    const status = Number(c?.entry?.response?.status || 0);
    if (activeStatusFilter !== "all" && String(status) !== activeStatusFilter) return false;
    return true;
  });
}

function getSelectedEntry() {
  return classifiedEntries.find((entry) => entry.idx === selectedIndex) || null;
}

function getSelectionAnchorEntry(filtered = []) {
  if (!Array.isArray(filtered) || filtered.length === 0 || selectedIndex === -1) return null;
  const nextVisibleEntry = filtered.find((entry) => entry.idx > selectedIndex);
  if (nextVisibleEntry) return nextVisibleEntry;
  return filtered[filtered.length - 1] || null;
}

function anchorCallListToSelection(listEl, filtered = [], selectedVisible = false) {
  if (!pendingCallListAnchor || !listEl) return;
  pendingCallListAnchor = false;

  let anchorIdx = selectedIndex;
  if (!selectedVisible) {
    anchorIdx = getSelectionAnchorEntry(filtered)?.idx ?? -1;
  }
  if (anchorIdx === -1) return;

  const anchorEl = listEl.querySelector(`[data-idx="${String(anchorIdx)}"]`);
  if (!anchorEl) return;
  anchorEl.scrollIntoView({ block: selectedVisible ? "nearest" : "center" });
}

function renderEmptyDetail(title, body) {
  const detailEl = document.getElementById("harpoDetail");
  if (!detailEl) return;
  detailRenderToken += 1;
  detailEl.innerHTML = `
    <div class="harpo-detail-empty">
      <p class="spectrum-Heading spectrum-Heading--sizeL harpo-detail-emptyTitle">${escHtml(title)}</p>
      <p class="spectrum-Body spectrum-Body--sizeM harpo-detail-emptyBody">${escHtml(body)}</p>
    </div>
  `;
}

function getHarpoCallListGroup(record = null) {
  const domain = String(record?.classification?.domain || "").trim().toLowerCase();
  const passFamily = String(record?.classification?.pass?.family || "").trim();
  if (passFamily === "dcr-v2") {
    return { key: "pass-dcr", label: "Adobe Pass DCR" };
  }
  if (passFamily === "rest-v2") {
    return { key: "pass-rest-v2", label: "Adobe Pass REST V2" };
  }
  if (passFamily === "legacy-v1") {
    return { key: "pass-legacy", label: "Adobe Pass Legacy / V1" };
  }
  if (passFamily === "pass-system") {
    return { key: "pass-system", label: "Adobe Pass System" };
  }
  if (domain === "programmer") {
    return { key: "requestor", label: "Requestor / Site" };
  }
  if (domain === "mvpd") {
    return { key: "mvpd", label: "MVPD" };
  }
  if (domain === "ims" || domain === "adobe") {
    return { key: "support", label: "Adobe Support" };
  }
  return { key: "other", label: "Other" };
}

function renderCallList() {
  const el = document.getElementById("harpoCallList");
  if (!el) return;
  el.innerHTML = "";

  const filtered = getFilteredEntries();
  const selectedEntry = getSelectedEntry();
  if (selectedIndex !== -1 && !selectedEntry) {
    selectedIndex = -1;
  }
  const visibleSelection = filtered.some((entry) => entry.idx === selectedIndex);
  if (filtered.length === 0) {
    el.innerHTML = `<div class="harpo-empty">
      <p class="spectrum-Heading spectrum-Heading--sizeM harpo-empty-title">No matching calls</p>
      <p class="spectrum-Body spectrum-Body--sizeS harpo-empty-body">Adjust the domain or status filters to inspect another slice of traffic.</p>
    </div>`;
    pendingCallListAnchor = false;
    if (selectedIndex === -1) {
      renderEmptyDetail(
        "No matching calls",
        "Choose another domain or status filter to inspect a different slice of traffic."
      );
    }
    return;
  }
  if (selectedIndex === -1) {
    renderEmptyDetail("Select a call", "Click any network entry on the left to inspect its request, response, and Pass analysis.");
  }

  const fragment = document.createDocumentFragment();
  let previousGroupKey = "";
  filtered.forEach(({ idx, entry, classification, hostname, startedMs, sequence }) => {
    const url    = entry?.request?.url || "";
    const method = (entry?.request?.method || "GET").toUpperCase();
    const status = entry?.response?.status || 0;
    const totalMs = Math.round(entry?.time || 0);
    const path   = getHarpoDisplayPath(url);
    const sc     = status >= 500 ? "5xx" : status >= 400 ? "4xx" : status >= 300 ? "3xx" : status >= 200 ? "2xx" : "0";
    const sequenceLabel = formatHarpoSequence(sequence);
    const group = getHarpoCallListGroup({ entry, classification, hostname, startedMs, sequence });
    const hoverSummary = [
      group.label,
      `${sequenceLabel} · ${classification.label}`,
      `${method} ${url}`,
      hostname ? `Host: ${hostname}` : "",
      `HTTP ${status || "—"}${totalMs ? ` · ${totalMs} ms` : ""}`
    ].filter(Boolean).join("\n");

    if (group.key !== previousGroupKey) {
      const groupHeader = document.createElement("div");
      groupHeader.className = "harpo-callGroupHeader";
      groupHeader.innerHTML = `<span class="harpo-callGroupLabel">${escHtml(group.label)}</span>`;
      fragment.appendChild(groupHeader);
      previousGroupKey = group.key;
    }

    const item = document.createElement("div");
    item.className = `harpo-callItem${status >= 400 ? " harpo-callItem--error" : ""}${selectedIndex === idx ? " harpo-callItem--selected" : ""}`;
    item.setAttribute("role", "listitem");
    item.dataset.idx = idx;
    item.title = hoverSummary;
    item.setAttribute("aria-label", hoverSummary.replace(/\n+/g, " · "));
    item.innerHTML = `
      <span class="harpo-callMethod harpo-callMethod--${["GET","POST","DELETE","PUT"].includes(method) ? method : "OTHER"}">${method}</span>
      <span class="harpo-callPath" title="${escHtml(path)}">${escHtml(path)}</span>
      <span class="harpo-callClassification">
        <span class="harpo-domainChip" title="${escHtml(hostname)}">${escHtml(hostname)}</span>
        <span class="harpo-phaseChip harpo-phase--${classification.phase}">${classification.phase}</span>
      </span>
      <span class="harpo-callMeta">
        ${totalMs ? `<span class="harpo-callDuration">${totalMs} ms</span>` : ""}
      </span>
      <span class="harpo-callStatus harpo-callStatus--${sc}">${status || "—"}</span>`;
    item.addEventListener("click", () => selectEntry(idx));
    fragment.appendChild(item);
  });
  el.appendChild(fragment);
  anchorCallListToSelection(el, filtered, visibleSelection);
}

function selectEntry(idx) {
  selectedIndex = idx;
  pendingCallListAnchor = true;
  renderCallList();
  const c = classifiedEntries.find(x => x.idx === idx);
  if (c) void renderDetail(c);
}

function applyDetailTabState(detailEl, tabKey = activeDetailTab) {
  if (!detailEl) return;
  const tabs = [...detailEl.querySelectorAll("[data-harpo-detail-tab]")];
  const panels = [...detailEl.querySelectorAll("[data-harpo-detail-panel]")];
  const availableTabKeys = tabs.map((tab) => String(tab.dataset.harpoDetailTab || ""));
  const safeTabKey = availableTabKeys.includes(tabKey) ? tabKey : (availableTabKeys[0] || "headers");
  activeDetailTab = safeTabKey;

  tabs.forEach((tab) => {
    const selected = String(tab.dataset.harpoDetailTab || "") === safeTabKey;
    tab.classList.toggle("harpo-detailTab--active", selected);
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.tabIndex = selected ? 0 : -1;
  });

  panels.forEach((panel) => {
    panel.hidden = String(panel.dataset.harpoDetailPanel || "") !== safeTabKey;
  });
}

function wireDetailTabs(detailEl) {
  if (!detailEl) return;
  detailEl.querySelectorAll("[data-harpo-detail-tab]").forEach((tab) => {
    tab.addEventListener("click", () => applyDetailTabState(detailEl, String(tab.dataset.harpoDetailTab || "headers")));
  });
  applyDetailTabState(detailEl, activeDetailTab);
}

function filterHarpoReplayHeaders(headers = []) {
  return (Array.isArray(headers) ? headers : []).filter((header) => {
    const name = String(header?.name || "").trim();
    if (!name) return false;
    return !/^:(authority|method|path|scheme)$/i.test(name) && !/^(host|content-length)$/i.test(name);
  });
}

function escapeHarpoShellArgument(value = "", { singleLine = false } = {}) {
  const text = String(value || "");
  if (!singleLine) {
    return `'${text.replace(/'/g, `'\"'\"'`)}'`;
  }
  return `$'${text
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/'/g, "\\'")}'`;
}

function buildHarpoCurlSnippet(entry) {
  const url = String(entry?.request?.url || "").trim();
  if (!url) return "";
  const method = String(entry?.request?.method || "GET").trim().toUpperCase() || "GET";
  const headers = filterHarpoReplayHeaders(entry?.request?.headers || []);
  const body = String(entry?.request?.postData?.text || "");
  const parts = [
    "curl",
    "--request",
    method,
    "--url",
    escapeHarpoShellArgument(url, { singleLine: true })
  ];

  headers.forEach((header) => {
    parts.push("--header", escapeHarpoShellArgument(`${header.name}: ${header.value || ""}`, { singleLine: true }));
  });

  if (!["GET", "HEAD"].includes(method) && body) {
    parts.push("--data-raw", escapeHarpoShellArgument(body, { singleLine: true }));
  }

  return parts.join(" ");
}

function buildHarpoFetchSnippet(entry) {
  const url = String(entry?.request?.url || "").trim();
  if (!url) return "";
  const method = String(entry?.request?.method || "GET").trim().toUpperCase() || "GET";
  const headers = filterHarpoReplayHeaders(entry?.request?.headers || []);
  const headerRecord = headers.reduce((result, header) => {
    result[String(header.name || "")] = String(header.value || "");
    return result;
  }, {});
  const options = { method };
  if (Object.keys(headerRecord).length) {
    options.headers = headerRecord;
  }
  if (!["GET", "HEAD"].includes(method) && entry?.request?.postData?.text) {
    options.body = String(entry.request.postData.text || "");
  }

  return [
    `const response = await fetch(${JSON.stringify(url)}, ${JSON.stringify(options, null, 2)});`,
    `const responseText = await response.text();`,
    `console.log({ status: response.status, statusText: response.statusText, responseText });`
  ].join("\n");
}

function buildHarpoCodeGenerationMarkup(entry) {
  const curlSnippet = buildHarpoCurlSnippet(entry);
  const fetchSnippet = buildHarpoFetchSnippet(entry);
  if (!curlSnippet && !fetchSnippet) {
    return `<p class="harpo-detailEmptyNote">HARPO could not build replay code for this event.</p>`;
  }
  return `
    <div class="harpo-detailCard">
      <div class="harpo-detailCard-header">
        <span class="harpo-detailCard-title">Replay Notes</span>
      </div>
      <div class="harpo-detailCard-body">
        <p class="harpo-detailEmptyNote">HARPO generated these snippets from the captured wire request. Freshen bearer tokens, cookies, or other short-lived values before replay.</p>
      </div>
    </div>
    ${curlSnippet ? `
      <div class="harpo-detailCard">
        <button
          class="harpo-detailCard-header harpo-detailCard-header--copy"
          type="button"
          data-harpo-copy-target="curl"
          aria-label="Copy cURL sample to clipboard">
          <span class="harpo-detailCard-title">cURL</span>
          <span class="harpo-detailCard-copyStatus" data-harpo-copy-status="curl">Click title to copy</span>
        </button>
        <div class="harpo-detailCard-body">
          <pre class="harpo-bodyViewer" data-harpo-code-sample="curl">${escHtml(curlSnippet)}</pre>
        </div>
      </div>
    ` : ""}
    ${fetchSnippet ? `
      <div class="harpo-detailCard">
        <button
          class="harpo-detailCard-header harpo-detailCard-header--copy"
          type="button"
          data-harpo-copy-target="fetch"
          aria-label="Copy fetch sample to clipboard">
          <span class="harpo-detailCard-title">fetch()</span>
          <span class="harpo-detailCard-copyStatus" data-harpo-copy-status="fetch">Click title to copy</span>
        </button>
        <div class="harpo-detailCard-body">
          <pre class="harpo-bodyViewer" data-harpo-code-sample="fetch">${escHtml(fetchSnippet)}</pre>
        </div>
      </div>
    ` : ""}
  `;
}

async function copyHarpoText(text = "") {
  const value = String(text || "");
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "readonly");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    helper.style.pointerEvents = "none";
    document.body.appendChild(helper);
    helper.select();
    helper.setSelectionRange(0, helper.value.length);
    const copied = document.execCommand("copy");
    helper.remove();
    return Boolean(copied);
  }
}

function wireHarpoCodeCopy(detailEl) {
  if (!detailEl) return;
  detailEl.querySelectorAll("[data-harpo-copy-target]").forEach((trigger) => {
    if (!(trigger instanceof HTMLElement) || trigger.dataset.harpoCopyWired === "true") return;
    trigger.dataset.harpoCopyWired = "true";
    const handleCopy = async () => {
      const target = String(trigger.dataset.harpoCopyTarget || "").trim();
      if (!target) return;
      const codeEl = detailEl.querySelector(`[data-harpo-code-sample="${target}"]`);
      const statusEl = detailEl.querySelector(`[data-harpo-copy-status="${target}"]`);
      const snippet = codeEl?.textContent || "";
      const copied = await copyHarpoText(snippet);
      if (statusEl) {
        statusEl.textContent = copied ? "Copied" : "Copy failed";
        statusEl.dataset.state = copied ? "success" : "error";
        globalThis.setTimeout(() => {
          statusEl.textContent = "Click title to copy";
          delete statusEl.dataset.state;
        }, 1800);
      }
      if (!copied) {
        window.alert("HARPO could not copy this code sample to the clipboard.");
      }
    };
    trigger.addEventListener("click", handleCopy);
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      void handleCopy();
    });
  });
}

async function renderDetail({ entry, classification, hostname, startedMs = 0, sequence = 0 }) {
  const detailEl = document.getElementById("harpoDetail");
  if (!detailEl) return;
  const renderToken = ++detailRenderToken;

  const url        = entry?.request?.url || "";
  const method     = (entry?.request?.method || "GET").toUpperCase();
  const status     = entry?.response?.status || 0;
  const statusText = entry?.response?.statusText || "";
  const totalMs    = Math.round(entry?.time || 0);
  const sc         = status >= 500 ? "5xx" : status >= 400 ? "4xx" : status >= 300 ? "3xx" : status >= 200 ? "2xx" : "0";
  const reqHeaders  = entry?.request?.headers  || [];
  const respHeaders = entry?.response?.headers || [];
  const requestContentsMarkup = await buildRequestContentsBody(entry);
  const responsePayload = await extractResponsePayload(entry);
  const analysisContext = collectHarpoAnalysisContext(entry, responsePayload);
  const passLearningPlan = buildHarpoPassLearningPlan(entry, classification, analysisContext);
  const codeGenerationMarkup = buildHarpoCodeGenerationMarkup(entry);
  if (renderToken !== detailRenderToken) return;
  const fullTimestampLabel = formatHarpoTimestamp(startedMs, { includeDate: true });
  const statusLabel = statusText ? `${status} ${statusText}` : String(status || "—");
  const generalRows = [
    { name: "Sequence", value: formatHarpoSequence(sequence) },
    { name: "Started", value: fullTimestampLabel },
    { name: "Duration", value: totalMs ? `${totalMs} ms` : "Not recorded" },
    { name: "Request URL", value: url },
    { name: "Method", value: method },
    { name: "Status", value: statusLabel }
  ];
  const analysisCard = classification?.pass
    ? buildAdobePassAnalysisCard(entry, classification, analysisContext, passLearningPlan)
    : buildGenericAnalysisCard(entry, classification);
  detailEl.innerHTML = `
    <div class="harpo-detailFrame">
      <div class="harpo-detailHero">
        <div class="harpo-detailUrl-method-status">
          <span class="harpo-detailSequence">${escHtml(formatHarpoSequence(sequence))}</span>
          <span class="harpo-detailTimestamp">${escHtml(fullTimestampLabel)}</span>
        </div>
        <div class="harpo-detailUrl-method-status">
        <span class="harpo-methodBadge harpo-callMethod--${["GET","POST","DELETE","PUT"].includes(method) ? method : "OTHER"}">${method}</span>
        <span class="harpo-statusBadge harpo-statusBadge--${sc}">${escHtml(statusLabel)}</span>
        ${totalMs ? `<span class="harpo-timingBadge">${totalMs} ms</span>` : ""}
      </div>
        <div class="harpo-detailHeroTitle">${escHtml(classification.label)}</div>
        <div class="harpo-detailDomainRow">
          <span class="harpo-domainChip" title="${escHtml(hostname)}">${escHtml(hostname)}</span>
          <span class="harpo-analysisPhase harpo-phase--${classification.phase}">${classification.phase}</span>
        </div>
        <div class="harpo-detailUrl-full">${escHtml(url)}</div>
      </div>

      <div class="harpo-detailTabs" role="tablist" aria-label="Request details">
        <button class="harpo-detailTab" type="button" role="tab" aria-selected="false" data-harpo-detail-tab="analysis">Analysis</button>
        <button class="harpo-detailTab" type="button" role="tab" aria-selected="false" data-harpo-detail-tab="headers">Headers</button>
        <button class="harpo-detailTab" type="button" role="tab" aria-selected="false" data-harpo-detail-tab="payload">Payload</button>
        <button class="harpo-detailTab" type="button" role="tab" aria-selected="false" data-harpo-detail-tab="response">Response</button>
        <button class="harpo-detailTab" type="button" role="tab" aria-selected="false" data-harpo-detail-tab="code">Code</button>
      </div>

      <div class="harpo-detailPanel" data-harpo-detail-panel="analysis" hidden>
        ${analysisCard}
      </div>

      <div class="harpo-detailPanel" data-harpo-detail-panel="headers">
        <div class="harpo-detailCard">
          <div class="harpo-detailCard-header">
            <span class="harpo-detailCard-title">General</span>
          </div>
          <div class="harpo-detailCard-body">${buildNameValueTable(generalRows)}</div>
        </div>
        <div class="harpo-detailCard">
          <div class="harpo-detailCard-header">
            <span class="harpo-detailCard-title">Request Headers <span class="harpo-detailCard-count">(${reqHeaders.length})</span></span>
          </div>
          <div class="harpo-detailCard-body">${buildHeadersTable(reqHeaders)}</div>
        </div>
        <div class="harpo-detailCard">
          <div class="harpo-detailCard-header">
            <span class="harpo-detailCard-title">Response Headers <span class="harpo-detailCard-count">(${respHeaders.length})</span></span>
          </div>
          <div class="harpo-detailCard-body">${buildHeadersTable(respHeaders)}</div>
        </div>
      </div>

      <div class="harpo-detailPanel" data-harpo-detail-panel="payload" hidden>
        <div class="harpo-detailCard">
          <div class="harpo-detailCard-header">
            <span class="harpo-detailCard-title">Request Payload</span>
          </div>
          <div class="harpo-detailCard-body">${requestContentsMarkup || `<p class="harpo-detailEmptyNote">No query string, form fields, or raw request body were recorded for this request.</p>`}</div>
        </div>
      </div>

      <div class="harpo-detailPanel" data-harpo-detail-panel="response" hidden>
        <div class="harpo-detailCard">
          <div class="harpo-detailCard-header">
            <span class="harpo-detailCard-title">Response Body</span>
          </div>
          <div class="harpo-detailCard-body">
            ${responsePayload.meta ? `<div class="harpo-payloadMeta">${responsePayload.meta}</div>` : ""}
            ${responsePayload.html}
            ${responsePayload.jwtMarkup || ""}
            ${responsePayload.base64Markup || ""}
            ${responsePayload.samlMarkup || ""}
          </div>
        </div>
      </div>

      <div class="harpo-detailPanel" data-harpo-detail-panel="code" hidden>
        ${codeGenerationMarkup}
      </div>
    </div>
  `;

  wireDetailTabs(detailEl);
  detailEl.querySelectorAll(".harpo-detailCard-header[data-card]").forEach((header) => {
    header.addEventListener("click", () => {
      const body = document.getElementById(`harpo-card-${header.dataset.card}`);
      const icon = header.querySelector(".harpo-detailCard-toggle");
      if (!body) return;
      body.hidden = !body.hidden;
      icon?.classList.toggle("harpo-detailCard-toggle--open", !body.hidden);
    });
  });

  const learningBtn = detailEl.querySelector("[data-harpo-pass-learning]");
  const learningStatusEl = detailEl.querySelector("[data-harpo-pass-learning-status]");
  if (learningBtn instanceof HTMLButtonElement && learningStatusEl && passLearningPlan) {
    learningBtn.addEventListener("click", async () => {
      if (learningBtn.disabled) return;
      learningBtn.disabled = true;
      learningBtn.dataset.busy = "true";
      learningStatusEl.textContent = buildHarpoLearningStatusMessage(passLearningPlan, "opening");
      learningStatusEl.dataset.tone = "info";
      try {
        const result = passLearningPlan.kind === "dcr"
          ? await openHarpoDcrInteractiveDocsPlan(passLearningPlan)
          : await openHarpoRestV2InteractiveDocsPlan(passLearningPlan);
        if (renderToken !== detailRenderToken) return;
        if (result?.ok === true) {
          learningStatusEl.textContent = buildHarpoLearningStatusMessage(passLearningPlan, "success");
          learningStatusEl.dataset.tone = "success";
        } else if (result?.partial === true) {
          const unresolved = Array.isArray(result?.hydrationResult?.unresolvedRequiredFields)
            ? result.hydrationResult.unresolvedRequiredFields.filter(Boolean)
            : [];
          learningStatusEl.textContent = buildHarpoLearningStatusMessage(passLearningPlan, "partial", unresolved);
          learningStatusEl.dataset.tone = "warning";
        } else {
          learningStatusEl.textContent = String(result?.error || `HARPO could not hydrate the ${passLearningPlan.productLabel || "Adobe Pass"} Run form.`);
          learningStatusEl.dataset.tone = "error";
        }
      } catch (error) {
        if (renderToken !== detailRenderToken) return;
        learningStatusEl.textContent = error instanceof Error ? error.message : String(error || `HARPO could not hydrate the ${passLearningPlan.productLabel || "Adobe Pass"} Run form.`);
        learningStatusEl.dataset.tone = "error";
      } finally {
        if (renderToken !== detailRenderToken) return;
        learningBtn.disabled = false;
        delete learningBtn.dataset.busy;
      }
    });
  }

  wireHarpoCodeCopy(detailEl);
}

function buildHeadersTable(headers = []) {
  if (!headers.length) return `<p class="harpo-detailEmptyNote">No headers were recorded for this message.</p>`;
  return `<table class="harpo-kv-table">${
    headers.map(h => `<tr><td>${escHtml(h.name||"")}</td><td>${escHtml(h.value||"")}</td></tr>`).join("")
  }</table>`;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Download via Blob — no size limits ───────────────────────────────────────

function buildHarExportFilename(kind = "full") {
  const ts = new Date().toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
  const uploadedFileName = String(rawHarPayload?.fileName || "").trim();
  const uploadedBaseName = uploadedFileName
    ? uploadedFileName
      .split(/[\\/]/)
      .pop()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    : "";
  if (kind === "juiced" && uploadedBaseName) {
    return `${uploadedBaseName}-juiced-${ts}.har`;
  }
  const safeName = [programmerName, requestorId || requestorName]
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "recording";
  const suffix = kind === "juiced" ? "-juiced" : "";
  return `harpo-${safeName}${suffix}-${ts}.har`;
}

function cloneHarObject(value = null) {
  if (!value || typeof value !== "object") return null;
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function downloadHarObject(harObject = null, kind = "full") {
  if (!harObject?.log) return;
  const fileName = buildHarExportFilename(kind);
  const json = JSON.stringify(harObject, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function collectHarpoDomainsFromValue(value = "", baseUrl = "") {
  return dedupeHarpoDomainBuckets(
    String(value || "")
      .split(",")
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => {
        const parsed = parseHarpoUrlLike(item, baseUrl);
        if (parsed?.hostname) {
          return parsed.hostname;
        }
        return item;
      })
  );
}

function buildHarpoJuicerKeepDomains() {
  return dedupeHarpoDomainBuckets([
    ...safeDomains,
    ...reproDomains,
    ...(Array.isArray(rawHarPayload?.mvpdDomains) ? rawHarPayload.mvpdDomains : []),
    ...classifiedEntries
      .filter((record) => ["programmer", "mvpd"].includes(String(record?.classification?.domain || "").toLowerCase()))
      .map((record) => record.hostname)
  ]);
}

function collectHarpoJuicerEvidenceDomains(record = null) {
  const entry = record?.entry || null;
  if (!entry) return [];
  const harvest = collectHarpoAnalysisContext(entry);
  const responseJson = harvest?.responseJson && typeof harvest.responseJson === "object" ? harvest.responseJson : {};
  const requestJson = harvest?.requestJson && typeof harvest.requestJson === "object" ? harvest.requestJson : {};
  const candidateDomains = [
    record?.hostname,
    harvest?.requestUrlObject?.hostname,
    harvest?.redirectUrl?.hostname,
    harvest?.locationUrl?.hostname,
    harvest?.refererUrl?.hostname,
    harvest?.originUrl?.hostname,
    ...collectHarpoDomainsFromValue(getHeaderValue(entry?.request?.headers || [], "origin"), entry?.request?.url || ""),
    ...collectHarpoDomainsFromValue(getHeaderValue(entry?.request?.headers || [], "referer"), entry?.request?.url || ""),
    ...collectHarpoDomainsFromValue(getHeaderValue(entry?.response?.headers || [], "location"), entry?.request?.url || ""),
    ...collectHarpoDomainsFromValue(getHeaderValue(entry?.response?.headers || [], "access-control-allow-origin"), entry?.request?.url || ""),
    ...collectHarpoDomainsFromValue(getHarpoLookupValue(harvest?.requestValues || {}, ["domain_name", "domainname"])),
    ...collectHarpoDomainsFromValue(getHarpoLookupValue(harvest?.requestValues || {}, ["redirect_url", "redirecturl"]), entry?.request?.url || ""),
    ...collectHarpoDomainsFromValue(getHarpoLookupValue(harvest?.responseValues || {}, ["url", "redirect_url", "redirecturl"]), entry?.request?.url || ""),
    ...collectHarpoDomainsFromValue(String(responseJson?.url || ""), entry?.request?.url || ""),
    ...collectHarpoDomainsFromValue(String(responseJson?.redirectUrl || responseJson?.redirectURL || responseJson?.logoutUrl || responseJson?.logoutURL || ""), entry?.request?.url || ""),
    ...collectHarpoDomainsFromValue(String(requestJson?.redirect_uri || requestJson?.redirectUri || ""), entry?.request?.url || ""),
    ...(Array.isArray(harvest?.headerMvpdDomains) ? harvest.headerMvpdDomains : [])
  ];
  return dedupeHarpoDomainBuckets(candidateDomains);
}

function shouldIncludeInJuicedHarEntry(record = null, keepDomains = []) {
  const domain = String(record?.classification?.domain || "").toLowerCase();
  if (["pass", "ims", "programmer", "mvpd", "adobe"].includes(domain)) {
    return true;
  }
  const evidenceDomains = collectHarpoJuicerEvidenceDomains(record);
  return evidenceDomains.some((hostname) => isHarpoAdobeTraffic(hostname) || matchesHarpoDomainList(hostname, keepDomains));
}

function buildJuicedHar() {
  if (!rawHarPayload?.har?.log) return null;
  const keepDomains = buildHarpoJuicerKeepDomains();
  const juicedRecords = classifiedEntries.filter((record) => shouldIncludeInJuicedHarEntry(record, keepDomains));
  const juicedHar = cloneHarObject(rawHarPayload.har);
  if (!juicedHar?.log) return null;

  juicedHar.log.entries = juicedRecords.map((record) => cloneHarObject(record.entry)).filter(Boolean);
  const totalEntries = Array.isArray(rawHarPayload.har?.log?.entries) ? rawHarPayload.har.log.entries.length : 0;
  const contextLabel = [programmerName, requestorName || requestorId].filter(Boolean).join(" / ");
  const summary = `Generated by HARPO JUICER. Kept ${juicedHar.log.entries.length} of ${totalEntries} entries limited to Adobe Pass, Adobe IMS, Adobe ecosystem support, requestor-domain, and detected MVPD auth traffic${contextLabel ? ` for ${contextLabel}` : ""}.`;
  juicedHar.log.comment = juicedHar.log.comment ? `${juicedHar.log.comment}\n${summary}` : summary;
  return juicedHar;
}

function wireHarExportButtons() {
  const downloadBtn = document.getElementById("harpoDownloadBtn");
  const juicerBtn = document.getElementById("harpoJuicerBtn");
  const hasHar = Boolean(rawHarPayload?.har?.log);

  if (downloadBtn) {
    downloadBtn.hidden = !hasHar;
    downloadBtn.setAttribute(
      "aria-label",
      hasHar
        ? "Download Full HAR with the entire HARPO recording"
        : "Full HAR unavailable because HARPO has no recording loaded"
    );
    if (hasHar && downloadBtn.dataset.harpoWired !== "true") {
      downloadBtn.dataset.harpoWired = "true";
      downloadBtn.addEventListener("click", () => downloadHarObject(rawHarPayload?.har, "full"));
    }
  }

  if (juicerBtn) {
    const juicedHar = hasHar ? buildJuicedHar() : null;
    const juicedEntryCount = Array.isArray(juicedHar?.log?.entries) ? juicedHar.log.entries.length : 0;
    juicerBtn.hidden = !hasHar;
    juicerBtn.disabled = juicedEntryCount === 0;
    juicerBtn.setAttribute(
      "aria-label",
      juicedEntryCount
        ? `Download Pass HAR with ${juicedEntryCount} Adobe Pass, Adobe ecosystem, requestor-domain, IMS, and MVPD entries`
        : "Pass HAR unavailable because HARPO did not identify any Adobe Pass, Adobe ecosystem, requestor-domain, IMS, or MVPD entries"
    );
    if (hasHar && juicerBtn.dataset.harpoWired !== "true") {
      juicerBtn.dataset.harpoWired = "true";
      juicerBtn.addEventListener("click", () => {
        const nextJuicedHar = buildJuicedHar();
        if (!nextJuicedHar?.log?.entries?.length) return;
        downloadHarObject(nextJuicedHar, "juiced");
      });
    }
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

(async function init() {
  // Housekeeping: purge sessions older than 48 hours
  harpoIdbPurgeExpired(48 * 60 * 60 * 1000).catch(() => { });
  wireWorkspaceDivider();

  const hash = window.location.hash.replace(/^#/, "").trim();
  if (!hash.startsWith(HARPO_STORAGE_PREFIX)) {
    setLoadStatus("Invalid HARPO session key. Open HARPO from the LoginButton side panel.");
    return;
  }

  await loadFromIdb(hash);
  await hydrateHarpoThemePreference(rawHarPayload?.theme || DEFAULT_THEME);
  wireHarpoThemePreferenceSync();
})();
