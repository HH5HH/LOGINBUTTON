# Login Button

Login Button is now a Chrome Manifest V3 Adobe IMS auth probe that runs in the Chrome side panel and is built around the extension-native login pattern:

- `chrome.identity.getRedirectURL()`
- `chrome.identity.launchWebAuthFlow()`
- Adobe authorization code flow with PKCE
- Adobe OpenID discovery for auth, token, userinfo, and revocation endpoints

After sign-in, the app renders the authenticated Adobe user's profile, avatar image asset, token claims, IMS organizations payload, Unified Shell org roster, Adobe Pass `extendedProfile`, a programmer select loaded from the Adobe Pass console, and a flattened field inventory for the returned user data. A persistent debug console stays visible in the side panel for every state so test output can always be copied back into this thread.

## Local Adobe client ID

This project no longer hard-codes Adobe's debugger client ID, and it no longer reads `ZIP.KEY` from the extension folder at load time.

1. Copy [ZIP.KEY.template](/Users/minnick/Documents/LoginButton/ZIP.KEY.template) to a local `ZIP.KEY` file anywhere on disk
2. Set `adobe.ims.client_id=YOUR_OFFICIAL_ADOBE_CLIENT_ID`
3. Open Login Button and drop that `ZIP.KEY` onto the setup gate
4. Wait for the sign-in button to appear, then sign in with Adobe
5. After login, inspect the enumerated user data and use the programmer select populated from Adobe Pass console

Imported ZIP.KEY config is persisted in `chrome.storage.local`, so Login Button keeps using that client until you replace it with another ZIP.KEY drop.
If `adobe.ims.scope` is omitted, Login Button now defaults to the broadest supported post-login inspection scope:
`openid profile AdobeID read_organizations offline_access additional_info.projectedProductContext additional_info.job_function`

## Current auth design

- Adobe client ID: imported from dropped `ZIP.KEY` and persisted in extension storage
- Default scope: `openid profile AdobeID read_organizations offline_access additional_info.projectedProductContext additional_info.job_function`
- Product-specific scopes should be added explicitly in `ZIP.KEY` only when that Adobe credential supports them
- Auth endpoints come from Adobe discovery at:
  `https://ims-na1.adobelogin.com/ims/.well-known/openid-configuration`
- Organizations are still fetched from:
  `https://ims-na1.adobelogin.com/ims/organizations/v5`
- Adobe Pass post-login hydration defaults to production:
  `https://console.auth.adobe.com/rest/api`

## Important operational note

If some teammates can sign in and others cannot, the likely issue is not geography by itself.

Adobe documents that user-auth credentials start in **Development** mode, where only listed **beta users** can sign in. In **Production** mode, any user can sign in and consent. Verify the Adobe Developer Console credential mode and beta-user list before assuming the `ims-na1` hostname is region-locked.

## Redirect stability

This extension now relies on Chrome's `chromiumapp.org` callback URL. For a stable redirect URI across installs and machines, manage the extension's manifest `key` deliberately before registering the callback in Adobe Developer Console.

## Load and use

1. Load this folder as an unpacked extension in Chrome.
2. Click the Login Button extension action to open its side panel.
3. Drop a prepared `ZIP.KEY` onto the setup gate.
4. Click **Sign In With Adobe** once the button appears.
5. Complete Adobe sign-in.
6. Inspect the returned profile, token metadata, Adobe Pass `extendedProfile`, programmer list, endpoints, session snapshot, and the always-visible debug console.
