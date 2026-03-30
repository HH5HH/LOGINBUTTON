# Official Notes

These notes are grounded in official Chrome and Chromium sources relevant to HARPO.

## Core Sources

- Chrome extension debugger API:
  [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- Chrome DevTools Protocol Network domain:
  [CDP Network domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- Chromium protocol configuration:
  [protocol_config.json](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/browser/devtools/protocol_config.json)
- DevTools frontend network model:
  [NetworkManager.ts](https://chromium.googlesource.com/devtools/devtools-frontend/+/29adb77a91f085ab82fbc81253002b8cb2593f2e/front_end/core/sdk/NetworkManager.ts)

## What HARPO Must Assume

### `chrome.debugger` is a transport for CDP, not a packet sniffer

Chrome can successfully render or process a response even when the extension cannot fetch the same body bytes later.

Implication for HARPO:

- missing response body is sometimes a debugger visibility limit, not a network failure
- UI copy must not imply the request failed just because `Network.getResponseBody` returned nothing

### `ExtraInfo` events matter

Chromium exposes `requestWillBeSentExtraInfo` and `responseReceivedExtraInfo` alongside the normal Network events. `protocol_config.json` includes both events and `getResponseBody` in the Network domain event and method set.

Implication for HARPO:

- do not finalize request classification from `requestWillBeSent` alone
- do not finalize redirect or auth-chain state from `responseReceived` alone
- merge base events and ExtraInfo before deciding whether a request belongs in the HAR

### Redirects and body visibility are special cases

The DevTools frontend source explicitly treats some responses as having no usable content, including redirected requests and preflight requests. WebSocket content is also special-cased.

Implication for HARPO:

- do not promise bodies for redirects, preflight, or protocol classes Chrome itself treats specially
- when a redirect response matters, preserve the headers and redirect target even if the body is absent

### Child targets and auth popups are separate capture surfaces

The debugger API routes events by debuggee target. Auth flows that open child tabs or popups need explicit follow-up.

Implication for HARPO:

- follow created navigation targets and child tabs
- keep request identity scoped to tab or session plus request id
- do not assume one active tab contains the whole auth flow

## HARPO-Specific Translation

When debugging HARPO recorder bugs, treat the protocol in this order:

1. `requestWillBeSent`
2. `requestWillBeSentExtraInfo`
3. `responseReceived`
4. `responseReceivedExtraInfo`
5. `loadingFinished` or `loadingFailed`
6. `Network.getResponseBody`

That ordering is why HARPO often needs:

- pending request buffers
- late promotion into the recorded set
- header merge logic
- body fetch retries that do not fabricate failure text

## Practical Fetch Tip

Googlesource URLs contain `+` and query parameters that zsh will try to glob unless quoted.

Use quoted URLs such as:

```bash
curl -sSL 'https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/browser/devtools/protocol_config.json?format=TEXT'
```
