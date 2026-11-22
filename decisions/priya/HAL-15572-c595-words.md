# Decision: C595 wording on Settings, a connector's secrets and a dragged arrow

- Task: HAL-15572
- Approval: words check C595 (HAL-15567, rows 1, 25 and 32) and C604 (HAL-15629, rows 6 and 10), team decisions on approved screens under HAL-2282; Noah's answer on the connect port (HAL-15581); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:NY1TQe3MNUutolKobi4zVqBSMrNw/GA+svfQG38b4uZiSp3qeufjtCGnYH92iHtOOztpX+s57ecXpmeKCDE6DA==

## What changes

- `settings.new-agents-run`: the hint's second line reads "Studio can't start agents outside the sandbox yet; halonic run and halonic serve on this computer can." in place of "Studio can't start agents this way; …". Under a Select that shows **In a sandbox (recommended)**, "this way" read as the sandbox, the opposite of what it meant. The Harness page keeps its own line, which sits under **On this computer**.
- `library.connector-secrets`: the line under each secret ends "Studio uses this one; halonic secret set keeps a separate one for the command line." in place of "It's Studio's own: halonic secret set doesn't reach it.", so someone who just ran `halonic secret set` learns which one Studio uses.
- `workflows.canvas.drag-to-connect`: an arrow added by a drag is announced as the step card's **Add** announces it, with the steps named as their cards name them and the never-taken sentence when an earlier arrow always matches first. The port is drawn muted at rest and takes the accent colour under the pointer and while dragging from it (HAL-15581).

Nothing is removed or weakened. The examples and tests are updated to the new words, and the drag requirement gains examples for the names and the never-taken sentence.

## Covers

- settings.new-agents-run
- library.connector-secrets
- workflows.canvas.drag-to-connect
