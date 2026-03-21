#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const [, , repoRootArg, stagingRootArg] = process.argv;

if (!repoRootArg || !stagingRootArg) {
  console.error("Usage: build_loginbutton_distro.js <repo-root> <staging-root>");
  process.exit(1);
}

const repoRoot = path.resolve(repoRootArg);
const stagingRoot = path.resolve(stagingRootArg);
const includedFiles = new Set();
const queue = [];

function isLocalAssetSpecifier(rawSpecifier) {
  const specifier = String(rawSpecifier || "").trim();
  if (!specifier) {
    return false;
  }

  const normalized = specifier.toLowerCase();
  if (
    normalized.startsWith("http:") ||
    normalized.startsWith("https:") ||
    normalized.startsWith("data:") ||
    normalized.startsWith("blob:") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("tel:") ||
    normalized.startsWith("javascript:") ||
    normalized.startsWith("chrome:") ||
    normalized.startsWith("chrome-extension:") ||
    normalized.startsWith("about:")
  ) {
    return false;
  }

  if (specifier.startsWith("#")) {
    return false;
  }

  return true;
}

function normalizeSpecifier(rawSpecifier) {
  return String(rawSpecifier || "")
    .trim()
    .replace(/^url\(/i, "")
    .replace(/\)$/u, "")
    .replace(/^['"]|['"]$/g, "")
    .split("#")[0]
    .split("?")[0]
    .trim();
}

function resolveLocalPath(fromFile, rawSpecifier) {
  const specifier = normalizeSpecifier(rawSpecifier);
  if (!isLocalAssetSpecifier(specifier)) {
    return null;
  }

  let resolvedPath = "";
  if (specifier.startsWith("/")) {
    resolvedPath = path.resolve(repoRoot, `.${specifier}`);
  } else if (specifier.startsWith("@")) {
    resolvedPath = path.resolve(repoRoot, "node_modules", specifier);
  } else {
    resolvedPath = path.resolve(path.dirname(fromFile), specifier);
  }

  const relativePath = path.relative(repoRoot, resolvedPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    return null;
  }

  return resolvedPath;
}

function enqueue(filePath) {
  const normalizedPath = path.resolve(filePath);
  if (includedFiles.has(normalizedPath)) {
    return;
  }

  includedFiles.add(normalizedPath);
  queue.push(normalizedPath);
}

function copyToStaging(sourcePath) {
  const relativePath = path.relative(repoRoot, sourcePath);
  const destinationPath = path.join(stagingRoot, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function addManifestEntries(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const addLiteral = (relativePath) => {
    const resolvedPath = resolveLocalPath(filePath, relativePath);
    if (resolvedPath) {
      enqueue(resolvedPath);
    }
  };

  const addMaybeArray = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        addLiteral(item);
      }
      return;
    }

    addLiteral(value);
  };

  addMaybeArray(Object.values(manifest.icons || {}));
  addMaybeArray(Object.values(manifest.action?.default_icon || {}));
  addMaybeArray(Object.values(manifest.side_panel?.default_icon || {}));
  addMaybeArray(Object.values(manifest.options_ui?.icons || {}));
  addMaybeArray(Object.values(manifest.chrome_url_overrides || {}));
  addMaybeArray(manifest.background?.scripts);
  addMaybeArray(manifest.background?.service_worker);
  addMaybeArray(manifest.action?.default_popup);
  addMaybeArray(manifest.devtools_page);
  addMaybeArray(manifest.options_page);
  addMaybeArray(manifest.options_ui?.page);
  addMaybeArray(manifest.side_panel?.default_path);
  addMaybeArray(manifest.sandbox?.pages);

  for (const contentScript of manifest.content_scripts || []) {
    addMaybeArray(contentScript.js);
    addMaybeArray(contentScript.css);
  }

  for (const resourceBlock of manifest.web_accessible_resources || []) {
    for (const resource of resourceBlock.resources || []) {
      if (!String(resource || "").includes("*")) {
        addLiteral(resource);
      }
    }
  }
}

function addHtmlDependencies(filePath, sourceText) {
  const attributePattern = /\b(?:src|href)=["']([^"'#]+)["']/g;
  for (const match of sourceText.matchAll(attributePattern)) {
    const resolvedPath = resolveLocalPath(filePath, match[1]);
    if (resolvedPath) {
      enqueue(resolvedPath);
    }
  }
}

function addJsDependencies(filePath, sourceText) {
  const staticImportPattern = /\b(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const importMetaUrlPattern = /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;

  for (const pattern of [staticImportPattern, dynamicImportPattern, importMetaUrlPattern]) {
    for (const match of sourceText.matchAll(pattern)) {
      const resolvedPath = resolveLocalPath(filePath, match[1]);
      if (resolvedPath) {
        enqueue(resolvedPath);
      }
    }
  }
}

function addCssDependencies(filePath, sourceText) {
  const importPattern = /@import\s+(?:url\(\s*)?["']?([^"'()]+)["']?\s*\)?/g;
  const urlPattern = /url\(\s*["']?([^"'()]+)["']?\s*\)/g;

  for (const pattern of [importPattern, urlPattern]) {
    for (const match of sourceText.matchAll(pattern)) {
      const resolvedPath = resolveLocalPath(filePath, match[1]);
      if (resolvedPath) {
        enqueue(resolvedPath);
      }
    }
  }
}

function processFile(filePath) {
  copyToStaging(filePath);

  const extension = path.extname(filePath).toLowerCase();
  if (![".json", ".html", ".js", ".mjs", ".css"].includes(extension)) {
    return;
  }

  const sourceText = fs.readFileSync(filePath, "utf8");
  if (path.basename(filePath) === "manifest.json") {
    addManifestEntries(filePath);
    return;
  }

  if (extension === ".html") {
    addHtmlDependencies(filePath, sourceText);
    return;
  }

  if (extension === ".js" || extension === ".mjs") {
    addJsDependencies(filePath, sourceText);
    return;
  }

  if (extension === ".css") {
    addCssDependencies(filePath, sourceText);
  }
}

const manifestPath = path.join(repoRoot, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("manifest.json not found.");
  process.exit(1);
}

enqueue(manifestPath);

while (queue.length > 0) {
  const nextFile = queue.shift();
  processFile(nextFile);
}

if (includedFiles.size === 0) {
  console.error("No extension files available to package.");
  process.exit(1);
}
