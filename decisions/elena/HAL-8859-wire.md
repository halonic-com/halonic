# Decision: New workspace opens a folder that is already there, after the shell's trust question

- Approval: Liam in the review of #2646 (HAL-9231); the dialog's **Create here** and **Open it** are part of the approved screen, so describing the shell step they waited for is a team decision under HAL-2282
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM://PhhGaQ92vEtA2VoCYNMWq+c88ItD4zC/P+IEpAv3Zp7I4E1bWsYeFUY4pKZGokUckbxfHTn1iKRoCcEdMCCQ==
- Task: HAL-8859

## What changes

`studio.new-workspace` drops its "Not yet" paragraph. It now says that a folder that is already
there is read by name only and opened only after the shell asks the person to trust it.
**Open it** opens a workspace through that question. **Create here** adds the missing files after it
and opens the folder untrusted, because Halonic didn't write everything it holds. If the person
says no, nothing is written. No example is removed.

## Why

The requirement said the dialog's **Create here** and **Open it** waited for a shell command that
adopts a folder that is already there (HAL-8714). HAL-8859 adds that command and wires the dialog
to it, so the requirement now describes what the app does.

## Covers

- studio.new-workspace
