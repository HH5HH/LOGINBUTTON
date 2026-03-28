/**
 * HARPO Workspace — harpo.js
 * Reads session from IndexedDB (no storage quota limits).
 * Classifies Adobe Pass + MVPD calls, renders full analysis workspace.
 * Download via URL.createObjectURL — handles HAR files of any size.
 */

import { harpoIdbGet, harpoIdbDelete, harpoIdbPurgeExpired } from "./harpo-idb.js";
import {
  classifyHarpoEntry,
  getHarpoTrafficDomainBucket,
  getHarpoTrafficHostname,
  isHarpoAdobeTraffic,
  isHarpoPassTraffic
} from "./harpo-traffic.js";

const HARPO_STORAGE_PREFIX = "harpo:";
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
    if (classification.label.includes("Create")) {
      annotations.push({ key: "Purpose", value: "Initiate auth session. Returns auth code + MVPD login URL." });
      if (reqHeaders["ap-device-identifier"]) annotations.push({ key: "Device ID", value: reqHeaders["ap-device-identifier"] });
    } else {
      annotations.push({ key: "Purpose", value: "Resume or poll existing auth session using the auth code." });
    }
  }

  if (classification.phase === "Profiles") {
    annotations.push({ key: "Purpose", value: "Check for valid authenticated profile. Non-empty response = user is authenticated." });
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

function buildPayloadMetaBadges({ contentType = "", encoding = "", size = 0, decoded = false }) {
  const badges = [];
  if (contentType) badges.push(`<span class="harpo-payloadBadge">${escHtml(normalizeContentType(contentType))}</span>`);
  if (Number.isFinite(size) && size > 0) badges.push(`<span class="harpo-payloadMetaItem">${escHtml(`${size} bytes`)}</span>`);
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

function buildPayloadViewer({ rawText = "", contentType = "", encoding = "", size = 0, emptyMessage = "No body recorded." }) {
  const { normalizedType, decoded, bodyText } = getDecodedPayloadText({ rawText, contentType, encoding });

  if (!bodyText) {
    if (encoding === "base64" && !isTextualContentType(normalizedType)) {
      return {
        hasBody: true,
        meta: buildPayloadMetaBadges({ contentType, encoding, size }),
        bodyText,
        normalizedType,
        html: `<div class="harpo-payloadNotice">Binary response captured as base64. HARPO is preserving the payload metadata instead of dumping unreadable bytes.</div>`
      };
    }
    return {
      hasBody: false,
      meta: buildPayloadMetaBadges({ contentType, encoding, size, decoded }),
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
    return `<p class="harpo-detailEmptyNote">No query string, form fields, or raw request body were recorded for this request.</p>`;
  }

  return sections.join("");
}

async function extractResponsePayload(entry) {
  const content = entry?.response?.content || {};
  const headers = entry?.response?.headers || [];
  const contentType = content?.mimeType || getHeaderValue(headers, "content-type");
  const payload = buildPayloadViewer({
    rawText: content?.text || "",
    contentType,
    encoding: content?.encoding || "",
    size: Number(content?.size || 0),
    emptyMessage: "No response body was recorded for this response."
  });
  if (!payload.hasBody) {
    const comment = String(content?.comment || "").trim();
    if (comment) {
      payload.html = `<div class="harpo-payloadNotice">${escHtml(comment)}</div>`;
      payload.hasBody = true;
      return payload;
    }
    if (Number(content?.size || 0) > 0) {
      payload.html = `<div class="harpo-payloadNotice">This HAR references a non-zero response body size, but the body bytes were not embedded in the HAR payload. For uploaded HAR files, that means the source HAR did not include content. For live HARPO recordings, this means Chrome did not expose the body for this request.</div>`;
      payload.hasBody = true;
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

function getJsonBodyFromResponse(entry) {
  const content = entry?.response?.content || {};
  const contentType = content?.mimeType || getHeaderValue(entry?.response?.headers || [], "content-type");
  const rawText = content?.encoding === "base64" && isTextualContentType(contentType)
    ? decodeBase64Text(content?.text || "")
    : (content?.text || "");
  return tryParseJson(rawText);
}

function buildPassRuntimeNotes(entry, classification) {
  const notes = [];
  const reqHeaders = indexHeaders(entry?.request?.headers);
  const respHeaders = indexHeaders(entry?.response?.headers);
  const responseJson = getJsonBodyFromResponse(entry);
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
  if (pass?.params?.code) {
    notes.push(`Authentication code carried in the path: ${truncateMiddle(pass.params.code)}.`);
  }

  if (pass?.family === "rest-v2" && !reqHeaders.authorization) {
    notes.push("REST API V2 normally expects an Authorization bearer token, but this request did not record one.");
  }
  if (reqHeaders.authorization) {
    notes.push(`Authorization header present (${reqHeaders.authorization.toLowerCase().startsWith("bearer ") ? "Bearer token" : "custom scheme"}).`);
  }
  if (reqHeaders["ap-device-identifier"]) {
    notes.push(`AP-Device-Identifier was sent: ${truncateMiddle(reqHeaders["ap-device-identifier"])}`);
  }
  if (reqHeaders["ap-visitor-identifier"]) {
    notes.push(`AP-Visitor-Identifier was sent: ${truncateMiddle(reqHeaders["ap-visitor-identifier"])}`);
  }
  if (reqHeaders["x-forwarded-for"]) {
    notes.push(`X-Forwarded-For was present, which is recommended when the programmer service calls REST API V2 on behalf of a device.`);
  }
  if (reqHeaders["ap-temppass-identity"]) {
    notes.push(`AP-TempPass-Identity was present, so this call is participating in a TempPass or promotional TempPass flow.`);
  }

  if (status >= 400) {
    notes.push(`HTTP ${status} means the network call failed at transport level, so inspect the response payload for Adobe-specific code, action, or message fields.`);
  }

  if (respHeaders.location) {
    try {
      const locationUrl = new URL(respHeaders.location, entry?.request?.url || "");
      notes.push(`Response redirects to ${locationUrl.hostname}${locationUrl.pathname}.`);
    } catch {
      notes.push("Response includes a Location header, which means the browser is being redirected to the next authentication step.");
    }
  }

  if (responseJson && typeof responseJson === "object") {
    if (responseJson.actionName) {
      notes.push(`Adobe Pass returned actionName=${responseJson.actionName}, which is the next runtime instruction from the control plane.`);
    }
    if (responseJson.authorized !== undefined) {
      notes.push(`Authorization decision: authorized=${String(responseJson.authorized)}.`);
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
    if (responseJson.attributes && typeof responseJson.attributes === "object") {
      const attributeKeys = Object.keys(responseJson.attributes);
      if (attributeKeys.length) {
        notes.push(`Profile attributes returned: ${attributeKeys.join(", ")}.`);
      }
    }
  }

  return notes;
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

function buildSupportStatusListLead(pass) {
  const supportDoc = getPassSupportDocumentation(pass);
  if (pass?.support?.status === "legacy") {
    const unsupportedLabel = supportDoc?.url
      ? `<a class="harpo-inlineLink" href="${escHtml(supportDoc.url)}" target="_blank" rel="noreferrer noopener">UNSUPPORTED LEGACY V1</a>`
      : "UNSUPPORTED LEGACY V1";
    return `<li>${unsupportedLabel} Adobe Pass call. HARPO treats only DCR, REST API V2, and the current SSO service guidance as supported implementation targets, so this flow should be migrated.</li>`;
  }
  const supportedLabel = supportDoc?.url
    ? `<a class="harpo-inlineLink" href="${escHtml(supportDoc.url)}" target="_blank" rel="noreferrer noopener">SUPPORTED</a>`
    : "SUPPORTED";
  const supportFamily = pass?.family === "dcr-v2" ? "Adobe Pass 2026 DCR" : "Adobe Pass 2026 REST V2";
  return `<li>${supportedLabel} ${escHtml(supportFamily)} call.</li>`;
}

function buildAdobePassAnalysisCard(entry, classification) {
  const pass = classification?.pass;
  if (!pass) return "";
  const runtimeNotes = buildPassRuntimeNotes(entry, classification);
  const familyBadgeClass = pass.family === "legacy-v1"
    ? "harpo-analysisBadge--legacy"
    : pass.family === "dcr-v2"
      ? "harpo-analysisBadge--dcr"
      : "harpo-analysisBadge--modern";
  const supportBadge = pass.support?.status === "legacy"
    ? `<span class="harpo-analysisBadge harpo-analysisBadge--unsupported">Past published support window</span>`
    : `<span class="harpo-analysisBadge harpo-analysisBadge--supported">Supported model</span>`;
  const migrationBlock = pass.migration ? `
    <div class="harpo-migrationBox">
      <div class="harpo-migrationBox-title">${escHtml(pass.migration.title || "REST V2 migration")}</div>
      <p class="harpo-migrationBox-copy">${escHtml(pass.migration.summary || "")}</p>
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
  const analysisNotes = [buildSupportStatusListLead(pass), ...[...(pass.notes || []), ...runtimeNotes].map((note) => `<li>${escHtml(note)}</li>`)].join("");

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
        <div class="harpo-analysisLead">${escHtml(pass.summary || classification.label)}</div>
        <div class="harpo-analysisSection">
          <div class="harpo-analysisSection-title">What this call does</div>
          <p class="harpo-analysisParagraph">${escHtml(pass.purpose || "")}</p>
        </div>
        <div class="harpo-analysisSection">
          <div class="harpo-analysisSection-title">What HARPO learned from this request</div>
          <ul class="harpo-analysisList">
            ${analysisNotes}
          </ul>
        </div>
        ${pass.support?.status === "legacy" ? `
          <div class="harpo-analysisSection">
            <div class="harpo-analysisSection-title">Support status</div>
            <p class="harpo-analysisParagraph">${escHtml(`${pass.support.note} HARPO flags this call as legacy and recommends migration to REST API V2.`)}</p>
          </div>
        ` : ""}
        ${migrationBlock}
        <div class="harpo-analysisSection">
          <div class="harpo-analysisSection-title">Official documentation</div>
          ${buildDocumentationLinks(pass.docs)}
        </div>
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

function isProgrammerDomainHost(hostname) {
  const normalizedHost = String(hostname || "").toLowerCase();
  return programmerDomains.some((domain) => {
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
let programmerDomains  = [];   // programmer's own domains — not MVPD
let sessionKey         = "";
let detailRenderToken  = 0;

// ─── IndexedDB load ───────────────────────────────────────────────────────────

async function loadFromIdb(key) {
  setLoadStatus("Reading HAR from IndexedDB…");
  try {
    const payload = await harpoIdbGet(key);
    if (!payload) {
      setLoadStatus("Session not found. It may have expired or been from a previous browser session.");
      return;
    }
    sessionKey       = key;
    programmerName   = payload.programmerName || "";
    programmerDomains = Array.isArray(payload.programmerDomains) ? payload.programmerDomains : [];
    rawHarPayload    = payload;
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

  classifiedEntries = entries
    .map((entry, idx) => {
      const url = entry?.request?.url || "";
      const hostname = getHarpoTrafficHostname(url);
      const domainBucket = getHarpoTrafficDomainBucket(hostname);

      if (!adobeGateOpen && isHarpoAdobeTraffic(url)) {
        adobeGateOpen = true;
      }
      if (!passGateOpen && isHarpoPassTraffic(url)) {
        passGateOpen = true;
      }

      const classification = classifyHarpoEntry(entry, {
        programmerDomains,
        adobeGateOpen,
        passGateOpen,
        mvpdGateOpen
      });

      const location = getHeaderValue(entry?.response?.headers || [], "location");
      if (classification?.domain === "pass" && classification.phase === "AuthN" && location && !isHarpoAdobeTraffic(location) && !isProgrammerDomainHost(getHarpoTrafficHostname(location))) {
        mvpdGateOpen = true;
      } else if (mvpdGateOpen && isProgrammerDomainHost(hostname)) {
        mvpdGateOpen = false;
      }
      if (!classification) return null;
      return { idx, entry, classification, hostname, domainBucket };
    })
    .filter(Boolean);

  renderAll();
}

// ─── Render pipeline ──────────────────────────────────────────────────────────

function setLoadStatus(msg) {
  const el = document.getElementById("harpoLoadStatus");
  if (el) el.textContent = msg;
}

function renderAll() {
  renderMeta();
  renderDomainFilters();
  renderStatusFilters();
  renderCallList();
  wireDownloadButton();
}

function renderMeta() {
  const el = document.getElementById("harpoMeta");
  if (!el) return;
  const parts = [];
  const uniqueDomainCount = new Set(classifiedEntries.map((entry) => entry.domainBucket)).size;
  if (programmerName)              parts.push(programmerName);
  if (harData?.log?.creator?.name) parts.push(`via ${harData.log.creator.name}`);
  if (classifiedEntries.length)    parts.push(`${classifiedEntries.length} entries across ${uniqueDomainCount} domains`);
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
      renderStatusFilters();
      renderCallList();
    });
  });
}

function getFilteredEntries() {
  return classifiedEntries.filter(c => {
    if (activeDomainFilter !== "all" && c.domainBucket !== activeDomainFilter) return false;
    const status = Number(c?.entry?.response?.status || 0);
    if (activeStatusFilter !== "all" && String(status) !== activeStatusFilter) return false;
    return true;
  });
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

function renderCallList() {
  const el = document.getElementById("harpoCallList");
  if (!el) return;
  el.innerHTML = "";

  const filtered = getFilteredEntries();
  const visibleSelection = filtered.some((entry) => entry.idx === selectedIndex);
  if (!visibleSelection) {
    selectedIndex = -1;
  }
  if (filtered.length === 0) {
    el.innerHTML = `<div class="harpo-empty">
      <p class="spectrum-Heading spectrum-Heading--sizeM harpo-empty-title">No matching calls</p>
      <p class="spectrum-Body spectrum-Body--sizeS harpo-empty-body">Adjust the domain or status filters to inspect another slice of traffic.</p>
    </div>`;
    renderEmptyDetail("No matching calls", "Choose another domain or status filter to inspect a different slice of traffic.");
    return;
  }
  if (selectedIndex === -1) {
    renderEmptyDetail("Select a call", "Click any network entry on the left to inspect its request, response, and Pass analysis.");
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach(({ idx, entry, classification, hostname }) => {
    const url    = entry?.request?.url || "";
    const method = (entry?.request?.method || "GET").toUpperCase();
    const status = entry?.response?.status || 0;
    const path   = (() => { try { return new URL(url).pathname; } catch { return url; } })();
    const sc     = status >= 500 ? "5xx" : status >= 400 ? "4xx" : status >= 300 ? "3xx" : status >= 200 ? "2xx" : "0";

    const item = document.createElement("div");
    item.className = `harpo-callItem${status >= 400 ? " harpo-callItem--error" : ""}${selectedIndex === idx ? " harpo-callItem--selected" : ""}`;
    item.setAttribute("role", "listitem");
    item.dataset.idx = idx;
    item.innerHTML = `
      <span class="harpo-callMethod harpo-callMethod--${["GET","POST","DELETE","PUT"].includes(method) ? method : "OTHER"}">${method}</span>
      <span class="harpo-callPath" title="${escHtml(path)}">${escHtml(path)}</span>
      <span class="harpo-callClassification">
        <span class="harpo-domainChip" title="${escHtml(hostname)}">${escHtml(hostname)}</span>
        <span class="harpo-phaseChip harpo-phase--${classification.phase}" style="font-size:0.6rem;padding:1px 5px">${classification.phase}</span>
        <span class="harpo-callClassificationText">${escHtml(classification.label)}</span>
      </span>
      <span class="harpo-callStatus harpo-callStatus--${sc}">${status || "—"}</span>`;
    item.addEventListener("click", () => selectEntry(idx));
    fragment.appendChild(item);
  });
  el.appendChild(fragment);
}

function selectEntry(idx) {
  selectedIndex = idx;
  renderCallList();
  const c = classifiedEntries.find(x => x.idx === idx);
  if (c) void renderDetail(c);
}

async function renderDetail({ entry, classification, hostname }) {
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
  if (renderToken !== detailRenderToken) return;
  const analysisCard = classification?.pass
    ? buildAdobePassAnalysisCard(entry, classification)
    : buildGenericAnalysisCard(entry, classification);

  detailEl.innerHTML = `
    <div class="harpo-detailUrl">
      <div class="harpo-detailUrl-method-status">
        <span class="harpo-methodBadge harpo-callMethod--${["GET","POST","DELETE","PUT"].includes(method) ? method : "OTHER"}">${method}</span>
        <span class="harpo-statusBadge harpo-statusBadge--${sc}">${status} ${escHtml(statusText)}</span>
        ${totalMs ? `<span class="harpo-timingBadge">${totalMs} ms</span>` : ""}
      </div>
      <div class="harpo-detailDomainRow">
        <span class="harpo-domainChip" title="${escHtml(hostname)}">${escHtml(hostname)}</span>
        <span class="harpo-analysisPhase harpo-phase--${classification.phase}">${classification.phase}</span>
        <span class="harpo-analysisDesc">${escHtml(classification.label)}</span>
      </div>
      <div class="harpo-detailUrl-full">${escHtml(url)}</div>
    </div>

    ${analysisCard}

    <div class="harpo-detailCard">
      <div class="harpo-detailCard-header" data-card="reqHeaders">
        <span class="harpo-detailCard-title">Request Headers <span style="font-weight:400;font-size:0.7em">(${reqHeaders.length})</span></span>
        <span class="harpo-detailCard-toggle">▼</span>
      </div>
      <div class="harpo-detailCard-body" id="harpo-card-reqHeaders" hidden>${buildHeadersTable(reqHeaders)}</div>
    </div>

    <div class="harpo-detailCard">
      <div class="harpo-detailCard-header" data-card="reqContents">
        <span class="harpo-detailCard-title">Request Contents</span>
        <span class="harpo-detailCard-toggle harpo-detailCard-toggle--open">▼</span>
      </div>
      <div class="harpo-detailCard-body" id="harpo-card-reqContents">
        ${requestContentsMarkup}
      </div>
    </div>

    <div class="harpo-detailCard">
      <div class="harpo-detailCard-header" data-card="respHeaders">
        <span class="harpo-detailCard-title">Response Headers <span style="font-weight:400;font-size:0.7em">(${respHeaders.length})</span></span>
        <span class="harpo-detailCard-toggle">▼</span>
      </div>
      <div class="harpo-detailCard-body" id="harpo-card-respHeaders" hidden>${buildHeadersTable(respHeaders)}</div>
    </div>

    <div class="harpo-detailCard">
      <div class="harpo-detailCard-header" data-card="respBody">
        <span class="harpo-detailCard-title">Response Body</span>
        <span class="harpo-detailCard-toggle harpo-detailCard-toggle--open">▼</span>
      </div>
      <div class="harpo-detailCard-body" id="harpo-card-respBody">
        ${responsePayload.meta ? `<div class="harpo-payloadMeta">${responsePayload.meta}</div>` : ""}
        ${responsePayload.html}
        ${responsePayload.jwtMarkup || ""}
        ${responsePayload.base64Markup || ""}
        ${responsePayload.samlMarkup || ""}
      </div>
    </div>
  `;

  detailEl.querySelectorAll(".harpo-detailCard-header").forEach(header => {
    header.addEventListener("click", () => {
      const body = document.getElementById(`harpo-card-${header.dataset.card}`);
      const icon = header.querySelector(".harpo-detailCard-toggle");
      if (!body) return;
      body.hidden = !body.hidden;
      icon?.classList.toggle("harpo-detailCard-toggle--open", !body.hidden);
    });
  });
}

function buildHeadersTable(headers = []) {
  if (!headers.length) return `<p style="font-size:0.78rem;color:var(--spectrum-neutral-subdued-content-color-default)">No headers.</p>`;
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

function wireDownloadButton() {
  const btn = document.getElementById("harpoDownloadBtn");
  if (!btn || !rawHarPayload?.har) return;
  btn.hidden = false;
  if (btn.dataset.harpoWired === "true") return;
  btn.dataset.harpoWired = "true";
  btn.addEventListener("click", () => {
    const ts       = new Date().toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
    const safeName = (programmerName || "recording").replace(/[^a-zA-Z0-9]/g, "-");
    const fileName = `harpo-${safeName}-${ts}.har`;
    const json     = JSON.stringify(rawHarPayload.har, null, 2);
    const blob     = new Blob([json], { type: "application/json" });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    a.href         = url;
    a.download     = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

(async function init() {
  // Housekeeping: purge sessions older than 48 hours
  harpoIdbPurgeExpired(48 * 60 * 60 * 1000).catch(() => { });

  const hash = window.location.hash.replace(/^#/, "").trim();
  if (!hash.startsWith(HARPO_STORAGE_PREFIX)) {
    setLoadStatus("Invalid HARPO session key. Open HARPO from the LoginButton side panel.");
    return;
  }

  await loadFromIdb(hash);
})();
