# fs-tauri.instruction-trust-commands

- Status: draft
- Since: unreleased
- Source: HAL-15411 (the `io` and no-answer words, as HAL-15205 and HAL-15684 for the folder trust store), HAL-10513 (follow-up to HAL-3106); `InstructionTrustStore` port v1

The Tauri instruction trust store shall implement `InstructionTrustStore` by calling the shell's `instruction_trust_get`, `instruction_trust_save` and `instruction_trust_remove` commands, sending only the key's `location` and `agent`, or the record's four fields, and shall never trust an instruction pin itself: the shell alone asks the person. When the shell refuses a save because the person said no, `save` shall reject with a `denied` error, and when it is already asking, with a `conflict` error. When the shell refuses a record as `unreadable`, or answers with a record that isn't exactly trusted instructions for the key asked, `get` shall throw an error naming the agent and its workspace, never return `null` and never return the record. An `io` refusal shall reject with an `unavailable` error that says "Halonic can't write to its data folder." for a save or a remove and "Halonic can't read its data folder." for a `get`, and keeps the shell's message only in its `details`. A rejection that isn't the shell's refusal shape, such as a page without the capability, shall reject with an `internal` error that says "Halonic ran into a problem it can't explain yet." and keeps "The desktop shell gave no answer to the instruction trust call." and the rejection's text only in its `details`. The adapter shall pass the `contracts.instruction-trust-store` suite.

## Examples

- Given the person says no when the shell asks,
  when trusted instructions are saved,
  then `save` rejects with a `denied` error and `get` still answers `null`.
- Given the shell answers `get` for `coder` with `writer`'s record,
  when `coder`'s record is read,
  then it throws naming `coder` and its workspace.
- Given the served Studio, which has no capability for these commands,
  when any method is called,
  then it rejects with an `internal` error that says "Halonic ran into a problem it can't explain yet." and holds the shell's text only in its `details`.
- Given the shell can't write the profile's `instruction-trust` folder,
  when trusted instructions are saved,
  then `save` rejects with an `unavailable` error that says "Halonic can't write to its data folder.", with the shell's OS error only in its `details`.
