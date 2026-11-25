# Decision: the PR watcher's read-only rule names its read token, now that a separate credential rebases stacked pull requests

- Task: HAL-18031
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18035 (Julian's OK with changes on the branch credential; Liam approves this note in review)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:AOnVcSJv6Y9IBeykaVeJIxKXCIoqcVLokFNiGkDMKKnpzHC7UTPs1QRT3mwBTinE50exYBCSlpR08ssxCT2mDQ==

The PR watcher gains one write: when a stacked pull request's base merges, it asks GitHub once per head to rebase the child on `main` (`paperclip.pr-watcher-stack-rebase`). That write goes through a separate branch credential and its own client, which sends only the rebase mutation (`paperclip.branch-update-write-scope`). The watcher's read token still only reads.

So `paperclip.pr-watcher-read-only` changes by one phrase: the watcher sends only GET requests and single-query GraphQL documents "with its read token". Its source line names HAL-18031. Nothing else in it changes, and its tests stay as they are.

No test was weakened. One test changed: the merge-control write client's import check (`src/merge-control/write-client.test.ts`) matched any file named `write-client.ts`, so it would have counted the new branch client's importer. It now matches merge control's own client only, and asserts the same two importers as before. The branch client has its own import check.

## Covers

- paperclip.pr-watcher-read-only
