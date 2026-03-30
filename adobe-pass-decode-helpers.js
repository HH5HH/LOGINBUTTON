(function attachAdobePassDecodeHelpers(globalObject, factory) {
  const root = globalObject || globalThis;
  const helpers = factory(root);
  root.AdobePassDecodeHelpers = helpers;
  if (typeof module === "object" && module.exports) {
    module.exports = helpers;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildAdobePassDecodeHelpers(root) {
  function uniqueStringArray(values = []) {
    return Array.from(
      new Set(
        (Array.isArray(values) ? values : [values])
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      )
    );
  }

  function firstNonEmptyString(values = []) {
    for (const value of Array.isArray(values) ? values : [values]) {
      const text = String(value ?? "").trim();
      if (text) {
        return text;
      }
    }
    return "";
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function tryParseJson(text, fallback = null) {
    if (typeof text !== "string" || !text.trim()) {
      return fallback;
    }
    try {
      return JSON.parse(text);
    } catch {
      return fallback;
    }
  }

  function prettyPrintJson(text) {
    const parsed = tryParseJson(text, null);
    return parsed === null ? String(text || "") : JSON.stringify(parsed, null, 2);
  }

  function prettyPrintXml(text) {
    const normalized = String(text || "").trim().replace(/>\s*</g, ">\n<");
    if (!normalized) {
      return "";
    }
    const lines = normalized.split("\n");
    let depth = 0;
    return lines
      .map((line) => {
        const trimmed = line.trim();
        if (/^<\//.test(trimmed)) {
          depth = Math.max(depth - 1, 0);
        }
        const formatted = `${"  ".repeat(depth)}${trimmed}`;
        if (/^<[^!?/][^>]*[^/]>\s*$/.test(trimmed) && !trimmed.includes("</")) {
          depth += 1;
        }
        return formatted;
      })
      .join("\n");
  }

  function decodeHtmlEntities(text) {
    const value = String(text || "");
    if (!value || typeof root.DOMParser !== "function") {
      return value;
    }
    try {
      const doc = new root.DOMParser().parseFromString(`<!doctype html><body>${value}`, "text/html");
      return doc.body?.textContent || value;
    } catch {
      return value;
    }
  }

  function sanitizeBase64Value(text = "") {
    const normalized = String(text || "")
      .trim()
      .replace(/[\r\n]/g, "")
      .replace(/\s+/g, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    if (!normalized) {
      return "";
    }
    const remainder = normalized.length % 4;
    return remainder === 0 ? normalized : `${normalized}${"=".repeat(4 - remainder)}`;
  }

  function looksLikeBase64Value(text = "") {
    const normalized = String(text || "")
      .trim()
      .replace(/[\r\n]/g, "")
      .replace(/\s+/g, "");
    if (!normalized || normalized.length < 8) {
      return false;
    }
    return /^[A-Za-z0-9+/_-]+={0,2}$/.test(normalized);
  }

  function extractDirectBase64CarrierFromText(rawText = "") {
    const normalized = String(rawText || "").trim();
    if (!normalized) {
      return "";
    }
    const directCandidates = uniqueStringArray([
      normalized,
      tryDecodeURIComponentValue(normalized)
    ]).filter((candidate) => looksLikeBase64Value(candidate) && !isProbablyJwt(candidate));
    if (directCandidates.length > 0) {
      return directCandidates[0];
    }
    const parsed = tryParseJson(normalized, null);
    if (typeof parsed === "string") {
      const parsedCandidates = uniqueStringArray([
        parsed,
        tryDecodeURIComponentValue(parsed)
      ]).filter((candidate) => looksLikeBase64Value(candidate) && !isProbablyJwt(candidate));
      if (parsedCandidates.length > 0) {
        return parsedCandidates[0];
      }
    }
    return "";
  }

  function decodeBase64Binary(value = "") {
    const normalized = sanitizeBase64Value(value);
    if (!normalized || typeof root.atob !== "function") {
      return "";
    }
    try {
      return root.atob(normalized);
    } catch {
      return "";
    }
  }

  function decodeBinaryUtf8(binary = "") {
    const raw = String(binary || "");
    if (!raw) {
      return "";
    }
    try {
      const bytes = Uint8Array.from(raw, (entry) => entry.charCodeAt(0));
      if (typeof root.TextDecoder === "function") {
        return new root.TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0/g, "");
      }
    } catch {
      return raw;
    }
    return raw;
  }

  function decodeBase64Utf8Text(value = "") {
    const binary = decodeBase64Binary(value);
    return binary ? decodeBinaryUtf8(binary) : "";
  }

  function decodeBase64UrlText(value = "") {
    return decodeBase64Utf8Text(value);
  }

  function tryDecodeURIComponentValue(text = "") {
    const value = String(text || "");
    if (!/%[0-9A-Fa-f]{2}/.test(value)) {
      return "";
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return "";
    }
  }

  function chunkMonospaceText(value = "", chunkSize = 64) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return "";
    }
    const chunks = [];
    for (let index = 0; index < normalized.length; index += chunkSize) {
      chunks.push(normalized.slice(index, index + chunkSize));
    }
    return chunks.join("\n");
  }

  function normalizeJwtTimestamp(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "";
    }
    const milliseconds = numeric > 1000000000000 ? numeric : numeric * 1000;
    try {
      return new Date(milliseconds).toLocaleString();
    } catch {
      return "";
    }
  }

  function isProbablyJwt(value = "") {
    const normalized = String(value || "").trim();
    return normalized.length >= 30 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(normalized);
  }

  function extractJwtCandidateFromValue(value, seen = new Set()) {
    if (typeof value === "string") {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return "";
      }
      const compact = normalized.replace(/\s+/g, "");
      const candidates = uniqueStringArray([normalized, compact]);
      for (const candidate of candidates) {
        if (isProbablyJwt(candidate)) {
          return candidate;
        }
        const bearerMatch = candidate.match(/bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i);
        if (bearerMatch?.[1] && isProbablyJwt(bearerMatch[1])) {
          return bearerMatch[1];
        }
      }
      return "";
    }
    if (!value || typeof value !== "object") {
      return "";
    }
    if (seen.has(value)) {
      return "";
    }
    seen.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) {
        const candidate = extractJwtCandidateFromValue(entry, seen);
        if (candidate) {
          return candidate;
        }
      }
      return "";
    }
    for (const entry of Object.values(value)) {
      const candidate = extractJwtCandidateFromValue(entry, seen);
      if (candidate) {
        return candidate;
      }
    }
    return "";
  }

  function extractJwtCandidateFromText(rawText = "") {
    const normalized = String(rawText || "").trim();
    if (!normalized) {
      return "";
    }
    const direct = extractJwtCandidateFromValue(normalized);
    if (direct) {
      return direct;
    }
    const parsed = tryParseJson(normalized, null);
    return parsed && typeof parsed === "object" ? extractJwtCandidateFromValue(parsed) : "";
  }

  function extractDirectJwtCarrierFromText(rawText = "") {
    const normalized = String(rawText || "").trim();
    if (!normalized) {
      return "";
    }
    const directCandidates = uniqueStringArray([
      normalized,
      tryDecodeURIComponentValue(normalized)
    ]);
    for (const candidate of directCandidates) {
      const directToken = extractJwtCandidateFromValue(candidate);
      if (directToken) {
        return directToken;
      }
    }
    const parsed = tryParseJson(normalized, null);
    if (typeof parsed === "string") {
      const parsedCandidates = uniqueStringArray([
        parsed,
        tryDecodeURIComponentValue(parsed)
      ]);
      for (const candidate of parsedCandidates) {
        const directToken = extractJwtCandidateFromValue(candidate);
        if (directToken) {
          return directToken;
        }
      }
    }
    return "";
  }

  function decodeJwtSection(token = "", index = 0) {
    const parts = String(token || "").trim().split(".");
    const rawValue = String(parts[index] || "").trim();
    const text = decodeBase64UrlText(rawValue);
    const parsed = tryParseJson(text, null);
    return {
      rawValue,
      text,
      parsed: isPlainObject(parsed) ? parsed : null
    };
  }

  function collectJwtScopeValues(payload = null) {
    if (!payload || typeof payload !== "object") {
      return [];
    }
    const scopeCandidates = [];
    const append = (value) => {
      if (value == null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => append(entry));
        return;
      }
      if (typeof value === "object") {
        append(value.scope);
        append(value.scopes);
        append(value.permissions);
        append(value.value);
        return;
      }
      String(value || "")
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => scopeCandidates.push(entry));
    };
    append(payload.scope);
    append(payload.scopes);
    append(payload.permissions);
    append(payload.client?.scope);
    append(payload.client?.scopes);
    append(payload.clientApplication?.scope);
    append(payload.clientApplication?.scopes);
    return uniqueStringArray(scopeCandidates);
  }

  function buildJwtInspectionSummary(result = null) {
    const header = isPlainObject(result?.header) ? result.header : {};
    const payload = isPlainObject(result?.payload) ? result.payload : {};
    const audience = uniqueStringArray(Array.isArray(payload.aud) ? payload.aud : [payload.aud]).join(", ");
    return {
      algorithm: firstNonEmptyString([header.alg]),
      type: firstNonEmptyString([header.typ]),
      keyId: firstNonEmptyString([header.kid]),
      issuer: firstNonEmptyString([payload.iss, payload.issuer]),
      subject: firstNonEmptyString([payload.sub, payload.subject]),
      audience,
      clientId: firstNonEmptyString([payload.client_id, payload.clientId, payload.azp]),
      issuedAt: normalizeJwtTimestamp(payload.iat),
      notBefore: normalizeJwtTimestamp(payload.nbf),
      expiresAt: normalizeJwtTimestamp(payload.exp),
      scopes: collectJwtScopeValues(payload)
    };
  }

  function decodeJwtToken(token = "") {
    const normalized = String(token || "").trim();
    const parts = normalized.split(".");
    const headerSection = decodeJwtSection(normalized, 0);
    const payloadSection = decodeJwtSection(normalized, 1);
    const valid = parts.length === 3 && Boolean(headerSection.parsed) && Boolean(payloadSection.parsed);
    const result = {
      token: normalized,
      valid,
      header: headerSection.parsed,
      payload: payloadSection.parsed,
      headerSegment: headerSection.rawValue,
      payloadSegment: payloadSection.rawValue,
      signatureSegment: String(parts[2] || "").trim(),
      headerText: headerSection.text,
      payloadText: payloadSection.text,
      error: valid ? "" : "Could not parse this JWT into a valid header and payload object."
    };
    result.summary = buildJwtInspectionSummary(result);
    return result;
  }

  function isDecodedTextUsable(value = "", sourceValue = "") {
    const normalized = String(value || "").trim();
    if (!normalized || normalized === String(sourceValue || "").trim()) {
      return false;
    }
    const printableCharacterCount = [...normalized].filter((character) => {
      const code = character.charCodeAt(0);
      return character === "\n" || character === "\r" || character === "\t" || (code >= 32 && code !== 127);
    }).length;
    return printableCharacterCount / Math.max(1, normalized.length) >= 0.8;
  }

  function extractBase64CandidateFromValue(value, seen = new Set()) {
    if (typeof value === "string") {
      const normalized = String(value || "").trim();
      if (!normalized || isProbablyJwt(normalized)) {
        return "";
      }
      const directCandidates = uniqueStringArray([normalized, tryDecodeURIComponentValue(normalized)]);
      for (const candidate of directCandidates) {
        const decoded = decodeBase64Utf8Text(candidate);
        if (isDecodedTextUsable(decoded, candidate)) {
          return candidate;
        }
      }
      return "";
    }
    if (!value || typeof value !== "object") {
      return "";
    }
    if (seen.has(value)) {
      return "";
    }
    seen.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) {
        const candidate = extractBase64CandidateFromValue(entry, seen);
        if (candidate) {
          return candidate;
        }
      }
      return "";
    }
    for (const entry of Object.values(value)) {
      const candidate = extractBase64CandidateFromValue(entry, seen);
      if (candidate) {
        return candidate;
      }
    }
    return "";
  }

  function extractBase64CandidateFromText(rawText = "") {
    const normalized = String(rawText || "").trim();
    if (!normalized) {
      return "";
    }
    const directCandidate = extractBase64CandidateFromValue(normalized);
    if (directCandidate) {
      return directCandidate;
    }
    const parsed = tryParseJson(normalized, null);
    return parsed && typeof parsed === "object" ? extractBase64CandidateFromValue(parsed) : "";
  }

  function inspectBase64Value(rawInput = "") {
    const normalizedInput = String(rawInput || "").trim();
    if (!normalizedInput) {
      return null;
    }
    const candidate = extractBase64CandidateFromText(normalizedInput) || (looksLikeBase64Value(normalizedInput) ? normalizedInput : "");
    if (!candidate) {
      return null;
    }
    const candidateOptions = uniqueStringArray([candidate, tryDecodeURIComponentValue(candidate)]).filter(looksLikeBase64Value);
    for (const option of candidateOptions) {
      if (isProbablyJwt(option)) {
        continue;
      }
      const decodedText = decodeBase64Utf8Text(option);
      if (!isDecodedTextUsable(decodedText, option)) {
        continue;
      }
      const parsedJson = tryParseJson(decodedText, null);
      let displayValue = decodedText.trim();
      let decodedFormat = "text";
      if (parsedJson && typeof parsedJson === "object") {
        decodedFormat = "json";
        displayValue = JSON.stringify(parsedJson, null, 2);
      } else if (/^\s*</.test(decodedText)) {
        decodedFormat = "xml";
        displayValue = prettyPrintXml(decodedText.trim());
      }
      return {
        encodedValue: option,
        decodedValue: decodedText.trim(),
        displayValue,
        decodedFormat,
        characterCount: displayValue.length
      };
    }
    return null;
  }

  function looksLikeSamlXml(text = "") {
    const value = String(text || "").trim();
    if (!value.startsWith("<")) {
      return false;
    }
    return /<(?:\w+:)?(?:AuthnRequest|Response|Assertion|LogoutRequest|LogoutResponse|ArtifactResolve|EntityDescriptor|EntitiesDescriptor)\b/i.test(value) ||
      /urn:oasis:names:tc:SAML/i.test(value);
  }

  function isSamlFieldName(name = "") {
    return /(saml|wresult)/i.test(String(name || ""));
  }

  function isSamlSupportFieldName(name = "") {
    return /^(RelayState|SigAlg|Signature|SAMLEncoding|KeyInfo|wa|wctx|wreply|wtrealm)$/i.test(String(name || ""));
  }

  function getSamlSupportingFields(originName, pairs = []) {
    const useWsFedSupport = /^wresult$/i.test(String(originName || ""));
    return (Array.isArray(pairs) ? pairs : []).filter((pair) => {
      const name = String(pair?.name || "");
      if (!name || name === originName) {
        return false;
      }
      if (useWsFedSupport) {
        return /^(wa|wctx|wreply|wtrealm)$/i.test(name);
      }
      return /^(RelayState|SigAlg|Signature|SAMLEncoding|KeyInfo)$/i.test(name);
    });
  }

  function extractHtmlFormPairs(text = "") {
    if (!text || typeof root.DOMParser !== "function") {
      return [];
    }
    try {
      const doc = new root.DOMParser().parseFromString(text, "text/html");
      return Array.from(doc.querySelectorAll("input[name], textarea[name], select[name]"))
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
    const parsed = tryParseJson(text, null);
    if (parsed === null) {
      return [];
    }

    const pairs = [];
    const visit = (value, keyPath = "", depth = 0) => {
      if (depth > 6) {
        return;
      }
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
      if (typeof value !== "string" || !keyPath) {
        return;
      }
      if (isSamlFieldName(keyPath) || isSamlSupportFieldName(keyPath) || /(saml|oasis:names:tc:SAML)/i.test(value)) {
        pairs.push({ name: keyPath, value });
      }
    };

    visit(parsed);
    return pairs;
  }

  function extractPayloadFieldPairs(text = "", contentType = "") {
    const bodyText = String(text || "");
    const normalizedType = String(contentType || "").split(";")[0].trim().toLowerCase();
    if (!bodyText) {
      return [];
    }
    if (normalizedType === "application/x-www-form-urlencoded") {
      return Array.from(new URLSearchParams(bodyText).entries()).map(([name, value]) => ({ name, value }));
    }
    if (normalizedType === "application/json" || normalizedType.endsWith("+json") || /^\s*[\[{]/.test(bodyText)) {
      return extractJsonFieldPairs(bodyText);
    }
    if (normalizedType === "text/html" || /<form\b/i.test(bodyText) || /<(?:input|textarea|select)\b/i.test(bodyText)) {
      return extractHtmlFormPairs(bodyText);
    }
    return [];
  }

  function binaryStringToUint8Array(text = "") {
    return Uint8Array.from(String(text || ""), (char) => char.charCodeAt(0));
  }

  async function inflateBytes(bytes, format) {
    if (!bytes?.length || typeof root.DecompressionStream !== "function" || typeof root.Blob !== "function" || typeof root.Response !== "function") {
      return "";
    }
    try {
      const stream = new root.Blob([bytes]).stream().pipeThrough(new root.DecompressionStream(format));
      const buffer = await new root.Response(stream).arrayBuffer();
      if (typeof root.TextDecoder === "function") {
        return new root.TextDecoder().decode(buffer);
      }
      return decodeBinaryUtf8(String.fromCharCode(...new Uint8Array(buffer)));
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
    const value = String(rawValue || "").trim();
    if (!value) {
      return null;
    }

    const candidates = [];
    const pushCandidate = (candidate, decodeHint = "") => {
      const text = String(candidate || "").trim();
      if (!text || candidates.some((entry) => entry.text === text)) {
        return;
      }
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
      const binary = decodeBase64Binary(candidate.text);
      if (!binary) {
        continue;
      }
      const directText = decodeHtmlEntities(decodeBinaryUtf8(binary));
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

  async function extractSamlMatches({ pairs = [], rawText = "", rawFieldName = "raw-body" } = {}) {
    const safePairs = Array.isArray(pairs) ? pairs.filter((pair) => pair?.name) : [];
    const matches = [];
    const seenKeys = new Set();

    for (const pair of safePairs) {
      const shouldInspect = isSamlFieldName(pair.name) || isSamlSupportFieldName(pair.name);
      if (!shouldInspect && !/(saml|oasis:names:tc:SAML)/i.test(String(pair.value || ""))) {
        continue;
      }
      const decoded = await decodeSamlValue(pair.name, pair.value);
      if (!decoded) {
        continue;
      }
      const key = `${pair.name}::${pair.value}`;
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      matches.push({
        originName: pair.name,
        originValue: String(pair.value || ""),
        decodedXml: decoded.decodedXml,
        decodeMethod: decoded.decodeMethod,
        supportingFields: getSamlSupportingFields(pair.name, safePairs)
      });
    }

    if (!matches.length && rawText) {
      const decoded = await decodeSamlValue(rawFieldName, rawText);
      if (decoded) {
        matches.push({
          originName: rawFieldName,
          originValue: String(rawText || ""),
          decodedXml: decoded.decodedXml,
          decodeMethod: decoded.decodeMethod,
          supportingFields: []
        });
      }
    }

    return matches;
  }

  function extractJwtMatches({ pairs = [], rawText = "", rawFieldName = "raw-body" } = {}) {
    const matches = [];
    const seenTokens = new Set();
    const safePairs = Array.isArray(pairs) ? pairs.filter((pair) => pair?.name) : [];
    const sources = safePairs.map((pair) => ({
      originName: pair.name,
      originValue: String(pair.value || "")
    }));
    const rawTextSource = extractDirectJwtCarrierFromText(rawText);
    if (rawTextSource) {
      sources.push({
        originName: rawFieldName,
        originValue: rawTextSource
      });
    }

    sources.forEach((source) => {
      const token = extractJwtCandidateFromText(source.originValue);
      if (!token || seenTokens.has(token)) {
        return;
      }
      seenTokens.add(token);
      matches.push({
        originName: source.originName,
        originValue: source.originValue,
        token,
        inspection: decodeJwtToken(token)
      });
    });

    return matches;
  }

  function extractBase64Matches({ pairs = [], rawText = "", rawFieldName = "raw-body" } = {}) {
    const matches = [];
    const seenValues = new Set();
    const safePairs = Array.isArray(pairs) ? pairs.filter((pair) => pair?.name) : [];
    const sources = safePairs.map((pair) => ({
      originName: pair.name,
      originValue: String(pair.value || "")
    }));
    const rawTextSource = extractDirectBase64CarrierFromText(rawText);
    if (rawTextSource) {
      sources.push({
        originName: rawFieldName,
        originValue: rawTextSource
      });
    }

    sources.forEach((source) => {
      const inspection = inspectBase64Value(source.originValue);
      if (!inspection || seenValues.has(inspection.encodedValue)) {
        return;
      }
      seenValues.add(inspection.encodedValue);
      matches.push({
        originName: source.originName,
        originValue: source.originValue,
        inspection
      });
    });

    return matches;
  }

  async function inspectSamlInput(rawInput = "", options = {}) {
    const rawText = String(rawInput || "").trim();
    const pairs = extractPayloadFieldPairs(rawText, String(options?.contentType || ""));
    const matches = await extractSamlMatches({
      pairs,
      rawText,
      rawFieldName: String(options?.rawFieldName || "input")
    });
    return {
      rawText,
      pairs,
      matches
    };
  }

  return Object.freeze({
    uniqueStringArray,
    firstNonEmptyString,
    isPlainObject,
    tryParseJson,
    prettyPrintJson,
    prettyPrintXml,
    decodeHtmlEntities,
    sanitizeBase64Value,
    looksLikeBase64Value,
    extractDirectBase64CarrierFromText,
    decodeBase64Binary,
    decodeBinaryUtf8,
    decodeBase64Utf8Text,
    decodeBase64UrlText,
    tryDecodeURIComponentValue,
    chunkMonospaceText,
    normalizeJwtTimestamp,
    isProbablyJwt,
    extractJwtCandidateFromValue,
    extractJwtCandidateFromText,
    extractDirectJwtCarrierFromText,
    decodeJwtToken,
    isDecodedTextUsable,
    extractBase64CandidateFromValue,
    extractBase64CandidateFromText,
    inspectBase64Value,
    looksLikeSamlXml,
    isSamlFieldName,
    isSamlSupportFieldName,
    getSamlSupportingFields,
    extractHtmlFormPairs,
    extractJsonFieldPairs,
    extractPayloadFieldPairs,
    inflateBytes,
    decodeSamlValue,
    extractSamlMatches,
    extractJwtMatches,
    extractBase64Matches,
    inspectSamlInput
  });
});
