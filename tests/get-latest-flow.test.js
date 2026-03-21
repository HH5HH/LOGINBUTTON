const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function extractFunctionSource(source, functionName) {
  const markers = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start !== -1) {
      break;
    }
  }
  assert.notEqual(start, -1, `Unable to locate ${functionName}`);
  const paramsStart = source.indexOf("(", start);
  assert.notEqual(paramsStart, -1, `Unable to locate params for ${functionName}`);
  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") paramsDepth += 1;
    if (char === ")") {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.notEqual(bodyStart, -1, `Unable to locate body for ${functionName}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Unterminated function: ${functionName}`);
}

function loadGetLatestHelpers(seed = {}) {
  const filePath = path.join(ROOT, "background.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const LOGINBUTTON_GITHUB_OWNER = "HH5HH";',
    'const LOGINBUTTON_GITHUB_REPO = "LOGINBUTTON";',
    'const LOGINBUTTON_LATEST_REF_API_URL = `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/git/ref/heads/main`;',
    'const LOGINBUTTON_LATEST_COMMIT_API_URL = `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/commits/main`;',
    'const LOGINBUTTON_PACKAGE_METADATA_PATH = "loginbutton_distro.version.json";',
    'const LOGINBUTTON_LATEST_PACKAGE_METADATA_URL = `https://raw.githubusercontent.com/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/main/${LOGINBUTTON_PACKAGE_METADATA_PATH}`;',
    'const LOGINBUTTON_LATEST_PACKAGE_METADATA_API_URL = `https://api.github.com/repos/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/contents/${LOGINBUTTON_PACKAGE_METADATA_PATH}?ref=main`;',
    'const LOGINBUTTON_LATEST_PACKAGE_URL = `https://raw.githubusercontent.com/${LOGINBUTTON_GITHUB_OWNER}/${LOGINBUTTON_GITHUB_REPO}/main/loginbutton_distro.zip`;',
    'const LOGINBUTTON_LOCAL_PACKAGE_PATH = "loginbutton_distro.zip";',
    'const CHROME_EXTENSIONS_URL = "chrome://extensions";',
    'const UPDATE_CHECK_TTL_MS = 10 * 60 * 1000;',
    "const chrome = globalThis.__seed.chrome;",
    "const fetch = globalThis.__seed.fetch;",
    "const updateState = globalThis.__seed.updateState || { currentVersion: '', latestVersion: '', latestCommitSha: '', updateAvailable: false, lastCheckedAt: 0, checkError: '', inFlight: null };",
    extractFunctionSource(source, "getLoginButtonBuildVersion"),
    extractFunctionSource(source, "parseVersionPart"),
    extractFunctionSource(source, "compareVersions"),
    extractFunctionSource(source, "extractVersionFromManifestObject"),
    extractFunctionSource(source, "buildLatestLoginButtonPackageMetadataRawUrl"),
    extractFunctionSource(source, "buildLatestLoginButtonPackageMetadataApiUrl"),
    extractFunctionSource(source, "fetchLatestLoginButtonVersionFromRaw"),
    extractFunctionSource(source, "fetchLatestLoginButtonVersionFromGithubApi"),
    extractFunctionSource(source, "fetchLatestLoginButtonVersion"),
    extractFunctionSource(source, "normalizeCommitSha"),
    extractFunctionSource(source, "extractCommitShaFromRefPayload"),
    extractFunctionSource(source, "extractCommitShaFromCommitPayload"),
    extractFunctionSource(source, "fetchLatestLoginButtonCommitShaFromRefApi"),
    extractFunctionSource(source, "fetchLatestLoginButtonCommitShaFromCommitApi"),
    extractFunctionSource(source, "fetchLatestLoginButtonCommitSha"),
    extractFunctionSource(source, "withCacheBust"),
    extractFunctionSource(source, "buildLatestLoginButtonPackageUrl"),
    extractFunctionSource(source, "buildLocalLoginButtonPackageUrl"),
    extractFunctionSource(source, "shouldPreferLocalLoginButtonPackage"),
    extractFunctionSource(source, "sanitizeLatestPackageFileSegment"),
    extractFunctionSource(source, "buildLatestLoginButtonPackageFileName"),
    extractFunctionSource(source, "startLatestPackageDownload"),
    extractFunctionSource(source, "getUpdateStatePayload"),
    extractFunctionSource(source, "refreshUpdateState"),
    extractFunctionSource(source, "openLoginButtonGetLatestFlow"),
    "module.exports = { buildLatestLoginButtonPackageUrl, getUpdateStatePayload, refreshUpdateState, openLoginButtonGetLatestFlow, updateState };"
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
    atob: (value) => Buffer.from(String(value || ""), "base64").toString("utf8")
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function createSeed(options = {}) {
  const calls = {
    fetch: [],
    downloadsDownload: [],
    tabsCreate: []
  };
  const responseByUrl = new Map(Object.entries(options.responseByUrl || {}));
  return {
    calls,
    chrome: {
      runtime: {
        getManifest() {
          return { version: String(options.currentVersion || "1.0.0") };
        },
        getURL(pathname = "") {
          return `chrome-extension://loginbutton/${String(pathname || "").replace(/^\/+/, "")}`;
        }
      },
      downloads: {
        async download(info = {}) {
          calls.downloadsDownload.push({ ...info });
          if (options.downloadShouldFail === true) {
            throw new Error("download failed");
          }
          return Number(options.downloadId || 91);
        }
      },
      tabs: {
        async create(info = {}) {
          calls.tabsCreate.push({ ...info });
          return {
            id: calls.tabsCreate.length,
            windowId: 1,
            url: String(info.url || "")
          };
        }
      }
    },
    async fetch(url) {
      const targetUrl = String(url || "");
      calls.fetch.push(targetUrl);
      if (responseByUrl.has(targetUrl)) {
        return responseByUrl.get(targetUrl);
      }
      return {
        ok: false,
        status: 404,
        async json() {
          return {};
        }
      };
    },
    updateState: {
      currentVersion: "",
      latestVersion: "",
      latestCommitSha: "",
      updateAvailable: false,
      lastCheckedAt: 0,
      checkError: "",
      inFlight: null
    }
  };
}

test("openLoginButtonGetLatestFlow uses a SHA-pinned loginbutton_distro.zip when GitHub ref lookup succeeds", async () => {
  const latestSha = "0123456789abcdef0123456789abcdef01234567";
  const seed = createSeed({
    currentVersion: "1.0.0",
    responseByUrl: {
      [`https://raw.githubusercontent.com/HH5HH/LOGINBUTTON/${latestSha}/loginbutton_distro.version.json`]: {
        ok: true,
        status: 200,
        async json() {
          return { version: "9.9.9" };
        }
      },
      "https://raw.githubusercontent.com/HH5HH/LOGINBUTTON/main/loginbutton_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "9.9.9" };
        }
      },
      "https://api.github.com/repos/HH5HH/LOGINBUTTON/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: latestSha } };
        }
      }
    }
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openLoginButtonGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(String(response.latestCommitSha || ""), latestSha);
  assert.equal(response.downloadStarted, true);
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.equal(seed.calls.tabsCreate.length, 1);
  const downloadUrl = String(seed.calls.downloadsDownload[0]?.url || "");
  assert.match(downloadUrl, new RegExp(`/${latestSha}/loginbutton_distro\\.zip\\?cacheBust=\\d+$`));
  assert.equal(downloadUrl.includes("/main/loginbutton_distro.zip"), false);
  assert.match(String(seed.calls.downloadsDownload[0]?.filename || ""), /^LoginButton-v9\.9\.9-0123456\.zip$/);
  assert.equal(String(seed.calls.tabsCreate[0]?.url || ""), "chrome://extensions");
});

