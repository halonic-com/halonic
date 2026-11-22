# Decision: the plugin's worker test also expects the board-check job

- Approval: Liam reviews the board check's write gate and signs this note as the CTO
- Kind: internal

The board check (phase 1b, HAL-16194) adds a second job, `board-check`,
to the Agent tools plugin's manifest, every 10 minutes like `pr-watch`.
The worker test in `paperclip.pr-watcher-plugin` compared the manifest's
whole job list with `pr-watch` alone, so it now lists both jobs. It still
checks that `pr-watch` is scheduled every 10 minutes and that the job skips
a company without a token; nothing it checked is dropped.

## Covers

- tooling/paperclip/src/plugin/worker.test.ts
