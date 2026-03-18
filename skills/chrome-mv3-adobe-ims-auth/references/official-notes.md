# Official Notes

## Chrome

- `chrome.identity.getRedirectURL()` generates `https://<app-id>.chromiumapp.org/*`.
- `chrome.identity.launchWebAuthFlow()` closes when the provider redirects back to that URL pattern.
- Manifest `key` preserves a stable extension ID during development when redirect URIs or external integrations depend on it.

## Adobe IMS

- Adobe user authentication is OAuth 2.0 authorization code flow.
- Public clients must use PKCE.
- Adobe documents `/ims/authorize/v2` and `/ims/token/v3` for current user-auth flows.
- OpenID discovery is available at:
  `https://ims-na1.adobelogin.com/ims/.well-known/openid-configuration`
- Adobe documents `userinfo_endpoint` in the discovery document.
- Adobe documents revocation for public clients using `POST {revocation_endpoint}?client_id=...`.

## Adobe Access Restrictions

- Adobe credentials start in Development mode.
- In Development mode, only listed beta users can sign in.
- In Production mode, any user can sign in and consent.
- This restriction is a likely explanation for "some teammates can log in, others cannot" when the app has not been promoted or the beta list is incomplete.

## Architecture Bias

- Prefer extension-native redirect handling over a helper page plus external redirect host.
- Use discovery for auth endpoints so path-version changes are centralized.
- If an Adobe project cannot yet support the extension callback URL, isolate any temporary fallback path behind a clear strategy boundary.
