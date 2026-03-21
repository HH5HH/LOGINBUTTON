const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT_PATH = path.join(ROOT, "scripts", "build_loginbutton_distro.sh");
const BUILDER_PATH = path.join(ROOT, "scripts", "build_loginbutton_distro.js");

function runCommand(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

test("distribution build packages tracked source plus dependencies without mutating the manifest", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "loginbutton-distro-test-"));
  const repoDir = path.join(tempRoot, "repo");
  const scriptsDir = path.join(repoDir, "scripts");
  const iconsDir = path.join(repoDir, "icons");
  const nodeModuleDir = path.join(repoDir, "node_modules", "demo-spectrum");
  const hooksDir = path.join(repoDir, ".githooks");
  const artifactPath = path.join(repoDir, "loginbutton_distro.zip");

  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(iconsDir, { recursive: true });
  fs.mkdirSync(nodeModuleDir, { recursive: true });
  fs.mkdirSync(hooksDir, { recursive: true });

  fs.copyFileSync(SCRIPT_PATH, path.join(scriptsDir, "build_loginbutton_distro.sh"));
  fs.copyFileSync(BUILDER_PATH, path.join(scriptsDir, "build_loginbutton_distro.js"));
  fs.chmodSync(path.join(scriptsDir, "build_loginbutton_distro.sh"), 0o755);

  fs.writeFileSync(
    path.join(repoDir, "manifest.json"),
    JSON.stringify(
      {
        manifest_version: 3,
        name: "Login Button",
        version: "1.0.0",
        background: {
          service_worker: "background.js",
          type: "module"
        },
        side_panel: {
          default_path: "app.html"
        },
        icons: {
          16: "icons/icon_16.png"
        }
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(repoDir, "background.js"), 'import "./vault.js";\n');
  fs.writeFileSync(
    path.join(repoDir, "app.html"),
    [
      "<!doctype html>",
      '<html><head><link rel="stylesheet" href="spectrum.css"><link rel="stylesheet" href="app.css"></head>',
      '<body><script type="module" src="app.js"></script></body></html>'
    ].join("")
  );
  fs.writeFileSync(path.join(repoDir, "app.js"), 'import "./shared.js";\n');
  fs.writeFileSync(path.join(repoDir, "shared.js"), 'console.log("shared");\n');
  fs.writeFileSync(path.join(repoDir, "vault.js"), 'console.log("vault");\n');
  fs.writeFileSync(path.join(repoDir, "app.css"), "body { color: black; }\n");
  fs.writeFileSync(path.join(repoDir, "spectrum.css"), '@import "./node_modules/demo-spectrum/base.css";\n');
  fs.writeFileSync(path.join(nodeModuleDir, "base.css"), '@import "./theme.css";\nbody { background: url("./icon.svg"); }\n');
  fs.writeFileSync(path.join(nodeModuleDir, "theme.css"), "body { border: 0; }\n");
  fs.writeFileSync(path.join(nodeModuleDir, "icon.svg"), "<svg></svg>\n");
  fs.writeFileSync(path.join(iconsDir, "icon_16.png"), "png\n");
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Login Button\n");
  fs.writeFileSync(path.join(repoDir, "AGENTS.md"), "# Agent notes\n");
  fs.writeFileSync(path.join(repoDir, "ZIP.KEY"), "super-secret\n");
  fs.writeFileSync(path.join(hooksDir, "pre-commit"), "#!/usr/bin/env bash\n");
  fs.writeFileSync(path.join(repoDir, "legacy_distro.zip"), "legacy\n");
  fs.writeFileSync(path.join(repoDir, "loginbutton_old.zip"), "old\n");
  fs.writeFileSync(artifactPath, "stale\n");
  runCommand("git", ["init", "-q"], repoDir);
  runCommand(
    "git",
    [
      "add",
      "manifest.json",
      "background.js",
      "app.html",
      "app.js",
      "shared.js",
      "vault.js",
      "app.css",
      "spectrum.css",
      "node_modules/demo-spectrum/base.css",
      "node_modules/demo-spectrum/theme.css",
      "node_modules/demo-spectrum/icon.svg",
      "icons/icon_16.png",
      "README.md",
      "AGENTS.md",
      "scripts/build_loginbutton_distro.sh",
      "scripts/build_loginbutton_distro.js"
    ],
    repoDir
  );
  fs.writeFileSync(path.join(repoDir, "untracked-local-note.txt"), "local only\n");

  const outputPath = runCommand("bash", ["scripts/build_loginbutton_distro.sh"], repoDir).trim();
  const archiveEntries = runCommand("unzip", ["-Z1", artifactPath], repoDir)
    .trim()
    .split(/\n+/)
    .filter(Boolean);
  const packagedManifest = JSON.parse(runCommand("unzip", ["-p", artifactPath, "loginbutton_distro/manifest.json"], repoDir));

  assert.equal(fs.realpathSync(outputPath), fs.realpathSync(artifactPath));
  assert.equal(fs.existsSync(path.join(repoDir, "legacy_distro.zip")), false);
  assert.equal(fs.existsSync(path.join(repoDir, "loginbutton_old.zip")), false);
  assert.ok(archiveEntries.includes("loginbutton_distro/manifest.json"));
  assert.ok(archiveEntries.includes("loginbutton_distro/background.js"));
  assert.ok(archiveEntries.includes("loginbutton_distro/app.html"));
  assert.ok(archiveEntries.includes("loginbutton_distro/app.js"));
  assert.ok(archiveEntries.includes("loginbutton_distro/shared.js"));
  assert.ok(archiveEntries.includes("loginbutton_distro/vault.js"));
  assert.ok(archiveEntries.includes("loginbutton_distro/app.css"));
  assert.ok(archiveEntries.includes("loginbutton_distro/icons/icon_16.png"));
  assert.ok(archiveEntries.includes("loginbutton_distro/README.md"));
  assert.ok(archiveEntries.includes("loginbutton_distro/AGENTS.md"));
  assert.ok(archiveEntries.includes("loginbutton_distro/scripts/build_loginbutton_distro.sh"));
  assert.ok(archiveEntries.includes("loginbutton_distro/node_modules/demo-spectrum/base.css"));
  assert.ok(archiveEntries.includes("loginbutton_distro/node_modules/demo-spectrum/theme.css"));
  assert.ok(archiveEntries.includes("loginbutton_distro/node_modules/demo-spectrum/icon.svg"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/ZIP.KEY"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/.githooks/pre-commit"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/untracked-local-note.txt"));
  assert.equal(Object.prototype.hasOwnProperty.call(packagedManifest, "key"), false);
});
