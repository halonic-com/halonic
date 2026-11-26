# Decision: a failed integration call gets a `service-refused` cause from Halonic's own request log

- Approval: Liam's OK with changes on HAL-19172 (https://paperclip.halonic.com/HAL/issues/HAL-19172), section 2.2 of its plan, built on HAL-19185 (https://paperclip.halonic.com/HAL/issues/HAL-19185)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:boN0JgKLTW64xjGMYnM4E7DPij8kUj2px2a2M4b2xG8Ga3v7HyUN6OkYqA3N6Obs2lMzYdXGWoDQOzbCNHWcCg==

## What changes

A call to a local integration that fails now gets a typed `tool.result` cause when the
service, or the kit, refused the call's **last** request: `code: "service-refused"` with
`why` `not-accepted` (401), `not-allowed` (403), `slow-down` (429, with `retries`) or
`host-not-declared` (the kit's `host-not-allowed`, with only the host's main part).

- The cause comes only from Halonic's own log of that call: the kit hands each request's log
  entry to the bridge (`onLogged`, `integration-kit.logged-request`), the bridge keeps it under
  the call its `fetch` frame names, and the call's `RunnerToolError` carries them in
  `callRequests` (`integration-runner.call-requests-log`). The engine reads them with
  `connectorCallRequestsOf` (`ports.connector-call-requests`). Never the integration's message
  or the reply.
- Outcome: `error` when no earlier request of the call other than a `GET` or `HEAD` got a
  `2xx` or `3xx` or broke off without an answer (no status and no refusal from the kit: it may
  have reached the service), so the run goes on as for a tool that answered with an error;
  otherwise it stays `unknown`, with the cause, and the run still waits for a person. Counting
  a request that broke off is Liam's change to his own rule, from his review of #6369.
- A call with a request still waiting for its answer when it fails carries no requests at all,
  so it gets no cause: that request may still reach the service.
- `sentOnce: true` only when no request other than a `GET` or `HEAD` went out twice in the call.
- The host's main part: the last two labels, or three under a two-part ending from
  `two-part-endings.ts` (one test per entry); IP addresses and `localhost` as they are; an
  internationalised host in its `xn--` form.
- Screens have no words for it yet (HAL-19186): the app reads a `service-refused` cause as no
  cause, so the line under the call is the one its outcome already gives.

## Why

Before this, every failed call to a local integration logged `unknown`, "broke off without an
answer, so it may or may not have done its work", and the run waited for a person, even when
the kit stopped the request before anything left the computer. Halonic's own log is the only
source the integration can't word, so the cause and the outcome come from it.

## Tests

No test is removed or weakened. New tests: the events reader, the ports reader, the kit's
`onLogged`, the bridge across a real kit client (two overlapping calls, a placed secret and a
reply canary), and the engine (`service-refused-cause.test.ts`, `two-part-endings.test.ts`).

## Covers

- events.tool-result-cause
- engine.tool-result-cause
- app.failed-call-line
