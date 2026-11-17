# Decision: the Changes list is one row for each item, on the kit List

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11333 (item 8 of the UX check, Part C, HAL-10839: one row per item, one Tab stop with ↑ ↓, focus after Undo)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fQWTHgbH2PWh+vBDAv8I8uqo/ejoUFZlhemK/Js8IBTuzoPLIw/ZP8EzZExUzL+ZiTHTParrrdgFEhdGxMkSCg==

The Changes page lists one row for each item (icon, name, one sentence, no path) on the kit List: one
Tab stop, ↑ ↓, and Enter opens the item, where Undo this change and Undo these changes stay. After Undo
these changes focus moves to the row that took its place, else the heading. `source-control.change-list`
says so in place of "list the changed files". Undo, the toasts and the unavailable reasons are as they
were, and no test was weakened: the tests that looked at a file's section now open the item's row first.

## Covers

- source-control.change-list
