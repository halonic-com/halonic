# Decision: a footerless Dialog closes on the overlay after typing, and settings sections have a scope

- Approval: [HAL-6148](/HAL/issues/HAL-6148), Liam's review of halonic#1914 as package owner; the plan was approved in [HAL-5899](/HAL/issues/HAL-5899)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BP8FHxcq8/qvuaOupLFVpMcFkx7GXki4RCHUwmY7brWR5YhJRIGHQKCaeW8cfCflUK62BKnZPN3y5cMsSRFlBg==
- Task: HAL-1294

## What changes

`kit.dialog-no-footer` now says that a click on the overlay closes a Dialog without `confirm` also
after something was typed in it, with one example for it. Before, every Dialog stopped closing on
the overlay once something was typed. Form Dialogs and sheets keep that behaviour: their overlay
still stops cancelling after typing. `shell.frame-points` now says that settings sections are
listed by group first (`workspace`, then `display` and `host` together, each by `order` and `id`),
and that `settings.add` throws a `ShellError` naming the feature when a section's scope isn't
`workspace`, `display` or `host`. It gains an example for each.

## Why

Building the Settings contribution showed a trap: Settings is a footerless Dialog that saves as it
goes, but it stopped closing on the overlay as soon as the user typed in a field, because the
rule that protects a form's unsaved work applied to it too. A footerless Dialog has nothing to
lose, so the rule now applies only where there is work to keep. The settings scopes come from the
approved plan (flow-settings 2 and state-coverage ST 1.1): the Settings screen shows workspace
sections apart from display and host ones, so the shell sorts them that way and refuses a scope
it can't place, instead of showing it in the wrong group.

## Covers

- kit.dialog-no-footer
- shell.frame-points
