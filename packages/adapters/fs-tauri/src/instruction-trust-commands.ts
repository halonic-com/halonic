/**
 * The shell's commands for the instructions a person trusted for an agent
 * (`InstructionTrustStore`). The shell keeps the records in the profile's
 * `instruction-trust` folder, laid out as `FileInstructionTrustStore` in
 * `fs-node` lays it out, so the CLI and the desktop app read and write the
 * same records.
 */
export const instructionTrustCommands = {
  /** `{ key }` → the record, or `null` when there is none. */
  get: "instruction_trust_get",
  /**
   * `{ record }` → nothing. The shell saves the record only after it asked
   * the person itself, in a native dialog that names the agent and the files
   * added, removed and changed since the pin they trusted before. The page
   * can't answer for them. The shell refuses with `declined` when they say no.
   */
  save: "instruction_trust_save",
  /** `{ key }` → nothing; also when there is no record, and also for a record that can't be read. */
  remove: "instruction_trust_remove",
} as const;
