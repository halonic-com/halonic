# Decision: the request log names a retry, and the integration entry offers `retryDelayMs`

- Approval: Liam OK'd the HAL-19172 plan (section 2.1, PR 1) on 26 Nov, with each attempt logged with `retry: 1 | 2` and Google's `retryDelayMs` moved into the kit; he approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vQH1+7+G8/hsmXkvbJwGmM9vS2BcGiai7R4KxsJwePttUFNpAFl4Oz+fYvULrHStEsxL3RXibJQ78SjSxHy1Dg==
- Task: HAL-19184, PR 1 of the HAL-19172 plan

## What changes

Two active requirements of the integration kit are widened. Neither is narrowed:

- `integration-kit.request-log`: an entry may also say which retry of the same request it is
  (`retry: 1` or `retry: 2`). The first attempt has no `retry` field, so an entry for a request
  the kit doesn't retry looks the same as before. The log still holds no query, no headers and no
  bodies.
- `integration-kit.integration-entry`: the entry offers one more runtime export, `retryDelayMs`,
  besides the two error classes, `maxIntegrationWaitMs` and `runTool`. It still imports only its
  own files and `@halonicjs/ports`.

The behaviour itself is a new requirement, `integration-kit.retry-rate-limited`: a `GET` or
`HEAD` that gets `429` is sent again at most twice, with at most 30 s of waiting per request.

## Why

- Each retry is one more request sent to the service. The plan counts every attempt as one
  request in the log and in any per-call count, so the debugger and PR 2's per-call cause can see
  it. One entry per attempt, marked with its retry, is the smallest change that does that.
- Google's tools already compute this wait (`retryDelayMs` in `tools/google/shared` in the
  integrations repo). With the kit retrying too, the rule should live in one place. Exporting it
  from the integration entry lets the Google tools drop their copy in PR 4. It brings in no
  outside code.

No test was weakened. `entry.test.ts` lists the one new export; every other test is unchanged.

## Covers

- integration-kit.request-log
- integration-kit.integration-entry
- packages/adapters/integration-kit/src/integration/entry.test.ts
