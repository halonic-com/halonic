# Decision: doctor's sentences move to a shared words package

- Approval: Liam planned it on HAL-13406 (first-run-progress 4.2 and 7, sized on HAL-8005 item 1); Mateo checked it on HAL-14801. It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, and Liam after Mateo's check
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:n8QW/En5B2UCp4sH53VJrLdNAeDb40gaKQTZNQKDJi9FnZkNKzvOA7yCnb+Wv/lVjv02QOGRiUwnCPguDpnUBw==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:m74vF/KlJjGO8G9xAOSpkDiRZBQMEp2Lr2W5h2owTQLTTWrCmPw7s8zx28bOkSsFSgPjGWA0l1ifb3Oa03WlCg==
- Task: HAL-13406

## What changes

A new core package, `@halonicjs/words`, holds the phrase builder (`phrase`, `bold`, `dim`,
marks by name, `plainText`), `defineMessages`, the count and size helpers, and every sentence
of `halonic doctor`. Studio's Check this computer will take the doctor's words from it, so it
says what the CLI says. The CLI keeps the terminal's side (colours, ASCII stand-ins, cutting to
width, shell quoting) and re-exports the rest from its old paths, so no other CLI file changes.

`tooling/check/policy.json` adds `@halonicjs/words` at the end of `coreOrder`, where
`pnpm new package` put it. Nothing else in the guard changes.

The doctor's Workspace sentences now take the finished command (`halonic trust --dir ./acme`)
instead of the `--dir`, because quoting a folder for a shell needs `process.platform`, which
core may not use. The CLI builds the same command as before, so its output is unchanged:
`halonic doctor --dir examples/acme` prints the same bytes on this branch and on `main`.

## Tests

No test is weakened. Three test files move with their code, and every case is kept:

- `apps/cli/src/messages/counts.test.ts` and `size.test.ts` move to `packages/core/words/src/`
  unchanged.
- `apps/cli/src/messages/doctor.test.ts` moves to `packages/core/words/src/doctor.test.ts`. Its
  `verifies("cli.messages")` block now verifies the new requirement `words.doctor`, which is
  where the sentences live now. Its one terminal assertion (the separator drawn as `-` without
  UTF-8) moves to `apps/cli/src/messages/phrase.test.ts` as a `renderPhrase` test, so
  `cli.messages` runs one test fewer. The sentences are still pinned word for word, and the
  CLI's doctor-report tests still pin the whole printed report.

## Covers

- cli.messages
- apps/cli/src/messages/counts.test.ts
- apps/cli/src/messages/size.test.ts
- apps/cli/src/messages/doctor.test.ts
- tooling/check/
