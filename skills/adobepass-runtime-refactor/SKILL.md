---
name: adobepass-runtime-refactor
description: Use when refactoring LoginButton or UnderPAR to a source-grounded AdobePass runtime. Covers Adobe IMS PKCE session gating, org picker behavior, direct AdobePass console REST hydration, CM tenant catalog, CMU token separation, registered applications and requestor hydration, premium-service derivation, and removal of browser-tab or scrape fallbacks.
---

# AdobePass Runtime Refactor

Use this skill when LoginButton or UnderPAR should behave like the real AdobePass stack instead of rediscovering it from tabs, scraped page state, or speculative fallback logic.

## Start Here

1. Read `references/runtime-contract.md`.
2. Read [$adobe-ims-user-auth](/Users/minnick/.codex/skills/adobe-ims-user-auth/SKILL.md).
3. Read [$adobepass-console](/Users/minnick/.codex/skills/adobepass-console/SKILL.md).
4. If the task is in UnderPAR, read `references/underpar-refactor-plan.md`.
5. Inspect the live code path before editing.
   LoginButton reference implementation:
   - `/Users/minnick/Documents/LoginButton/app.js`
   - `/Users/minnick/Documents/LoginButton/shared.js`

## Runtime Model

1. Adobe IMS PKCE session is the only top-level login gate.
2. Org resolution is separate from entitlement.
3. AdobePass console entity reads use the IMS bearer plus in-memory CSRF against the console REST API.
4. CM tenants use the post-login IMS session, not the CMU token.
5. CMU and CM reports use a separate `cm-console-ui` token bootstrap.
6. Premium services are derived from registered application scopes plus CM tenant membership.
7. DCR, CMU, and Adobe IMS tokens are not interchangeable.

## Keep / Rewrite / Delete

Keep

- PKCE Adobe IMS login and granted-scope normalization
- Multi-source Adobe org picker behavior
- Direct AdobePass console REST hydration
- One-purpose token paths
- Derived premium-service capability model

Rewrite

- Page-context-first console fetches
- Workspace-specific duplicated hydration code
- VAULT as a live auth source instead of a cache or projection
- UI branches that conflate AdobePass entitlement with Adobe IMS sign-in success

Delete

- Temporary browser tabs for normal console reads
- Browser scrape heuristics once a direct backend contract is known
- Hidden fallback loops that retry weaker auth or weaker hydration paths
- Logic that reuses CMU token for AdobePass console or premium-service DCR work

## Output Expectations

When using this skill, produce:

- A short runtime summary with the exact token and backend split
- A keep, rewrite, delete matrix for the touched codepaths
- A note about any remaining page-context dependency and why it still exists
- If UnderPAR was changed, the exact shared runtime surfaces that were extracted or simplified
