# Decision: a record of the notes merged without a signature, and a check that no more land

- Approval: HAL-11244; the CTO signs as the holder of the user-visible key
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:By+xr5LaHiqT2yRBkzdVUlyKbFYtpSMNx++ZYybWsKX65g6IUK7YYTeM6a5XxCKmL9Gpl/1RFVgKkc+TdEqABw==

## What changes

155 decision notes on `main` have no signature line. They merged between 8 and 13 November
2026, while the note check was advisory or not yet required: 12 on the 8th, 37 on the 9th, 93 on
the 10th, 11 on the 11th and one each on the 12th and 13th, none since. Notes on `main` are
append-only, so they stay as they are. This note is the signed record of them: it lists each one
below, and the new `notes-signed` check accepts a note on `main` without a signature only when
this list names it.

`notes-signed` is part of `pnpm check`. It fails on a note under `decisions/` with no signature
line, a signature in the wrong form or from a key `approvers.json` doesn't pin, or a header the
note format doesn't accept. On a pull request it leaves the branch's own note to the note check,
which verifies the signature against that pull request. In the merge queue and on `main` it
checks every note, so a note that slipped past the note check fails the next run.

The `guard-notes` workflow is now required on `main` by the organisation's ruleset, so a pull
request can't merge with its note check red.

The six `user-visible` notes and the two with a `Kind` the note format doesn't accept were
re-read with their merged diffs:

| Pull request | Note | Finding |
| --- | --- | --- |
| 254 | `decisions/elena/HAL-731-edit-yaml-tidy.md`, user-visible | The requirement and tests match the note; two tests were added and none weakened. The note says nothing is taken away, but the "keep every other character" promise is narrowed on purpose for the blank-line and comment tidying, as its "Why" says. Accepted. |
| 978 | `decisions/elena/HAL-3379-choice-answer.md`, user-visible | The new failure reason and the engine's check match the note; the two new requirements are additions. Accepted. |
| 883 | `decisions/ravi/HAL-2918-subcommand-after-options.md`, user-visible | Only line 1 of the error changes; the requirement, its example and the test change together, with the same number of `expect` calls. Accepted. |
| 1014 | `decisions/ravi/HAL-1219-approve-all.md`, user-visible | No `.github/` file changed. The one guard path, `allowed-differences.json`, is covered, and its new entry is signed off in the file although the note says "proposed". Accepted. |
| 887 | `decisions/tomas/HAL-2972-model-adapter-follow-ups.md`, user-visible | The provider's error text moves from the message to the error's `cause`, as the note says, and the tests pin more than before. The note leaves out the pull request's other half: aborts while reading an error, the call's own key dropped, the host named, the reply size caps and their four new requirements. Those are additions. Accepted. |
| 740 | `decisions/priya/HAL-2498-01-deployment-id-rule.md`, user-visible | The 64-character cap and the refused Windows device names match the note, the requirement and the spec, with tests only added. Accepted. |
| 789 | `decisions/owen/HAL-2688-01-cache-token-prices.md`, `Kind: public interface` | The prices and requirements match the note, with tests only added; a `hub.schema.json` edit isn't mentioned. The Kind isn't one the note format accepts; this record treats the note as `user-visible`, since it changes what runs cost. Accepted. |
| 859 | `decisions/owen/HAL-2688-02-cache-write-1h-price.md`, `Kind: public interface` | The 1-hour write count and price match the note, with tests only added. The Kind is the same as above and is treated the same way. The pull request also rewrote the merged HAL-2688-01 note, before notes were append-only, without listing it; its current text is the one this record accepts. Accepted. |

The other 147 are `internal` notes or older notes with no `Kind` line. Seven of their pull
requests also changed one of the guard's own paths, and those diffs were re-read too:

