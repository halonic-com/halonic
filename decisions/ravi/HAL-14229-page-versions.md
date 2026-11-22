# Decision: the page reads the live version, and its routines come from it

- Approval: the plan for this change is approved on HAL-14229 (Liam's comment of 22 Nov, Q1 to Q3 and conditions); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qRFZ7PJEc2QDBe/AofD8ZeHtqKGRoR+/1R8a4Shgt3CScT/IZXRMxFcm8cNmwfYi5kZmRdXDOFvLVLYsDQG5Dg==
- Task: HAL-14229

## What changes

The new requirement `studio.page-versions` reads the open workspace's live version through the shell's
`git` command: whether the folder is a repository, its latest commit, and that commit's regular files
(`ls-tree` modes `100644` and `100755`, as the CLI's `GitVcs`). A folder with no `.git`, or one inside a
larger repository, has history off. With a `.git` and no git, the read fails as `unavailable` and never
falls back to the saved files.

`studio.engine-routines` changes from "the routines are read from the saved files" to the CLI's rule
(`app.scheduler-live-routines`, `app.scheduler-never-live-not-scheduled`): each routine's trigger, target,
input and rules come from the live version, so a routine that has never been live isn't scheduled; On and
Off still come from the saved files. With history off, nothing changes.

## Why

In the Studio, a saved routine change counted before it was made live, which the CLI never does
(HAL-14229). The "no git" case follows the CLI's `openGitHistory`, so a person without git keeps Run in a
workspace with history off.

## Covers

- studio.engine-routines
- studio.page-versions
