# Decision: a routine reviewer role for Nora's review scope

- Approval: the board's decision of 26 Nov for a review-only agent; scope set by the board on HAL-18424. Julian signs, since Liam wrote the pull request
- Kind: internal

The routing gets a third review role, `routine-reviewer`, for the pull requests the
review-only agent (Nora) may approve alone: everything Julian may approve, except
`packages/core/`, `packages/host/`, `packages/testing/spec/` and a public interface
(`src/index.ts`). That is the scope the board set on HAL-18424 on 26 Nov, with no shadow
trial; Liam audits her approvals afterwards. `paperclip.routine-review` is the new rule.
`paperclip.reviewer-routing` and `format.workspace-routing` name the new role, and the
snapshot's routing schema (and its spec files) accept it.

`paperclip.reviewer-paths` gains the code that counts signed approvals
(`merge-control/approval.ts`, `merge-control/signed.ts`, `pr-tools/approvals.ts`) and any
file starting with `tooling/paperclip/src/reviewer-paths`, so neither Julian nor Nora
approves a change to how their own approvals count.

Nothing routes differently yet: without a routing, Julian covers the role, and a routing
that leaves it out falls back to the second reviewer. Nora takes the role when she runs,
by a one-line change to `defaultRoles`.

## Why

The review backlog sat at about 22 pull requests on 26 Nov, waiting on two reviewers who
also build. The board decided on a review-only agent so that Liam and Julian see only what
needs them. The core building blocks, the host, the guard's spec helper and public interfaces stay
with Liam and Julian.

## Covers

- paperclip.reviewer-routing
- paperclip.reviewer-paths
- format.workspace-routing
- packages/core/format/spec/routing.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
