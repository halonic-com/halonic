# Decision: four word fixes from words check C566

- Task: HAL-15361
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15352#document-c566 (rows 8, 22, 48 and 54 list the new words; details of approved screens and output, so a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:AihiOp+ObeOElF1PqetWGlnZ6y28C2oUNENGG+hkT8OxGHD/o/uCSODc8AP7JDwMO57cMPtKHz2JlcPEfkO7Cg==

## What changes

Four active requirements are edited so they say the words C566 decided:

- `settings.unfenced-yes-take-back`: the line when the host can't say whether a yes is saved reads "Couldn't check whether plugins and integrations may run without the sandbox.", like the block's heading, its line and its toast (row 8).
- `cli.commands.plugin.off-here`: the reason and fix under a plugin that is off on this computer are the CLI's own sandbox words, `halonic doctor`'s reason and fix without "Then run halonic doctor again.", so no fix points to Studio's Settings, which the CLI doesn't have (row 22). `--json` is unchanged.
- `studio.engine-service`, `inbox.approval-card` and `routines.page.run-now-failed`: the lock refusal no longer names the other process in its sentence: "Acme is already running in another Halonic on this computer. Stop that one, then try again." The process number goes to Copy details only (row 48, microcopy 1.6 S1).

`models.api-keys.not-bound-yet`, a draft, also changes: addresses that can't be read say "Check that your system keychain is unlocked, then try again." and get a **Try again** button that reads them again (row 54).

The tests that pinned the old words are updated to the new ones, and new tests cover the CLI's setup-needed line and **Try again**. No test was weakened or skipped.

## Why

Words check C566 on HAL-15352 found that these four places say something the approved rules don't: a narrower rule than the block's heading, a fix the CLI can't follow, a process number a person never sees, and a recovery step that points to the wrong place and a reload Studio doesn't have.

## Covers

- settings.unfenced-yes-take-back
- cli.commands.plugin.off-here
- studio.engine-service
- inbox.approval-card
- routines.page.run-now-failed
