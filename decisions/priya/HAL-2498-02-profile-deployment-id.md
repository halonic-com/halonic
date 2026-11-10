# Decision: the profile caps deployment ids at 64 characters, as deployments.yaml does

- Requirement: `profile.workspace-folders` (`packages/core/profile/requirements/workspace-folders.md`)
- Task: HAL-2498, part 2; part 1 is #740 and `decisions/priya/HAL-2498-01-deployment-id-rule.md`
- Approval: [HAL-2498](/HAL/issues/HAL-2498) asks for this change; Liam approves it in review
- Kind: internal

## What changes

`workspaceFolders(...).runsFolder(id)` refuses a deployment id over 64 characters, where it used to
allow up to 128. Its other rules (characters, Windows device names) don't change. The `RangeError`
message says 64 and now also names the device-name rule.

## Why

#740 made `deployments.yaml` refuse ids over 64 characters and Windows device names, so its runs
folder's path stays under Windows' 260-character limit. The profile now refuses exactly the same
ids. No id between 65 and 128 characters can come from a valid `deployments.yaml` any more, and
nothing calls `runsFolder` yet, so no one sees the change.

The format keeps its own rule, because it is also its JSON Schema, and the profile can't use the
format (it comes earlier in the core order). A new test in the format,
`src/kinds/deployments/runs-folder.test.ts`, checks that both accept the same ids, at each edge of
both rules.

## Tests

No test was weakened or removed. The profile's refused 129-character id became a 65-character one,
and tests were added for ids the profile accepts (64 characters, `com10`, `console`).

## Covers

- profile.workspace-folders
