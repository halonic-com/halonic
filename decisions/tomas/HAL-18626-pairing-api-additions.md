# Decision: the pairing tests share a helper, and `server.device-pairing` points to its new answers

- Approval: Liam approved PR 6118 on HAL-18626 (https://paperclip.halonic.com/HAL/issues/HAL-18626#comment-8afbff88-534b-40f8-9229-71f51d0e77f3) and signs this note with the re-review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FuBNVe/ZHdwlIHoCYaERLZQwB4Uk6n6QbEbbl3S0J4A4U04e1MaAxnbLs+PTduTwGO7lHAn9lfEaIL1RoPiTCA==

## What changes

The tests of `server.device-pairing` make 18 fewer `expect` calls than on `main` (137 instead of 155 since #6121 merged). No
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

The requirement's text changes in two places, and the new answers come from
`server.device-pairing-answers`. A second request with a code that has one
waiting is still refused, but it now ends the first request (as `taken-over`)
instead of cancelling it. A cancelled, refused or expired pending ID now
answers only why it ended, instead of nothing. A used or guessed pending ID
still answers nothing. The Source line names HAL-18626. `server.device-pairing`
became active with #6121 while this pull request was open, so these edits now
change an active requirement.

## Covers

- server.device-pairing
