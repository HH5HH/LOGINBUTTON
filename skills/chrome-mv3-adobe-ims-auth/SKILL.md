---
name: chrome-mv3-adobe-ims-auth
description: Use when implementing or refactoring Adobe IMS sign-in for a Chrome Manifest V3 extension. Covers chrome.identity redirect handling, Adobe OAuth authorization-code plus PKCE flow, stable extension IDs, production versus beta-user restrictions, and removal of legacy helper-redirect shims.
---

# Chrome MV3 Adobe IMS Auth

Use this skill for Adobe IMS login work in Chrome extensions.

## Goals

- Prefer the Chrome Manifest V3 extension pattern over custom popup and redirect shims.
- Prefer Adobe's authorization-code flow with PKCE for public clients.
- Reduce hard-coded auth paths by using Adobe OpenID discovery where possible.
- Make deployment and teammate access constraints explicit, especially Adobe Development versus Production mode.

## Required Sources

Use official Chrome and Adobe documentation only.

- Chrome `identity` API:
  [identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- Chrome manifest `key`:
  [manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/key)
- Adobe user authentication overview:
  [user auth guide](https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/)
- Adobe implementation guide:
  [implementation guide](https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/implementation)
- Adobe IMS API reference:
  [IMS API reference](https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/ims)

Read [references/official-notes.md](references/official-notes.md) before editing auth code.

## Default Architecture

For Chrome MV3 Adobe IMS sign-in, default to this design:

1. Use `chrome.identity.getRedirectURL()` to generate the callback URL.
2. Use `chrome.identity.launchWebAuthFlow()` for the interactive sign-in window.
3. Use Adobe OAuth authorization code flow with PKCE.
4. Discover `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, and `revocation_endpoint` from Adobe OpenID configuration.
5. Keep token exchange and session persistence inside the extension, not on a public relay page.
6. Avoid implicit flow and avoid hard-coded `/authorize/v1` or legacy redirect hosts unless you are preserving a temporary fallback during migration.

## Implementation Rules

- Add the Chrome `identity` permission when using `launchWebAuthFlow`.
- Treat a stable extension ID as a configuration requirement when the Adobe redirect URI is pre-registered. If the extension will rely on a `chromiumapp.org` callback across machines, the manifest `key` must be managed deliberately.
- Do not hard-code `locale=en_US`. Omit locale unless there is a documented product need.
- Do not use Adobe implicit flow for new work.
- Do not keep external redirect rewrites or DNR redirect bridges unless there is a documented migration reason.
- Revoke tokens on logout when practical, then clear local session state.

## Diagnostic Checks

When login works for some teammates but not others, check these before blaming geography:

1. Adobe credential mode:
   In Adobe Development mode, only listed beta users can sign in. Production mode allows general user sign-in.
2. Redirect URI registration:
   The effective redirect URL used by the extension must match what is configured in Adobe Developer Console.
3. Extension ID stability:
   If the redirect uses `https://<app-id>.chromiumapp.org/...`, the extension ID must be stable for every intended install path.
4. Credential type:
   Browser-only extension flows should use Adobe public-client guidance with PKCE, not a confidential-client pattern.

## Expected Deliverables

For a substantial auth refactor, produce:

- one shared auth configuration module
- one PKCE-based sign-in flow
- one logout path that revokes and clears session when possible
- UI text that reflects the new architecture
- notes about Adobe beta-user versus production restrictions

