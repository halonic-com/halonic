# Decision: the deploy makes, fills and removes the definitions bucket

- Approval: the task asks for this change (https://paperclip.halonic.com/HAL/issues/HAL-13589, found on HAL-12480); Liam approves this note in review
- Kind: internal

## What changes

- `resourcesFor(worker)` now lists a fourth resource, the R2 bucket `<worker>-defs`, marked in
  `<worker>-data` like the blobs bucket. So `provision` creates it, `plan` lists it, an unmarked
  one is refused without `adopt`, and `destroy` removes it.
- `deploy()` reads the workspace's files at the commit it deploys (a new `files(commit)` on
  `DeploySource`), writes them as a snapshot into that bucket while it holds the lock, before the
  upload, and binds the bucket as `DEFINITIONS`. The new requirement `deploy.definitions` says so.
- `deploy.destroy` said `destroy` never empties a bucket and that any bucket with files fails with
  `bucket-not-empty`. It now empties the definitions bucket before deleting it; the blobs bucket
  keeps the old rule. Without this, every `destroy` after a deploy would fail on the snapshot.
- `deploy.provision` names both buckets.
- The existing tests that list the resources (provision, deploy plan, destroy order) now expect the
  fourth one. No assertion was removed or loosened: each list gained an entry.

## Why

The Worker refuses to start without a `DEFINITIONS` binding, and until now only the live fixture
made the bucket and wrote the snapshot, by hand. A real `halonic deploy` has to do it itself
(HAL-13589). Emptying the definitions bucket loses nothing: its files are a copy of a git commit,
and the next deploy writes them again. The blobs bucket holds user data, so it is still never
emptied.

## Covers

- deploy.destroy
- deploy.provision
- packages/targets/cloudflare/deploy/src/deploy.test.ts
- packages/targets/cloudflare/deploy/src/destroy.test.ts
- packages/targets/cloudflare/deploy/src/provision.test.ts