| Pull request | Note | Guard path it changed | Finding |
| --- | --- | --- | --- |
| 623 | `decisions/priya/HAL-1664-01-format-spec-files.md` | `tooling/check/src/guard/golden-files.ts` and its requirement and test | A `.schema.json` file under `spec/` now counts as a golden file, so changing one needs a note. The guard gets stricter, nothing is let through that wasn't before. Accepted. |
| 668 | `decisions/maya/HAL-2045-yaml-missing-key-parent.md` | `packages/testing/parity/allowed-differences.json` | Three entries for a missing key reported at its parent key's line; only the line moves, the path and code stay. Accepted. |
| 687 | `decisions/priya/HAL-1664-02-spec-ids.md` | `tooling/check/src/lib/workspace.ts` and the spec snapshot code | `workspace.ts` gains an optional `version` field in a type; the rest is the new spec snapshot check with its tests. Accepted. |
| 1022 | `decisions/julian/HAL-1337-01-signed-notes.md` | the guard's signature check and `tooling/check/approvers.json` | The pull request that brought in signed notes, so its own note had no key to be signed with. It pinned only the CTO key; both later changes to `approvers.json` (2355, 2465) carry two guardians' signatures. Accepted. |
| 1140 | `decisions/elena/HAL-3689-parallel-name-order.md` | `packages/testing/parity/allowed-differences.json` | Already reviewed in `decisions/mateo/HAL-8178-guard-path-clean-up.md`. Accepted. |
| 1287 | `decisions/tomas/HAL-2544-login-shell.md` | `tooling/check/process-starters.json` | One new entry for the login shell's PATH reader, with its reason and a test that it starts nothing for a refused shell. Accepted. |
| 1918 | `decisions/ravi/HAL-983-fenced-attacks.md` | `.github/workflows/ci.yml` | The two fence jobs also run the integration runner's fence tests, and its folder starts them. No step, secret or permission removed. Accepted. |

The rest changed no guard path.

Two other changes:

- `decisions/elena/HAL-8421-toolbar.md` named a person in its approval line. It now says "the
  board approved this on HAL-8416". Its old signature doesn't match the new text; this note's
  signature covers it.
- `events.blocked-sites` used a real domain as its example; it now uses `kite.example` and the
  look-alike `\u212Aite.example` (Kelvin sign). The rule and the test's cases are the same: two
  sites, the look-alike kept as written.

No test, golden file or requirement promise was weakened or removed.

## Notes without a signature

