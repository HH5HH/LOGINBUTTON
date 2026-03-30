# HARPO Diagnostic Map

Use this when a HARPO symptom is obvious but the correct patch point is not.

## Symptom -> First Place To Inspect

### The first MVPD hop is missing after Adobe handoff

- Files: `background.js`, `harpo-capture.js`
- Usually means:
  - request classification happened before `requestWillBeSentExtraInfo`
  - the request was dropped before SAML-derived auth-chain state arrived
- Preferred fix:
  - buffer first
  - promote later when request headers or redirect headers confirm the auth chain

### Redirect destination is wrong or missing

- Files: `background.js`
- Usually means:
  - `responseReceivedExtraInfo` was ignored
  - `Location` was not preserved into HAR response data
- Preferred fix:
  - merge response headers from both response events
  - store redirect URL even when body is absent

### HARPO says no body was recorded even though Chrome showed content

- Files: `background.js`, `harpo.js`
- Usually means:
  - `Network.getResponseBody` could not expose the body
  - the response class does not reliably provide reusable content bytes
- Preferred fix:
  - make body retrieval best-effort
  - keep UI language quiet and factual
  - do not misclassify this as a failed request

### Auth popup or child tab traffic is missing

- Files: `background.js`
- Usually means:
  - child targets were not attached
  - request ids collided across tabs or sessions
- Preferred fix:
  - follow created navigation targets
  - scope state by tab or session plus request id

### HARPO labels non-MVPD traffic as MVPD

- Files: `harpo-capture.js`, `harpo-traffic.js`, `harpo.js`
- Usually means:
  - external domains were promoted from loose heuristics
  - invalid values were normalized into fake domains
- Preferred fix:
  - only seed MVPD domains from explicit auth anchors
  - reject `data:`, `blob:`, extension URLs, and non-host junk before domain bucketing

### Filtering or row selection feels wrong, but capture is correct

- Files: `harpo.js`
- Usually means:
  - recorder data is fine
  - workspace anchoring or visibility logic is wrong
- Preferred fix:
  - do not patch recorder code to solve a workspace-only bug
