# Runtime Contract

This reference captures the proven LoginButton runtime model that should now be treated as the canonical AdobePass client contract for future LoginButton and UnderPAR refactors.

## 1. Identity Gate

- Adobe IMS authorization-code plus PKCE is the only real login gate.
- Requested scope is not proof of granted scope.
- Org resolution uses multiple trusted sources, not just IMS `/organizations`.
- A usable Adobe IMS session is not the same thing as confirmed AdobePass entitlement.

## 2. Service Split

| Surface | Auth Material | Backend | Notes |
| --- | --- | --- | --- |
| Adobe org picker | IMS session, profile, token claims, configured orgs | IMS plus local runtime config | Keep usable even when `/organizations` is missing or scope-limited. |
| AdobePass console profile and entities | IMS bearer plus rotating CSRF | `https://console.auth.adobe.com/rest/api` | Use direct background API calls. No temporary tabs for normal hydration. |
| CM tenants | IMS bearer | `https://config.adobeprimetime.com` | Separate from AdobePass console and separate from CMU tokening. |
| CMU token bootstrap | IMS-backed `cm-console-ui` minting flow | IMS check or validation endpoints | Produces a different bearer for CMU and report calls. |
| CM reports and concurrency monitoring | CMU token | `https://cm-reports.adobeprimetime.com` and related CMU paths | Do not reuse AdobePass console bearer here. |
| DCR or premium-service execution | Selected registered application scope and service-specific credentials | Service-specific AdobePass backends | Do not treat DCR scope as a substitute for IMS or CMU tokening. |

## 3. AdobePass Console Hydration

Use the real bounded console sequence:

1. Normalize Adobe IMS session.
2. Initialize console HTTP requests with:
   - `Authorization: bearer <ims token>`
   - `x-csrf-token`
   - request id
3. Fetch `/user/extendedProfile`.
4. Fetch `/config/latestActivatedConsoleConfigurationVersion`.
5. Fetch entity lists needed by the UI:
   - `ServiceProvider`
   - `Programmer`
6. Fetch page-specific reads only when selected:
   - registered applications by programmer
   - requestor or content-provider projections from programmer and service provider data

Do not turn this into overlapping probes or multiple competing fallback loops.

## 4. CSRF Rules

- Start with `NO-TOKEN` only as the initial request state.
- Rotate CSRF from response headers in memory.
- Reuse the current CSRF for later AdobePass console requests.
- Do not persist CSRF in browser storage.

## 5. Premium Service Derivation

Premium services are a derived capability layer, not a new login flow.

- `REST API V2` requires a registered application with scope `api:client:v2`.
- `ESM` requires a registered application with scope `analytics:client`.
- `degradation` requires a registered application with scope `decisions:owner`.
- `reset TempPass` requires a registered application with scope `temporary:passes:owner`.
- `Concurrency Monitoring` exists when the selected programmer matches a CM tenant by normalized id or name.

## 6. No-Tab Rule

Default behavior:

- No temporary browser tabs for AdobePass console hydration.
- No page scrape heuristics for programmers, applications, or requestors.
- No shell-frame discovery loops when the backend contract is already known.

Only keep a page-context dependency when there is a proven browser-only gate that cannot yet be replaced with a direct call. Treat that as a temporary exception and document it.

## 7. Fast UI Contract

- Logged-out screen should only handle Adobe IMS login.
- Non-AdobePass sessions should show org switching or restricted recovery only.
- AdobePass sessions should hydrate the workflow surface directly:
  - CMU token
  - CM tenant
  - AdobePass programmer
  - registered applications
  - content providers
  - premium-service summary or controls

## 8. Common Failure Patterns To Remove

- Treating requested scope as granted scope
- Reusing CMU token for AdobePass console requests
- Requiring page context when direct REST plus IMS bearer already works
- Using VAULT, cached browser data, or embedded page state as a primary auth source
- Hiding org switching because AdobePass entitlement is missing
