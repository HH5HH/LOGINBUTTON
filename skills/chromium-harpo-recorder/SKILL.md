---
name: chromium-harpo-recorder
description: Use when debugging or extending HARPO's Chrome debugger recorder. Covers Chrome DevTools Protocol Network event ordering, requestWillBeSentExtraInfo and responseReceivedExtraInfo, Network.getResponseBody limits, redirect and auth-chain tracking, popup and child-tab capture, and strict MVPD domain classification.
---

# Chromium HARPO Recorder

Use this skill for HARPO capture work that depends on Chromium behavior rather than generic HTTP assumptions.

Read [references/official-notes.md](references/official-notes.md) before editing recorder code. Read [references/harpo-diagnostic-map.md](references/harpo-diagnostic-map.md) when you need to map a symptom to the correct layer.

## Use This Skill When

- HARPO misses redirects, MVPD hops, popup auth tabs, or return-to-programmer navigations.
- HARPO records a request but does not show the expected headers or body.
- HARPO tags the wrong traffic as MVPD or widens capture too aggressively.
- You are editing recorder files that depend on Chrome DevTools Protocol event timing.

## HARPO File Map

- `background.js`: `chrome.debugger` attach flow, DevTools event wiring, request buffering, HAR assembly, response body fetches, tab and target tracking.
- `harpo-capture.js`: recorder state machine, auth-tunnel logic, domain acceptance and promotion rules.
- `harpo-traffic.js`: hostname normalization, safe-domain matching, asset rejection, redirect-classification helpers.
- `harpo.js`: workspace filtering and labeling. This is display logic, not capture authority.

## Default Workflow

1. Identify the failure class before editing code.
2. Anchor the fix to a specific Chrome event or target lifecycle fact.
3. Patch the lowest correct layer.
4. Validate both the recorder path and the workspace path.

## Failure Classes

### Missing request headers or MVPD origin

Start in `background.js`.

- `Network.requestWillBeSent` is often too early for the final request headers.
- `Network.requestWillBeSentExtraInfo` is the authoritative place for `Origin`, `Referer`, cookies, and some auth-chain clues.
- Buffer early requests first, then re-evaluate them when ExtraInfo arrives.

### Missing response headers or redirect destination

Start in `background.js`.

- Merge `Network.responseReceived` and `Network.responseReceivedExtraInfo`.
- Follow real `Location` headers from tracked auth-chain hosts.
- Do not infer redirect targets from loose URL heuristics when headers exist.

### Browser got data but HARPO did not get a body

Start in `background.js`, not `harpo.js`.

- `Network.getResponseBody` is best-effort.
- A visible browser response does not guarantee body bytes are exposed to the debugger.
- Redirects, preflight requests, some navigations, and some cross-origin responses will legitimately not expose reusable bodies.
- Do not turn missing body access into a fake error narrative in the UI.

### Popup or child-tab auth flow missing

Start in `background.js`.

- Follow child tabs and auth popups explicitly.
- Keep request identity keyed by tab or session plus request id, not request id alone.
- Preserve state across return-to-programmer navigations.

### Wrong MVPD labeling or broad external capture

Start in `harpo-capture.js` and `harpo-traffic.js`.

- Only promote external domains from explicit auth anchors.
- For SAML handoff flows, use the real request and response headers around `https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer`.
- Reject junk values like `data:`, `blob:`, extension URLs, inline assets, and non-host strings before they can become domains.

## Recorder Rules

- Prefer protocol evidence over guesses.
- Buffer requests before you have enough information to classify them.
- Merge base events and ExtraInfo events before final classification.
- Track auth tunnels from real request and response headers, then stop the widened capture when a real programmer `Document` navigation lands back home.
- Treat workspace labeling as downstream of recorder truth.
- Exclude physical asset noise unless you have a deliberate reason to keep it.

## Validation

Run the narrow checks that match the touched layer.

- `node --check background.js`
- `node --check harpo-capture.js`
- `node --check harpo-traffic.js`
- `node --check harpo.js`
- `node --test tests/harpo-capture.test.js tests/harpo-traffic.test.js tests/harpo-domain-filter.test.js tests/auth-flow-stability.test.js`

When the user has a live repro:

- compare Recent Activity lines before and after the change
- verify the expected auth anchor appeared
- verify capture widened only when that anchor appeared
- verify capture narrowed again when the browser returned to the programmer site
