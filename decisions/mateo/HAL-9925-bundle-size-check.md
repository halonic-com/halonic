# Decision: the Worker bundle fails on a too-big script and names the import that won't bundle

- Task: HAL-9925
- Approval: Liam decided the scope on HAL-9927 (option 1: the checks go into `buildWorkerBundle`, no second copy in `deploy`) and approved PR #2850 on HAL-9929; Liam signs this note as the CTO
- Kind: internal

## What changes

`publish.worker-bundle` gains two rules. The build fails with an error that names each import it
couldn't bundle (one line per esbuild error, e.g. `Could not resolve "x"`), and it fails when the
gzip-compressed script is over 10,000,000 bytes. That is the Cloudflare Workers paid-plan limit,
counted a little low so the build fails here and not at the upload. Two examples are added, one
per rule. Nothing already in the requirement changes.

## Why

The `test:live` harness (HAL-9925) and `deploy` need to know before the upload that the Worker
is too big, and a failed build should say which import is missing instead of a raw esbuild error.

## Tests

No test was weakened or skipped. Three were added: a missing named import, the real Worker under
the limit, and the real Worker over a lowered limit.

## Covers

- publish.worker-bundle
