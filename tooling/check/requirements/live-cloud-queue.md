# check.live-cloud-queue

- Status: active
- Since: unreleased
- Source: HAL-15970 (board decision, 22 Nov)

When a change touches a cloud path, the live cloud suites shall run in the merge queue on the merge group's commit, and CI's `live-cloud` gate shall fail the group until they passed there; on a pull request from this repository the gate shall wait for them only when the change touches what they exercise directly (a `cloudflare-*` or `store-s3` adapter, `packages/targets`, the live suites, the deploy command, the `live-cloud` workflow or the code that decides, probes and sweeps for it: `cloud-affected`'s `on-pull-request`). A fork's pull request that touches any cloud path shall still fail the gate; a merge group that changes a cloud path while it holds a fork's pull request shall fail without running the suites, so a fork's code never gets the token; and a merge group that the queue drops shall stop its live run.

## Examples

- Given a ready pull request that changes `packages/core/ports/src/blob-store.ts` only,
  when CI runs on it,
  then the gate passes with a notice and the live suites don't run on it.
- Given a ready pull request that changes `packages/adapters/cloudflare-r2/src/store.ts`,
  when CI runs on it before the live suites passed on its head,
  then the gate fails, as before.
- Given a merge group whose own change touches `packages/host/server/src/handler.ts`,
  when CI runs on it,
  then the gate waits for the `live-cloud` job of `live-cloud.yml` on the group's commit and fails the group if it fails.
- Given a merge group whose pull request already passed the live suites, and nothing ahead of it in the queue changed their inputs,
  when the group's live run starts,
  then it reuses that pass.
- Given a pull request from a fork that changes `packages/core/ports/`,
  when CI runs on it,
  then the gate fails: a maintainer pushes the branch into this repository.
- Given a pull request from a fork that changes `tooling/check/src/lib/workspace.ts` and is queued,
  when a merge group that holds it changes a cloud path,
  then the live suites don't run with the token and the group fails.
