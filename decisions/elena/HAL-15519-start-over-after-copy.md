# Decision: Start over turns the first run off only once the copy is written

- Task: HAL-15519
- Approval: the plan on HAL-15519, approved by Liam on HAL-15521 (a fix to an approved flow that keeps the board's words, so a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:l+DlnO+B6qRAFNYts9qj846tDcdpWK5fTerClmbuTbQpLw8/KeWrvoeiOBPeuv1RjKwKBjOI/nLLeG7nPWujDQ==

## What changes

Two active requirements are tightened; nothing they promised before is dropped, and the words in the Help menu stay as they are:

- `first-run.help`, **Start over**. Old: "which turns the first run off and asks the app for a fresh copy of the demo in the next free folder (`workspace.fresh-copy-asks`), which never writes into a folder that is there; the copy, once open, starts the first run at Demo." New: "which asks the app for a fresh copy of the demo in the next free folder (`workspace.fresh-copy-asks`), which never writes into a folder that is there, and turns the first run off once that copy is written, so the copy, once open, starts the first run at Demo. While the copy can't be written, the first run shall stay as it was." A new example covers a copy that can't be written.
- `workspace.fresh-copy-asks`: a sentence is added. An ask may come with a way to be told the copy is there; it is told once the copy is written or found already there (`created` or `existing`), before the copy opens, never while it can't be written, and at most once however often **Try again** is pressed. An ask made while a copy is being written waits for that copy. Three new examples cover these.

The test "turns the first run off and asks for a fresh copy on Start over" in `first-run-help.test.ts` is replaced by one that checks the stronger promise: Start over asks for the copy, leaves the first run as it was, and turns it off once the copy is written. New tests cover a copy that can't be written (the first run stays on at its step), the copy starting the first run at Demo, the asker told before the copy opens for `created` and `existing`, never told when the copy fails, and told once after two failures and a **Try again** that works. No test was weakened or skipped.

## Why

Liam's review of #4348 (HAL-13433) found that Start over turned the first run off before the copy was made. When the copy then failed, the first run stayed off in the old folder, with no bar and no guide card. The reset can't simply wait until the copy opens, because a demo that opens starts the first run only from off, so it now lands after the copy is written and before it opens.

## Left as it is

If the copy is written but opening it fails, the first run is already off. The copy is then in Recent, and opening it from there starts the first run, so nobody is stuck; **Show the guide** works too.

## Covers

- first-run.help
- workspace.fresh-copy-asks
