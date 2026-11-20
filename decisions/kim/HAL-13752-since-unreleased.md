# Decision: 24 more requirements written after 0.1.0 say `Since: unreleased`

- Task: HAL-13752
- Approval: Nina's C227 claims check asked for this change on HAL-13752 (https://paperclip.halonic.com/HAL/issues/HAL-13752), following HAL-11580. A team decision with no board card.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QW1SUKWEyiLsSqF5BhRq2CuqlWcshH7tN7el1QKYKEVo7HW4ANtAg2RiW3EjNfNbLnlDIkjSotb3vSLJzH3SCw==

## What changes

24 requirement files that aren't in `v0.1.0`, under their path or their ID, said `Since: 0.1.0`
(23) or a guessed `0.3.0` (one); they now say `Since: unreleased`, as
`decisions/elena/HAL-11580-02-since-unreleased-specs.md` and `docs/guides/checks.md` ("What
`Since` says") ask. Two came from the merges of 19 November: `agent-host-client.sandbox-choice`
(#3101) and `fs-tauri.engine-lock` (#2761). No requirement text, status or test changes, and no
test was weakened or skipped.

The guard wants every edited active requirement named, so Covers lists the 15 active ones (the
other 9 are drafts).

`check.guard-dependency` and `spec.verifies-counts-retries-once` have the same mistake but are left
out. They sit under the guard's own paths, so a note for them must cover all of `tooling/check/`
and `packages/testing/spec/`, and every later change there on `main` breaks the signature in the
merge queue. That happened to this pull request on 20 November. They go with the trace check work
on HAL-13777, which changes `tooling/check/` anyway.

## Why

Work after the tag isn't in 0.1.0, and the next version isn't decided. The trace check accepts any
version, so it didn't catch these. Liam decided on this pull request that it should refuse a
`Since` version without a tag, and a tagged version whose tag doesn't have the requirement; that
is HAL-13777.

## Covers

- agent-host-client.sandbox-choice
- agent-host.integration-sign-in-routes
- events.approval-requested-connector
- files.ui.file-tab-try-again
- fs-node.definition-store-large-version
- integration-sign-in.sign-in-host
- kit.chat-loading
- kit.chat-start
- kit.field-late-error
- library.connector-tools-line
- shell.frame-field-errors
- shell.view-loading-state
- source-control.get-updates-per-item
- studio.workspace-agents
- studio.workspace-routines
