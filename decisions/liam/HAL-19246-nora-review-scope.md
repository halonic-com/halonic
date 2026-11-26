# Decision: a routine reviewer role for Nora's review scope

- Approval: the board's decision of 26 Nov for a review-only agent; scope set by Liam on HAL-19246. Julian signs, since Liam wrote the pull request
- Kind: internal

The routing gets a third review role, `routine-reviewer`, for the pull requests the
review-only agent (Nora) may approve alone: everything Julian may approve, except
`packages/core/`, `packages/host/`, `packages/testing/spec/`, `tooling/paperclip/`, a
public interface (`src/index.ts`) and any `package.json`, up to 800 changed lines of code.
`paperclip.routine-review` is the new rule. `paperclip.reviewer-routing` and
`format.workspace-routing` name the new role, and the snapshot's routing schema (and its
spec files) accept it.

Nothing routes differently yet: without a routing, Julian covers the role, and a routing
that leaves it out falls back to the second reviewer. Julian's own scope and the Merger's
count of his approvals are unchanged. Nora takes the role once Liam says her calibration
bar is met, by a one-line change to `defaultRoles` or the workspace's routing.

## Why

The review backlog sat at about 22 pull requests on 26 Nov, waiting on two reviewers who
also build. The board decided on a review-only agent so that Liam and Julian see only what
needs them. The narrow first scope keeps the core building blocks, the host, the guard's
spec helper, the review tooling, public interfaces and new packages or dependencies with
Liam and Julian until her calibration shows she can take more.

## Covers

- paperclip.reviewer-routing
- format.workspace-routing
