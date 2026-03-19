const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT_PATH = path.join(ROOT, "scripts", "build_loginbutton_distro.sh");

function runCommand(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

test("distribution build emits the canonical loginbutton_distro archive and folder name", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "loginbutton-distro-test-"));
  const repoDir = path.join(tempRoot, "repo");
  const hooksDir = path.join(repoDir, ".githooks");
  const scriptsDir = path.join(repoDir, "scripts");
  const skillsDir = path.join(repoDir, "skills");
  const testsDir = path.join(repoDir, "tests");
  const nodeModulesDir = path.join(repoDir, "node_modules");
  const artifactPath = path.join(repoDir, "loginbutton_distro.zip");

  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  fs.copyFileSync(SCRIPT_PATH, path.join(scriptsDir, "build_loginbutton_distro.sh"));
  fs.chmodSync(path.join(scriptsDir, "build_loginbutton_distro.sh"), 0o755);

  fs.writeFileSync(path.join(repoDir, ".gitignore"), "loginbutton_distro.zip\n");
  fs.writeFileSync(path.join(repoDir, "AGENTS.md"), "# repo instructions\n");
  fs.writeFileSync(path.join(hooksDir, "pre-commit"), "#!/usr/bin/env bash\n");
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Login Button\n");
  fs.writeFileSync(path.join(repoDir, "ZIP.KEY.template"), "adobe.ims.client_id=demo\n");
  fs.writeFileSync(path.join(repoDir, "package.json"), '{ "name": "loginbutton" }\n');
  fs.writeFileSync(path.join(repoDir, "package-lock.json"), '{ "lockfileVersion": 3 }\n');
  fs.writeFileSync(path.join(repoDir, "manifest.json"), '{ "version": "1.0.0" }\n');
  fs.writeFileSync(path.join(repoDir, "background.js"), 'console.log("loginbutton");\n');
  fs.writeFileSync(path.join(repoDir, "app.js"), 'console.log("app");\n');
  fs.writeFileSync(path.join(repoDir, ".DS_Store"), "ignore\n");
  fs.writeFileSync(path.join(repoDir, "stale.zip"), "legacy\n");
  fs.writeFileSync(artifactPath, "stale\n");
  fs.writeFileSync(path.join(testsDir, "noop.test.js"), 'console.log("noop");\n');
  fs.writeFileSync(path.join(skillsDir, "skill.md"), "# skill\n");
  fs.writeFileSync(path.join(nodeModulesDir, ".package-lock.json"), "{}\n");

  runCommand("git", ["init", "--quiet"], repoDir);
  runCommand(
    "git",
    [
      "add",
      ".gitignore",
      "AGENTS.md",
      ".githooks/pre-commit",
      "README.md",
      "ZIP.KEY.template",
      "package.json",
      "package-lock.json",
      "scripts/build_loginbutton_distro.sh",
      "tests/noop.test.js",
      "skills/skill.md",
      "manifest.json",
      "background.js",
      "app.js"
    ],
    repoDir
  );

  const outputPath = runCommand("bash", ["scripts/build_loginbutton_distro.sh"], repoDir).trim();
  const archiveEntries = runCommand("unzip", ["-Z1", artifactPath], repoDir)
    .trim()
    .split(/\n+/)
    .filter(Boolean);

  assert.equal(fs.realpathSync(outputPath), fs.realpathSync(artifactPath));
  assert.equal(fs.existsSync(path.join(repoDir, "stale.zip")), false);
  assert.ok(fs.existsSync(artifactPath));
  assert.ok(
    archiveEntries.every((entry) => entry === "loginbutton_distro/" || entry.startsWith("loginbutton_distro/"))
  );
  assert.ok(archiveEntries.includes("loginbutton_distro/manifest.json"));
  assert.ok(archiveEntries.includes("loginbutton_distro/background.js"));
  assert.ok(archiveEntries.includes("loginbutton_distro/app.js"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/README.md"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/AGENTS.md"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/ZIP.KEY.template"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/package.json"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/package-lock.json"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/.githooks/pre-commit"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/scripts/build_loginbutton_distro.sh"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/tests/noop.test.js"));
  assert.ok(!archiveEntries.includes("loginbutton_distro/skills/skill.md"));
});

test("distribution build packages staged tracked files even when the worktree copy is missing", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "loginbutton-distro-dirty-test-"));
  const repoDir = path.join(tempRoot, "repo");
  const scriptsDir = path.join(repoDir, "scripts");
  const artifactPath = path.join(repoDir, "loginbutton_distro.zip");

  t.after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.copyFileSync(SCRIPT_PATH, path.join(scriptsDir, "build_loginbutton_distro.sh"));
  fs.chmodSync(path.join(scriptsDir, "build_loginbutton_distro.sh"), 0o755);

  fs.writeFileSync(path.join(repoDir, "manifest.json"), '{ "version": "1.0.0" }\n');
  fs.writeFileSync(path.join(repoDir, "background.js"), 'console.log("loginbutton");\n');

  runCommand("git", ["init", "--quiet"], repoDir);
  runCommand("git", ["add", "scripts/build_loginbutton_distro.sh", "manifest.json", "background.js"], repoDir);

  fs.rmSync(path.join(repoDir, "background.js"));

  runCommand("bash", ["scripts/build_loginbutton_distro.sh"], repoDir);
  const archiveEntries = runCommand("unzip", ["-Z1", artifactPath], repoDir)
    .trim()
    .split(/\n+/)
    .filter(Boolean);
  const backgroundSource = runCommand("unzip", ["-p", artifactPath, "loginbutton_distro/background.js"], repoDir);

  assert.ok(archiveEntries.includes("loginbutton_distro/background.js"));
  assert.equal(backgroundSource, 'console.log("loginbutton");\n');
});
