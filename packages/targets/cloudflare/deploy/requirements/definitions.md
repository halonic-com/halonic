# deploy.definitions

- Status: active
- Since: unreleased
- Source: HAL-13589 (found on HAL-12480); build plan 3a (HAL-198); multi-cloud ADR 5.6

The deploy shall treat the R2 bucket `<worker>-defs` as one of the resources a Worker needs, next to `<worker>-blobs`, with the same rules: `provision` creates it and marks it in `<worker>-data`, refuses it unmarked unless `adopt` is set, and `plan` lists it. Before the upload, while it holds the lock, the deploy shall write the snapshot of the workspace's files at the commit it deploys into that bucket (files, routine index, manifest, then `current`), report `definitions-written` with the snapshot's version, and bind the bucket to the Worker as `DEFINITIONS`, in place of any `DEFINITIONS` binding the caller gave. `destroy` shall empty the definitions bucket before it deletes it, because its files are a copy of a git commit; it shall never empty `<worker>-blobs`.

Rationale: the Worker refuses to start without a `DEFINITIONS` binding, and a deploy that leaves the bucket or its snapshot to the caller isn't a real deploy. The snapshot comes from the same commit as the bundle, so the code and the workflows it runs match.

## Examples

- Given an empty account, then `plan` lists `<worker>-defs` as `create`, and a deploy creates and marks it.
- Given an unmarked bucket named `<worker>-defs` and no `adopt`, then the deploy stops with `unmarked-resources` naming it.
- Given a deploy of a commit with a routine file, then the bucket holds that commit's files and `current` before the upload, and the upload binds `DEFINITIONS` to `<worker>-defs`.
- Given a caller that binds `DEFINITIONS` to another bucket, then the upload binds it to `<worker>-defs` only.
- Given a deployed Worker, then `destroy` empties `<worker>-defs`, then deletes it, and never empties `<worker>-blobs`.
