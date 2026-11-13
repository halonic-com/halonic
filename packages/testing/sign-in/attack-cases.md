# Attack cases T1 to T22 and their tests

This is a map, not a requirement: it says where each attack case of the sign-in design (HAL-984, section 8) is
tested, so section 8 can be traced to code. Each test names its case in its title, such as `attack case T7`;
search for the tag. Paths start at `packages/`. The T-numbers here are the sign-in design's; other
documents use T-numbers for other lists. All tests here run in `pnpm test` of `testing/sign-in` against the fake OAuth
server in this package (`src/fake-oauth-server.ts`), and the kit, the flow and the tokens are the real ones.

An open gap is a test written with `it.fails` and a comment that names the finding. It passes while the gap
is open and fails when the code closes it, so whoever closes it changes the test to `it`. The findings are kept with the attack-test task until they are fixed.

| Case | What it tries | Tested in | Open |
| --- | --- | --- | --- |
| T1 | reading a token | `testing/sign-in/src/kit-attacks.test.ts`, `sheet-attacks.test.ts`; the runner has none: `adapters/integration-kit/src/loader.test.ts` (A32), `adapters/integration-runner/src/halonic/strict-protocol.test.ts` (a `tokens` frame) |  |
| T2 | a token on a host the sign-in doesn't list, or on a redirect | `testing/sign-in/src/kit-attacks.test.ts`, `adapters/integration-runner/src/halonic/sign-in-attacks.test.ts`; `adapters/integration-kit/src/sign-in-placement.test.ts` |  |
| T3 | placing the client secret | `testing/sign-in/src/kit-attacks.test.ts`, `adapters/integration-runner/src/halonic/sign-in-attacks.test.ts` |  |
| T4 | a token echoed back | `testing/sign-in/src/echo-attacks.test.ts`, `flow-attacks.test.ts`, `adapters/integration-runner/src/halonic/sign-in-attacks.test.ts`, `live-secret-filter.test.ts`; `adapters/integration-kit/src/sign-in-filter.test.ts`; gzip: `adapters/http-node/src/decompressed-body.test.ts` |  |
| T5 | carrying an echoed token to another host | `testing/sign-in/src/echo-attacks.test.ts`, `adapters/integration-runner/src/halonic/sign-in-attacks.test.ts` (the leak attempt that pauses the connector); `adapters/integration-kit/src/sign-in-filter.test.ts` |  |
| T6 | a token endpoint on plain http or a private address | `testing/sign-in/src/sheet-attacks.test.ts` |  |
| T7 | a token endpoint that redirects | `testing/sign-in/src/flow-attacks.test.ts` |  |
| T8 | an authorize URL that sets `redirect_uri`, `state` or `code_challenge` | `testing/sign-in/src/flow-attacks.test.ts` |  |
| T9 | a wrong `state`, a reused code, a wrong `iss` | `testing/sign-in/src/flow-attacks.test.ts` |  |
| T10 | a token answer that isn't bearer, has no token or is over 64 KiB | `testing/sign-in/src/flow-attacks.test.ts` | finding 1 |
| T11 | an update that changes what the user approved | `testing/sign-in/src/token-attacks.test.ts` | finding 2 |
| T12 | a built-in integration reading a sign-in's stored name | `testing/sign-in/src/kit-attacks.test.ts` |  |
| T13 | many requests at once, a late 401 | `testing/sign-in/src/token-attacks.test.ts`; `adapters/integration-kit/src/sign-in-rejected.test.ts` |  |
| T14 | a placement the sheet doesn't say | `testing/sign-in/src/kit-attacks.test.ts`, `adapters/integration-runner/src/halonic/sign-in-attacks.test.ts`; `adapters/integration-kit/src/sign-in-placement.test.ts` |  |
| T15 | forced refreshes with repeated 401s | `testing/sign-in/src/token-attacks.test.ts`; `adapters/integration-kit/src/sign-in-rejected.test.ts` |  |
| T16 | a client secret with hosts, or sent off the token and revoke hosts | `testing/sign-in/src/sheet-attacks.test.ts`, `kit-attacks.test.ts` | the trust check's warning: Studio, not built yet |
| T17 | an update that changes the revoke URL or client authentication | `testing/sign-in/src/token-attacks.test.ts` |  |
| T18 | a sheet edited without an update | `testing/sign-in/src/token-attacks.test.ts` |  |
| T19 | a token of one character, with spaces or line breaks | `testing/sign-in/src/flow-attacks.test.ts` |  |
| T20 | a callback after the sheet changed or the sign-in expired | `testing/sign-in/src/flow-attacks.test.ts` |  |
| T21 | shell characters in the authorize URL | `testing/sign-in/src/flow-attacks.test.ts` |  |
| T22 | two refreshes at once on a rotating provider | `testing/sign-in/src/token-attacks.test.ts` |  |
