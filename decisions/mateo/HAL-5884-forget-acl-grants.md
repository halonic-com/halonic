# Decision: a known srt limit stays an expected failure in the kept-grants fence test

- Task: HAL-5884
- Approval: Liam reviews and approves this note on [HAL-6110](/HAL/issues/HAL-6110)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:RBOj2PU88E+HD+ITwwsapBnO62y4AkJWSPBhT7hGNY2r6ivrAi70vJrA2csxpO0WtNrKpqE/pXQnDUy8J3SSAQ==

## What changes

The new Windows fence test
`packages/adapters/sandbox-srt/fence/srt-kept-grants.windows.test.ts` checks what a
later session can read of an earlier one's folders. One case in it is marked
`it.fails`: "hides what session A wrote from session B while both are open".

## Why

sandbox-runtime doesn't separate reads between two sessions that run at the same
time on Windows, so session B can read session A's live folder. Our code can't
fix that: it is a limit of srt itself. The other cases in the file check what
HAL-5884 does fix: once a session closes, its grants are gone.

`it.fails` keeps the limit visible and runs it on every Windows fence job. When
srt starts separating live sessions, the case passes, `it.fails` turns red, and
whoever bumps srt flips it to a normal `it`.

## Tests

No existing test was weakened or skipped. The file is new in this pull request.

## Covers

- packages/adapters/sandbox-srt/fence/srt-kept-grants.windows.test.ts
