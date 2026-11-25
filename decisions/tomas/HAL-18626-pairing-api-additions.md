# Decision: making a pairing code is checked by the shared test helper, not by an `expect` call

- Approval: Liam approved PR 6118 on HAL-18626 (https://paperclip.halonic.com/HAL/issues/HAL-18626#comment-8afbff88-534b-40f8-9229-71f51d0e77f3) and signs this note with the re-review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4j4gD0lPNTCPfwTw8Zk7qHv1fozvVdSwxoTqhyqLwBCP84B6R1GSqPHNjv8fhYMKRapYykQlRtODnOVX5l47Ag==

## What changes

The tests of `server.device-pairing` make 106 `expect` calls instead of 124. No
check went away. The `setup()` of `device-pairing.test.ts` moved into
`device-pairing.test-helper.ts`, so the new `server.device-pairing-answers`
tests can share it. Its `newCode` checked that making a code answered 200 with
`expect(answer.status).toBe(200)`, once per code, 18 times across these tests.
A helper file may not import Vitest (the lint allows it only in `*.test.ts`
files and `test/` folders), so the helper now throws when the answer isn't 200
or has no code. A wrong answer still fails the test, now also when the code is
missing.

The other change to these tests: a second request with the same code now gets
`state: "taken-over"` instead of 404 when the first device polls, as
`server.device-pairing-answers` requires.

## Covers

- server.device-pairing
