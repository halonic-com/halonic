# Decision: tool files and snapshots refuse invisible characters, built-in names and oversized text

- Requirement: `format.tool-refusals` (`packages/core/format/requirements/tool-refusals.md`), `format.workspace-snapshot` (`packages/core/format/requirements/workspace-snapshot.md`)
- Task: HAL-18049; the security findings on #5827 (HAL-17962), ported onto the format merged in #5829 (HAL-17948)
- Approval: Liam approves this note in review
- Kind: internal

## What changes

Both requirements gain refusals; none is removed or weakened, and no test or example is dropped.

- The shared hidden-mark rule (`shared/shown-text.ts`) also refuses format characters (`\p{Cf}`:
  U+200B and the other zero-width characters, U+FEFF, the tag characters U+E0000–E007F) and the
  line and paragraph separators U+2028 and U+2029. It applies to tool descriptions, parameter
  choices and named callers, and to plugin names and labels, which use the same rule.
- A tool parameter named like a member every object has (`constructor`, `toString`,
  `hasOwnProperty`, …) is refused.
- A tool file over 64 KiB is refused with `file-too-large` before it is parsed (a new optional
  `maxBytes` on a file kind). `readSnapshotText` refuses snapshot text over 4 MiB with
  `snapshot-too-large`, and text that isn't JSON with `snapshot-not-json`, before parsing further.

## Why

Agents read tool text that people check. Text one sees and the other doesn't, such as instructions
in tag characters, must not pass; this was the blocking finding in Liam's review of #5827. A
parameter name such as `constructor` would make a later "is this a declared parameter" test true
for every call. The size caps keep a hostile file or snapshot from costing a parse of any size.
Both requirements are unreleased, so no released behaviour changes for tools; plugin labels
holding such characters were never meant to pass.
