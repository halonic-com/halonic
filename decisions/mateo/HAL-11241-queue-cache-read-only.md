# Decision: the merge queue reads the remote cache but no longer writes to it

- Task: HAL-11241
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:C9xViwQfmsa6ADoNXWqxIKIvLdKoO69CAHzV7kTBvAVQ2RYVYGbM271OwzotFWDz35FFzXAwvAdKsnCoW23FCg==

## What changes

- The cache Worker (`infra/turbo-cache`) hands a write token only to a push to `main`. A merge-queue run now gets a read token that can read and query but never upload.
- In `.github/workflows/ci.yml`, the job "Typecheck, lint, test, build" runs the merge queue with `--cache=local:rw,remote:r`. `main` keeps `remote:rw`.

## Why

The merge queue runs the queued change's own code (package scripts, tests). With a write token in that run, a queued change could upload entries for unchanged packages that later runs on `main` and in the queue would trust. Now the code that is not yet on `main` can only read the cache. Only code already merged into `main` writes.

Checks are not weakened: the queue still verifies every entry with the signing key and runs the same tasks. Only the queue's uploads stop, so the first run on `main` after a merge fills the cache instead.

The Worker is deployed by hand after merge (`wrangler deploy` in `infra/turbo-cache`). Until then the queue's token exchange still answers with a write token, so the CI change alone only stops turbo from uploading.

## Covers

- .github/
- infra/turbo-cache/
