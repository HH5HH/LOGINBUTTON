# UnderPAR Refactor Plan

Use this plan when moving UnderPAR off scrape-heavy runtime behavior and onto the proven LoginButton contract.

## Goal

Make UnderPAR hydrate quickly and deterministically with one Adobe IMS session and a small number of explicit backend calls. Delete the branches that attempt to rediscover state from page internals, temporary tabs, or VAULT side channels.

## Phases

### 1. Canonicalize The Shared Runtime

Extract and standardize these runtime surfaces first:

- IMS session normalization
- org picker candidate derivation
- AdobePass console HTTP client
- CM tenant client
- CMU token bootstrap and CM reports client
- premium-service derivation from registered apps plus CM tenant membership

Do not let each workspace own its own auth or hydration variant.

### 2. Replace AdobePass Console Heuristics

Target these UnderPAR surfaces first:

- `/Users/minnick/Documents/UPtool/underpar/popup.js`
- `/Users/minnick/Documents/UPtool/underpar/esm-workspace.js`
- `/Users/minnick/Documents/UPtool/underpar/cm-workspace.js`
- `/Users/minnick/Documents/UPtool/underpar/degradation-workspace.js`

Rewrite away from:

- shell page-context fetches
- temporary tab creation
- guessed programmer hydration
- VAULT as the live source of console identity

Replace with:

- direct AdobePass console REST calls using IMS bearer plus CSRF
- bounded entity fetches
- page-specific reads only after user selection

### 3. Split Token Purposes Cleanly

UnderPAR should keep exactly these live token classes:

- Adobe IMS token for AdobePass console and CM tenant calls
- `cm-console-ui` token for CMU and CM reports
- selected registered application scopes for premium-service capability gating

Do not create a generic “best available token” path.

### 4. Demote VAULT

VAULT should become:

- a cache
- a projection layer
- an export surface

VAULT should not remain:

- the first source of truth for current entitlement
- a required bootstrap dependency for programmer hydration
- a substitute for direct backend reads when the real contract is already known

### 5. Collapse UI Startup

Startup should be:

1. IMS session
2. org resolution
3. if not `adobepass`, restricted recovery or org switcher
4. if `adobepass`, parallel bounded hydration:
   - AdobePass console core entities
   - CM tenants
   - CMU token
5. workspace-specific reads on demand

Avoid blocking the whole UI on low-value secondary data.

### 6. Rewrite Tests To Match The Contract

Expect to simplify or rewrite tests that currently enshrine speculative fallbacks, especially in:

- `/Users/minnick/Documents/UPtool/underpar/tests/ims-auth-refactor.test.js`
- `/Users/minnick/Documents/UPtool/underpar/tests/vault-ims-runtime-config.test.js`

The new test model should prefer:

- direct runtime contract assertions
- token-purpose separation
- deterministic hydration order
- restricted recovery staying visible after entitlement failure

## Keep / Rewrite / Delete

Keep

- PKCE Adobe IMS session handling
- org picker behavior
- useful workspace views and exports

Rewrite

- duplicated hydration code across popup and workspaces
- programmer and premium-service bootstrap logic
- CMU and AdobePass console acquisition paths that currently bleed into each other

Delete

- browser-tab-based normal hydration
- stale fallback loops
- redundant workspace-specific auth helpers once a shared runtime exists
