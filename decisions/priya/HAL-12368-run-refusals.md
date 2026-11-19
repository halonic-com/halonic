# Decision: a skill-folder delete refusal says what to do instead, with no Try again

- Task: HAL-12368
- Approval: the team's call on HAL-12368 (small wording on an approved screen, HAL-2282), from Sofia's UX check L6 on HAL-12363 and microcopy revision 109 on HAL-751; Liam reviews and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FLrpegtV8yccNp1JOqzi9xipq5KEvbpt4EROrh5EZ4B1nwf9Ed7dgCkEtOQTpK81biM8lKJV3Yg6jhrlrSjGDw==

## What changes

`studio.workspace-files-delete`: refusing a `SKILL.md` whose folder has other files is now
`unavailable` and carries a next step. The host says "Studio can't delete a skill that has other
files in its folder yet." and "To delete *skill*, delete the folder *path* in File Explorer."
It still refuses the same deletes as before; only the words and the kind of refusal change.

`files.ui.delete-file`: when the host's refusal names a next step, the toast that stays has the
host's sentence as its title and the step as its second line, with no **Try again**. Every other
refusal keeps "Couldn't move *full path* to the trash: *reason*." with **Try again**. The example
for the old skill-folder words moves to a refusal that still offers Try again ("a.md isn't here
any more."), and a new example covers the skill folder.

## Why

Trying the same delete again can never work, so **Try again** was a dead end.
The new toast tells the person how to delete the folder themselves.

## Covers

- `studio.workspace-files-delete`
- `files.ui.delete-file`
