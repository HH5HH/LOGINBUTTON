#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const [, , repoRootArg, stagingRootArg] = process.argv;

const DISTRO_MANIFEST_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4ggRrOiQdavkh68HgTSj/bSdfBx2OtHqAKWA9iEeCua5/oEQ9I8to7L+Rx5rzFHEFYP62MtAyUBvIrssFeiWrYN1UPO1tQKScTSbzgm2axbtdPLs9emkRv2QeKDECROnzijV4M/48YV6u1VCXYYUU8cTyV5TwwxvtEV/4BSooFdv2NhMxeRJjUOeOLtB8vGPNM567i6WMYX86iVuuBzTRNfQEoDnKBCzjSCgXE/ncMGT26aqP0PwhjBwbUDjk5JEgYXrbsqlO4MD8mAUXT+DSdHH6F2HMCO9DC7jmuRJetgBbMYh6SBsEmjm73MPf/paG0FJtSPcKejv6hOD79vORQIDAQAB";

if (!repoRootArg || !stagingRootArg) {
  console.error("Usage: build_loginbutton_distro.js <repo-root> <staging-root>");
  process.exit(1);
}

const repoRoot = path.resolve(repoRootArg);
const stagingRoot = path.resolve(stagingRootArg);
let copiedFileCount = 0;

function normalizeRelativePath(relativePath) {
  return String(relativePath || "")
    .split(path.sep)
    .join("/")
    .replace(/^\.\//u, "")
    .trim();
}

function shouldExcludeRelativePath(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return false;
  }

  const segments = normalizedPath.split("/");
  const basename = segments[segments.length - 1];

  if (segments.includes(".git") || segments.includes(".githooks")) {
    return true;
  }
  if (basename === ".DS_Store" || basename === "ZIP.KEY") {
    return true;
  }
  if (segments.length === 1 && /\.zip$/iu.test(basename)) {
    return true;
  }

  return false;
}

function resolveRelativePath(sourcePath) {
  const relativePath = path.relative(repoRoot, sourcePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return normalizeRelativePath(relativePath);
}

function copyFileToStaging(sourcePath, relativePath) {
  if (shouldExcludeRelativePath(relativePath)) {
    return;
  }

  const normalizedRelativePath = normalizeRelativePath(relativePath);
  const destinationPath = path.join(stagingRoot, normalizedRelativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
  fs.chmodSync(destinationPath, fs.statSync(sourcePath).mode);
  copiedFileCount += 1;
}

function walkAndCopyDirectory(directoryPath, baseRelativePath = "") {
  const directoryEntries = fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const directoryEntry of directoryEntries) {
    const relativePath = normalizeRelativePath(path.join(baseRelativePath, directoryEntry.name));
    if (shouldExcludeRelativePath(relativePath)) {
      continue;
    }

    const absolutePath = path.join(directoryPath, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      walkAndCopyDirectory(absolutePath, relativePath);
      continue;
    }

    if (directoryEntry.isFile()) {
      copyFileToStaging(absolutePath, relativePath);
    }
  }
}

function collectTrackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"]
    });

    return output
      .toString("utf8")
      .split("\0")
      .map((entry) => normalizeRelativePath(entry))
      .filter(Boolean)
      .filter((relativePath) => !shouldExcludeRelativePath(relativePath))
      .filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)))
      .filter((relativePath) => fs.statSync(path.join(repoRoot, relativePath)).isFile());
  } catch (error) {
    return [];
  }
}

function copyTrackedFilesAndDependencies() {
  const trackedFiles = collectTrackedFiles();
  if (trackedFiles.length === 0) {
    walkAndCopyDirectory(repoRoot);
    return;
  }

  trackedFiles
    .sort((left, right) => left.localeCompare(right))
    .forEach((relativePath) => {
      copyFileToStaging(path.join(repoRoot, relativePath), relativePath);
    });

  const nodeModulesPath = path.join(repoRoot, "node_modules");
  if (fs.existsSync(nodeModulesPath) && fs.statSync(nodeModulesPath).isDirectory()) {
    walkAndCopyDirectory(nodeModulesPath, "node_modules");
  }
}

function injectPackagedManifestKey() {
  const manifestPath = path.join(stagingRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("manifest.json not found.");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.key = DISTRO_MANIFEST_KEY;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

copyTrackedFilesAndDependencies();
injectPackagedManifestKey();

if (copiedFileCount === 0) {
  console.error("No extension files available to package.");
  process.exit(1);
}