- `decisions/elena/HAL-1218-01-wait-description.md`
- `decisions/elena/HAL-1532-01-effect-requested.md`
- `decisions/elena/HAL-1532-03-connector-calls.md`
- `decisions/elena/HAL-1533-05-result-blobs.md`
- `decisions/elena/HAL-1533-06-run-log-nits.md`
- `decisions/elena/HAL-1535-02-child-runs.md`
- `decisions/elena/HAL-1536-01-agent-finished-error.md`
- `decisions/elena/HAL-1536-02-parallel-state.md`
- `decisions/elena/HAL-1537-02-workflow-finished-context.md`
- `decisions/elena/HAL-1707-02-sandbox-events.md`
- `decisions/elena/HAL-1707-03-sandbox-off-engine.md`
- `decisions/elena/HAL-1707-sandbox-opened.md`
- `decisions/elena/HAL-189-01-started-events.md`
- `decisions/elena/HAL-189-02-sandbox-blocked.md`
- `decisions/elena/HAL-189-03-agent-harness-fields.md`
- `decisions/elena/HAL-1966-list-row-edge.md`
- `decisions/elena/HAL-2196-cli-approved-texts.md`
- `decisions/elena/HAL-223-keybindings.md`
- `decisions/elena/HAL-2311-subscription-calls.md`
- `decisions/elena/HAL-2472-cli-text-follow-ups.md`
- `decisions/elena/HAL-2524-02-trigger-catch-up.md`
- `decisions/elena/HAL-2524-05-scheduler-skips.md`
- `decisions/elena/HAL-2559-pin-shell-config-bypasses.md`
- `decisions/elena/HAL-2609-dialog-design-check.md`
- `decisions/elena/HAL-3379-choice-answer.md`
- `decisions/elena/HAL-3517-07-form-sheet.md`
- `decisions/elena/HAL-3517-08-picker-chip.md`
- `decisions/elena/HAL-3517-09-select-sheet.md`
- `decisions/elena/HAL-3520-04-slider-fixes.md`
- `decisions/elena/HAL-3520-04-slider-phone-thumb.md`
- `decisions/elena/HAL-3520-05-input-leading-fixes.md`
- `decisions/elena/HAL-3520-06-colour-popover-fixes.md`
- `decisions/elena/HAL-3689-parallel-name-order.md`
- `decisions/elena/HAL-3713-skip-record-retry.md`
- `decisions/elena/HAL-3804-select-reason.md`
- `decisions/elena/HAL-3808-form-sheet-follow-ups.md`
- `decisions/elena/HAL-3989-branch-read-tools.md`
- `decisions/elena/HAL-404-02-splice.md`
- `decisions/elena/HAL-404-05-indent-flow.md`
- `decisions/elena/HAL-4215-00-run-definitions.md`
- `decisions/elena/HAL-4215-harness-unavailable.md`
- `decisions/elena/HAL-4248-programs-key.md`
- `decisions/elena/HAL-4456-parallel-choice-answer.md`
- `decisions/elena/HAL-4458-test-knowledge.md`
- `decisions/elena/HAL-5218-01-proposals.md`
- `decisions/elena/HAL-5218-04-review-restore.md`
- `decisions/elena/HAL-731-edit-yaml-tidy.md`
- `decisions/elena/HAL-973-02-close-stack.md`
- `decisions/elena/HAL-973-announcer-review.md`
- `decisions/elena/HAL-974-timeline-entry-id.md`
- `decisions/julian/HAL-1337-01-signed-notes.md`
- `decisions/julian/HAL-3064-02-pin-network-trap.md`
- `decisions/julian/HAL-3493-02-nested-git-check.md`
- `decisions/julian/HAL-3493-03-commondir-modules.md`
- `decisions/julian/HAL-3672-nested-submodule-git.md`
- `decisions/julian/HAL-3733-symlinked-submodule-git.md`
- `decisions/julian/HAL-3986-01-pushurl-git-links.md`
- `decisions/julian/HAL-3986-02-run-options-nested-gitdir.md`
- `decisions/julian/HAL-956-private-entry-folding.md`
- `decisions/liam/HAL-2527-pin-launch-refusals.md`
- `decisions/liam/HAL-3084-probe-test-timeout.md`
- `decisions/liam/HAL-3230-probe-test-retry.md`
- `decisions/liam/HAL-4014-answer-labels.md`
- `decisions/mateo/HAL-115-01-routines-schedule.md`
- `decisions/mateo/HAL-1451-07-no-fallback-in-the-app.md`
- `decisions/mateo/HAL-909-core-messages.md`
- `decisions/maya/HAL-2045-yaml-missing-key-parent.md`
- `decisions/owen/HAL-1007-02-routine-overlap.md`
- `decisions/owen/HAL-1007-03-occurrences-zone.md`
- `decisions/owen/HAL-1266-routine-last-run.md`
- `decisions/owen/HAL-133-01-kernel-real-inputs.md`
- `decisions/owen/HAL-1408-attack-cases.md`
- `decisions/owen/HAL-1728-01-events-reasons.md`
- `decisions/owen/HAL-1728-02-failure-of-error.md`
- `decisions/owen/HAL-1910-02-integration-kit-kinds.md`
- `decisions/owen/HAL-1994-03-cli-exit-codes.md`
- `decisions/owen/HAL-1994-04-print-error.md`
- `decisions/owen/HAL-2147-cli-debug.md`
- `decisions/owen/HAL-2223-cli-help-options.md`
- `decisions/owen/HAL-2224-cli-scrub-errors.md`
- `decisions/owen/HAL-2310-07-agent-host-connector-client.md`
- `decisions/owen/HAL-2553-01-close-waits.md`
- `decisions/owen/HAL-2688-01-cache-token-prices.md`
- `decisions/owen/HAL-2688-02-cache-write-1h-price.md`
- `decisions/owen/HAL-2688-04-bridge-cache-tokens.md`
- `decisions/owen/HAL-2831-01-tool-result-risk.md`
- `decisions/owen/HAL-3229-02-openai-cache-tokens.md`
- `decisions/owen/HAL-3229-03-prompt-and-tool-choice.md`
- `decisions/owen/HAL-3229-openai-url-inputs.md`
- `decisions/owen/HAL-3586-01-claude-code-settings.md`
- `decisions/owen/HAL-3586-05-instructions-file.md`
- `decisions/owen/HAL-3589-subscription-pass-through.md`
- `decisions/owen/HAL-3791-forced-tool-choice.md`
- `decisions/owen/HAL-3998-02-codex-config.md`
- `decisions/priya/HAL-1176-setup-record-check-kinds.md`
- `decisions/priya/HAL-1290-36-search-ranking.md`
- `decisions/priya/HAL-1290-40-maximise-narrow.md`
- `decisions/priya/HAL-1290-45-phone-window.md`
- `decisions/priya/HAL-1290-48-palette-icons.md`
- `decisions/priya/HAL-1664-01-format-spec-files.md`
- `decisions/priya/HAL-1664-02-spec-ids.md`
- `decisions/priya/HAL-1734-01-plugin-kind.md`
- `decisions/priya/HAL-1771-02-chat-signal.md`
- `decisions/priya/HAL-1771-03-stopped-tools-ran.md`
- `decisions/priya/HAL-2498-01-deployment-id-rule.md`
- `decisions/priya/HAL-2498-02-profile-deployment-id.md`
- `decisions/priya/HAL-2903-secrets-tauri-replies.md`
- `decisions/priya/HAL-302-03-next-cron-time.md`
- `decisions/priya/HAL-302-05-cron-messages.md`
- `decisions/priya/HAL-3063-01-place-names.md`
- `decisions/priya/HAL-3063-02-menu-escape-in-dialog.md`
- `decisions/priya/HAL-3071-tab-set-one-step.md`
- `decisions/priya/HAL-3277-06-records-in-profile.md`
- `decisions/priya/HAL-3298-01-records-folder.md`
- `decisions/priya/HAL-3299-compact-agent-memory.md`
- `decisions/priya/HAL-3383-remove-per-path-queue.md`
- `decisions/priya/HAL-345-compact-strict.md`
- `decisions/priya/HAL-3499-whole-append.md`
- `decisions/priya/HAL-3548-rename-over-stores.md`
- `decisions/priya/HAL-4075-rename-over-settings-compact.md`
- `decisions/priya/HAL-4759-02-connector-working-folders.md`
- `decisions/priya/HAL-708-02-sign-in-checks.md`
- `decisions/priya/HAL-708-03-check-hardening.md`
- `decisions/priya/HAL-709-02-refresh-refused.md`
- `decisions/ravi/HAL-1219-approve-all.md`
- `decisions/ravi/HAL-1769-outside-run-error.md`
- `decisions/ravi/HAL-1892-04-init-empty-folder.md`
- `decisions/ravi/HAL-2184-10-live-line-width.md`
- `decisions/ravi/HAL-2184-11-wire-live-line.md`
- `decisions/ravi/HAL-2184-12-wire-stop.md`
- `decisions/ravi/HAL-2918-subcommand-after-options.md`
- `decisions/ravi/HAL-3445-ask-in-context.md`
- `decisions/ravi/HAL-3678-secret-plain-http-loopback-only.md`
- `decisions/ravi/HAL-3739-stop-review-notes.md`
- `decisions/ravi/HAL-3963-02-follow-cancel.md`
- `decisions/ravi/HAL-4056-03-run-live.md`
- `decisions/ravi/HAL-4249-run-cancel-texts.md`
- `decisions/ravi/HAL-4356-failed-cancel-wording.md`
- `decisions/ravi/HAL-983-fenced-attacks.md`
- `decisions/tomas/HAL-1525-events-optional-fields.md`
- `decisions/tomas/HAL-1529-01-summary-ends-approvals.md`
- `decisions/tomas/HAL-1880-model-call-reasons.md`
- `decisions/tomas/HAL-2210-01-tool-approval-port.md`
- `decisions/tomas/HAL-2284-05-stream.md`
- `decisions/tomas/HAL-2544-01-pin-helpers.md`
- `decisions/tomas/HAL-2544-login-shell.md`
- `decisions/tomas/HAL-2921-05-stream.md`
- `decisions/tomas/HAL-2972-model-adapter-follow-ups.md`
- `decisions/tomas/HAL-3008-model-failure-reasons.md`
- `decisions/tomas/HAL-3245-06-git-worktrees.md`
- `decisions/tomas/HAL-3245-07-git-commits.md`
- `decisions/tomas/HAL-3331-03-run-approvals.md`
- `decisions/tomas/HAL-5173-run-records-version.md`
- `decisions/tomas/HAL-638-get-path-own-properties.md`
- `decisions/tomas/HAL-662-01-listing-shape.md`

## Covers

- check.notes-signed
- events.blocked-sites
- decisions/elena/HAL-8421-toolbar.md
- tooling/check/
