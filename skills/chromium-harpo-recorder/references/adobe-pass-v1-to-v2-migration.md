# Adobe Pass V1 to V2 Migration Map

This reference is for HARPO legacy-call decoration.

It is grounded in:

- the legacy Adobe Pass REST API V1 overview and per-endpoint pages on Experience League
- the Adobe Pass REST API V2 FAQs migration tables
- local current specs:
  - `/Users/minnick/Documents/PASS/restApiV2.json`
  - `/Users/minnick/Documents/PASS/dcrApi.json`

## Core Rule

Many Adobe Pass REST API V1 endpoints do not map one-to-one to a new endpoint.

REST API V2 collapses older token-check and token-read patterns into:

- configuration
- sessions
- profiles
- decisions
- logout

## High-Value Mappings

### Configuration

- V1: `GET /api/v1/config/{requestorId}`
- V2: `GET /api/v2/{serviceProvider}/configuration`

Notes:

- The response remains the MVPD picker source.
- V2 configuration is service-provider scoped and platform specific.

### Registration Code and Authentication Code

- V1 create regcode: `POST /reggie/v1/{requestorId}/regcode`
- V2: `POST /api/v2/{serviceProvider}/sessions`

- V1 read regcode: `GET /reggie/v1/{requestorId}/regcode/{code}`
- V2: `GET /api/v2/{serviceProvider}/sessions/{code}`

Notes:

- The legacy registration code becomes the REST API V2 authentication code.
- Creation and lookup are no longer hidden behind one endpoint family.

### Initiate Authentication

- V1: `GET|POST /api/v1/authenticate`
- V2 sequence:
  - `POST /api/v2/{serviceProvider}/sessions`
  - `POST /api/v2/{serviceProvider}/sessions/{code}` when resuming
  - `GET /api/v2/authenticate/{serviceProvider}/{code}`

Notes:

- V2 makes the browser authentication redirect explicit.

### Check Authentication / AuthN Token / User Metadata

- V1:
  - `GET /api/v1/checkauthn`
  - `GET /api/v1/checkauthn/{code}`
  - `GET /api/v1/tokens/authn`
  - `GET /api/v1/tokens/usermetadata`

- V2:
  - `GET /api/v2/{serviceProvider}/profiles`
  - `GET /api/v2/{serviceProvider}/profiles/{mvpd}`
  - `GET /api/v2/{serviceProvider}/profiles/code/{code}`

Notes:

- Profiles replace the legacy raw-token model.
- User metadata is returned inside profiles instead of a standalone endpoint.

### Preauthorization

- V1: `GET /api/v1/preauthorize`
- V2: `POST /api/v2/{serviceProvider}/decisions/preauthorize/{mvpd}`

### Authorization / AuthZ Token / Media Token

- V1:
  - `GET|POST /api/v1/authorize`
  - `GET /api/v1/tokens/authz`
  - `GET|POST /api/v1/mediatoken`
  - `GET /api/v1/tokens/media`

- V2:
  - `POST /api/v2/{serviceProvider}/decisions/authorize/{mvpd}`

Notes:

- One V2 authorize response now covers:
  - authorization initiation
  - authorization decision
  - short media token

### Logout

- V1: `GET /api/v1/logout`
- V2: logout family rooted at `GET /api/v2/{serviceProvider}/logout/{mvpd}`

Notes:

- Legacy logout clears Adobe-side storage but does not fully model MVPD-side browser cleanup.
- V2 makes the follow-up browser action explicit.

### TempPass

- V1: `POST /api/v1/authenticate/freepreview`
- V2: no single replacement endpoint

Notes:

- TempPass moves into the normal session, profile, and decision model.
- Promotional identity is represented with `AP-TempPass-Identity`.
