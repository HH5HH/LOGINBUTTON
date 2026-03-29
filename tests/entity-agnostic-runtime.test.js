const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME_SOURCES = [
  "app.js",
  "app.html",
  "app.css",
  "background.js",
  "harpo.js",
  "harpo.html",
  "harpo.css",
  "harpo-capture.js",
  "harpo-traffic.js",
  "harpo-app-additions.js",
  "vault.js"
];

const KNOWN_ENTITY_LITERALS = [
  /\bTurner\b/,
  /\bAdultSwim\b/,
  /\bBleacher\b/,
  /\bMML\b/,
  /\bNBADE\b/,
  /\bCBS_SPORTS\b/,
  /\btruTV\b/,
  /\bfbc-fox\b/,
  /\bFOX_Prod\b/,
  /\bCBS_RESTV2\b/
];

function readRuntimeSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("runtime source stays free of developer paths and known entity literals", () => {
  for (const relativePath of RUNTIME_SOURCES) {
    const source = readRuntimeSource(relativePath);
    assert.doesNotMatch(
      source,
      /\/Users\/|\/Documents\/|UnderPAR|UPtool/,
      `${relativePath} should not hard-code developer-specific filesystem or project paths`
    );

    for (const pattern of KNOWN_ENTITY_LITERALS) {
      assert.doesNotMatch(
        source,
        pattern,
        `${relativePath} should not hard-code entity literal ${pattern}`
      );
    }
  }
});

test("runtime source does not branch on programmer, requestor, or MVPD string literals", () => {
  const directEntityBranchPattern =
    /\b(?:selectedProgrammerId|selectedRequestorId|selectedMvpdId|programmerId|requestorId|mvpdId|selectedProgrammer\?\.(?:id|key)|selectedRequestor\?\.(?:id|key)|selectedMvpd\?\.(?:id|key))\b[^\n]{0,120}(?:===|==|!==|!=)\s*["'`](?!["'`])[A-Za-z0-9_.:-]+["'`]/;
  const reverseEntityBranchPattern =
    /["'`](?!["'`])[A-Za-z0-9_.:-]+["'`]\s*(?:===|==|!==|!=)[^\n]{0,120}\b(?:selectedProgrammerId|selectedRequestorId|selectedMvpdId|programmerId|requestorId|mvpdId|selectedProgrammer\?\.(?:id|key)|selectedRequestor\?\.(?:id|key)|selectedMvpd\?\.(?:id|key))\b/;
  const entitySwitchPattern =
    /switch\s*\([^)\n]{0,120}\b(?:selectedProgrammerId|selectedRequestorId|selectedMvpdId|programmerId|requestorId|mvpdId)\b[^)\n]{0,120}\)[\s\S]{0,400}?case\s*["'`](?!["'`])[A-Za-z0-9_.:-]+["'`]/;

  for (const relativePath of RUNTIME_SOURCES.filter((filePath) => filePath.endsWith(".js"))) {
    const source = readRuntimeSource(relativePath);
    assert.doesNotMatch(
      source,
      directEntityBranchPattern,
      `${relativePath} should stay entity-agnostic on direct programmer/requestor/MVPD comparisons`
    );
    assert.doesNotMatch(
      source,
      reverseEntityBranchPattern,
      `${relativePath} should stay entity-agnostic on reverse programmer/requestor/MVPD comparisons`
    );
    assert.doesNotMatch(
      source,
      entitySwitchPattern,
      `${relativePath} should not switch on programmer/requestor/MVPD literals`
    );
  }
});