test("openLoginButtonGetLatestFlow prefers the local runtime package when the loaded build is newer than GitHub main", async () => {
  const seed = createSeed({
    currentVersion: "1.2.98",
    responseByUrl: {
      "https://raw.githubusercontent.com/HH5HH/LOGINBUTTON/main/loginbutton_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "1.2.97" };
        }
      },
      "https://api.github.com/repos/HH5HH/LOGINBUTTON/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: "89abcdef0123456789abcdef0123456789abcdef" } };
        }
      }
    }
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openLoginButtonGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(String(response.downloadSource || ""), "local-runtime");
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.equal(
    String(seed.calls.downloadsDownload[0]?.url || "").startsWith("chrome-extension://loginbutton/loginbutton_distro.zip?cacheBust="),
    true
  );
  assert.equal(String(seed.calls.downloadsDownload[0]?.filename || ""), "LoginButton-v1.2.98.zip");
});

test("openLoginButtonGetLatestFlow falls back to main loginbutton_distro.zip with cache bust when SHA lookup fails", async () => {
  const seed = createSeed({
    currentVersion: "1.0.0",
    responseByUrl: {
      "https://raw.githubusercontent.com/HH5HH/LOGINBUTTON/main/loginbutton_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "9.9.9" };
        }
      }
    }
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openLoginButtonGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(String(response.latestCommitSha || ""), "");
  assert.equal(response.downloadStarted, true);
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.equal(seed.calls.tabsCreate.length, 1);
  const downloadUrl = String(seed.calls.downloadsDownload[0]?.url || "");
  assert.match(downloadUrl, /\/main\/loginbutton_distro\.zip\?cacheBust=\d+$/);
  assert.match(String(seed.calls.downloadsDownload[0]?.filename || ""), /^LoginButton-v9\.9\.9\.zip$/);
  assert.equal(String(seed.calls.tabsCreate[0]?.url || ""), "chrome://extensions");
});

