# app.agent-placement

- Status: active
- Since: 0.1.0
- Source: plan v1.17 (the per-machine "this computer" choice in `core/app`); stack 3b of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), approved with changes by Liam on HAL-1967 (the fingerprint is SHA-256 over the agent file's raw bytes); Julian's condition on HAL-1709 (a changed agent file cancels the choice)

The app shall say where an agent's harness runs: on this computer only when the `AgentPlacementStore` holds a choice for that workspace and agent whose `agentFingerprint` is the fingerprint of the agent's file now, and in a sandbox otherwise. The fingerprint shall be `sha256:` and the SHA-256, in hex, of the file's raw bytes, taken through the `Digest` port. A sandbox answer shall say why: no choice, a choice for another version of the file, or a choice that can't be read, which also gives the store's error to the host.

The app shall save a person's "this computer" choice only with the fingerprint the person was shown, and only when it is the fingerprint of the file now; otherwise it shall save nothing and give the current fingerprint. It shall save only the key, the fingerprint and the time from the clock, never the file. Putting an agent back in a sandbox shall remove its choice, even one that can't be read. The side the engine gets shall have no way to make a choice.

## Examples

- Given no choice for the agent `coder`,
  when where it runs is asked,
  then it runs in a sandbox, with the reason `not-chosen`.
- Given a person chose "this computer" for `coder` at 10:00 with the fingerprint they were shown,
  when where it runs is asked with the same file,
  then it runs on this computer, and the store holds the fingerprint and `chosenAt` 10:00; for another agent or workspace, it runs in a sandbox.
- Given that choice and a pull that changed `coder`'s file, even only its whitespace,
  when where it runs is asked,
  then it runs in a sandbox, with the reason `file-changed`, until the person chooses again for the new file.
- Given a person was shown one fingerprint and the file changed before they chose,
  when the choice is saved,
  then it's refused with `fingerprint-changed` and the new fingerprint, and nothing is saved.
- Given a choice whose record can't be read,
  when where it runs is asked,
  then it runs in a sandbox, with the reason `unreadable` and the store's error; putting it back in a sandbox removes the record.
