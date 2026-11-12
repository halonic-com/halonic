# Decision: each workspace keeps its records in `records`, beside `runs` and `blobs`

- Requirement: `profile.workspace-folders` (`packages/core/profile/requirements/workspace-folders.md`)
- Task: HAL-3298, part 1; the decision is C254 on HAL-3295
- Approval: HAL-3295 decided it and HAL-3298 asks for this change; Liam approves it in review
- Kind: internal

## What changes

The requirement gains one folder: a workspace's records (agent notes and collections) go in
`records` inside its folder in the profile, and one example says so. `workspaceFolders(...)` gets
`recordsFolder()`. Nothing else in the requirement changes.

## Why

The only `RecordStore` on `main` keeps records in memory, so agent notes and collection records are
lost on restart. C254 puts them per workspace in the profile, next to the runs: two workspaces with
an agent `clerk` never share notes, and a moved folder loses its records as it loses its runs
(C234). A person's connection data stays in a separate profile-level store.

## Tests

No test was weakened or removed. One test was added for the records folder, on Linux and Windows.

## Covers

- profile.workspace-folders
