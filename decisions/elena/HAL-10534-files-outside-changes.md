# Decision: a save pauses for a changed file only, and outside changes can be taken in

- Approval: HAL-10832
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xFQBtAH79jjv4YcW21HaDQ6RGytnNnAjVivHbttmJyEG8xOdsuKbEEynoMPw34FCj5oC3e5NYig6fstK8IeSCw==

## What changes

`app.workspace-save-unchanged` and `app.workspace-delete-to-trash`: a file that changed outside
Halonic no longer stops the whole save. The save leaves that file alone, writes the others, and then
ends with the same `ChangedOnDiskError`, which now lists every held file. No example was removed or
weakened; one example is added. This is what `files.editor.changed-on-disk` (example 6) asks for:
"saving pauses for this file only".

A new requirement, `app.workspace-reload-outside`, adds `WorkspaceFiles.reloadFromOutside(paths)`, so
Files can take in what the store's watch reports as one undo step.

## Why

With the old behaviour, one held file stopped every file after it in the loop from being saved.

## Covers

- app.workspace-save-unchanged
- app.workspace-delete-to-trash
- packages/core/app/src/workspace-files.test.ts
