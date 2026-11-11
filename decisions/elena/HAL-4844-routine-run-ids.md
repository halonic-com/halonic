# Decision: routine run ids become names the run stores accept

- Approval: found while building `halonic routines watch` on [HAL-4844](/HAL/issues/HAL-4844); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8a0dSJX5JyZ9ztCqQeYsKx/M0keGSGVlD6j4YPjx/pdxuoqeg2Xt/5Q6K3pf3yNmNT5bswFI2X7SvpFINTkACg==
- Task: HAL-4844

## What changes

`routineRunId` made ids such as `routine:9f67cab0a2a7258c/acme/daily-report@2026-11-03T08:00:00.000Z`.
The run store port's `checkRunId` accepts only 1 to 128 letters, digits, `_`, `-` and `.`, because
the folder run stores (`fs-node` for the CLI, `fs-tauri` for the desktop app) keep each run as a
file of that name. So every routine run on a real store failed to start with "Unsafe run id"; only
the in-memory test stores took them. `halonic routines watch` was the first host to run the
scheduler on a folder store and found it.

The id is now `routine-<workspace hash>-<due time without "-" and ":">-<hash of the routine key and
due time>`, 62 characters for any key. It is still the same for the same workspace, routine and due
time, so a repeated start returns the run that exists. The routine key stays readable in the run's
`trigger.routineId`. The hash comes last so the short id (the last 6 characters) differs between
runs of one routine.

`app.routine-scheduler` said run ids "shall stay within 256 UTF-8 bytes"; it now says they are names
every run store keeps as a file name, of one length for any key. Its last example changes with it.

## Tests

`routine-ids.test.ts`: the test of the hashed long key is replaced by one that checks four keys
(plain, `@workspace`, accents and emoji, 240 characters) against the port's own `checkRunId`, which
fails before this change, and one that two runs of a routine get different short ids. The pinned
ids of "keeps the run ids … it gave before" are the new ones. No stored run can have an old id: no
file run store ever accepted one. No other test changed.

## Covers

- app.routine-scheduler
- packages/core/app/src/routine-ids.test.ts