test("openLoginButtonGetLatestFlow falls back to opening the package tab when downloads API fails", async () => {
  const latestSha = "fedcba9876543210fedcba9876543210fedcba98";
  const seed = createSeed({
    currentVersion: "1.0.0",
    downloadShouldFail: true,
    responseByUrl: {
      "https://raw.githubusercontent.com/HH5HH/LOGINBUTTON/main/loginbutton_distro.version.json": {
        ok: true,
        status: 200,
        async json() {
          return { version: "8.8.8" };
        }
      },
      "https://api.github.com/repos/HH5HH/LOGINBUTTON/git/ref/heads/main": {
        ok: true,
        status: 200,
        async json() {
          return { object: { sha: latestSha } };
        }
      }
    }
  });

  const helpers = loadGetLatestHelpers(seed);
  const response = await helpers.openLoginButtonGetLatestFlow();

  assert.equal(response.ok, true);
  assert.equal(response.downloadStarted, false);
  assert.equal(response.downloadTabOpened, true);
  assert.equal(seed.calls.downloadsDownload.length, 1);
  assert.equal(seed.calls.tabsCreate.length, 2);
  assert.match(String(seed.calls.tabsCreate[0]?.url || ""), new RegExp(`/${latestSha}/loginbutton_distro\\.zip\\?cacheBust=\\d+$`));
  assert.equal(String(seed.calls.tabsCreate[1]?.url || ""), "chrome://extensions");
});

test("LoginButton app exposes a Get Latest action wired to the background flow", () => {
  const appHtml = fs.readFileSync(path.join(ROOT, "app.html"), "utf8");
  const appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");

  assert.match(appHtml, /id="getLatestButton"/);
  assert.match(appSource, /const LOGINBUTTON_GET_LATEST_REQUEST_TYPE = "loginbutton:getLatest";/);
  assert.match(appSource, /getLatestButton\.addEventListener\("click", async \(\) => \{/);
  assert.match(appSource, /Starting latest LoginButton download and opening chrome:\/\/extensions\./);
  assert.match(backgroundSource, /const LOGINBUTTON_GET_LATEST_REQUEST_TYPE = "loginbutton:getLatest"/);
});
