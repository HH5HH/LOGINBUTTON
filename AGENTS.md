# LoginButton Agent Guidelines

## Adobe Spectrum 2 Skill Integration

- For UI styling or component work, use the `$spectrum-css-core` skill.
- Keep implementations class-based Spectrum CSS and aligned to Spectrum 2.
- Use Spectrum root classes with `.spectrum`, `.spectrum--medium`, and a light or dark color class.
- Do not use Spectrum Web Components details.
- Do not use `.spectrum--legacy`, `.spectrum--express`, or `.spectrum--large`.
- Consult Spectrum 2 docs/tokens MCP data first when choosing components or tokens.

## Adobe IMS Auth Skill

- For Adobe IMS or Chrome MV3 auth refactors in this project, use [skills/chrome-mv3-adobe-ims-auth/SKILL.md](/Users/minnick/Documents/LoginButton/skills/chrome-mv3-adobe-ims-auth/SKILL.md).
- Prefer Chrome `identity` plus Adobe authorization-code PKCE over helper-window implicit flows.
- Treat Adobe Development mode and beta-user restrictions as a first-class diagnostic when teammate access differs.

## Mandatory Version Bump Rule

- After any edit to LoginButton application files, bump the build version before finishing work.
- Use: `scripts/auto_bump_manifest_version.sh`
- Never deliver LoginButton app edits with an unchanged `manifest.json` version.

## Commit-Time Automation

- LoginButton mirrors UnderPAR's manifest auto-bump approach through `.githooks/pre-commit`.
- One-time hook setup command when this project lives in a git repo: `scripts/install_git_hooks.sh`
