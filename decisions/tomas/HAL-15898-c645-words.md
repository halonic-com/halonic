# Decision: local-only's plugin fix covers a plugin that can't be read, and the plugins folder is read by your user account

- Approval: the task HAL-15898 asks for this change, from words check C645 (HAL-15886). The team decides it under the HAL-2282 rule, since it rewords messages that are already there. Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xUO2TCKPvFrlhx7Uj4LKhxGRjvHl0UnZe43vz+Du5/XWYB41Stuhv79EdioJ3FovtutAKyUF0tEcOGpAtO0nCw==

## What changes

- `workspace.local-only-sheet-hosts`: in a local-only workspace, a `plugin` connector whose plugin isn't among the hosts given still gets the `local-only-connector` error, but the message ends with "add it, or fix what halonic plugin list says about it, then Halonic can tell whether it's local" instead of "add the plugin first, then Halonic can tell whether it's local". The requirement's text and its example for a plugin that isn't added change to the new message. Which connectors count as local, and what `halonic run` refuses, don't change.
- `cli.plugins-folder-unreadable`: the refusal says "The plugins folder <folder> can't be read by your user account." instead of "… can't be read by you.". The requirement's text and its example change to match. The fix lines, the exit code and `doctor`'s Plugins line don't change.

## Why

C645 row 55: one message covers a plugin that isn't added and one that is added but can't be read, and "add the plugin first" can't help the second. For a plugin that isn't added, the `plugin-not-added` warning under the error still gives the add command. Row 57: Halonic is the one reading the folder, and the Windows fix names the same account; the secrets file's message gets the same words on HAL-15771 (L108, C625-48), so both match.

## Tests

No test was weakened or skipped. `local-only.test.ts`, `plugins-folder-reader.test.ts` and `list-folder-unreadable.test.ts` expect the new words; every assertion stays.

## Covers

- workspace.local-only-sheet-hosts
- cli.plugins-folder-unreadable
