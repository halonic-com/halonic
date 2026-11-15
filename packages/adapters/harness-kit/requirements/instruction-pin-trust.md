# harness-kit.instruction-pin-trust

- Status: active
- Since: 0.1.0
- Source: HAL-3106 slice 3b; Liam's review notes on HAL-10231

A pin made by `pinInstructions` shall be one that every `InstructionTrustStore` adapter (memory and file) saves and reads back unchanged, and that `isInstructionTrustFor` accepts, also for a set with no files.

## Examples

- Given a pin from `pinInstructions` for an `AGENTS.md` and one skill,
  when the memory store and the file store each save and read it,
  then each gives back the same pin, and `isInstructionTrustFor` accepts the record.
- Given a pin from `pinInstructions` with no files,
  when it is saved in either store,
  then `isInstructionTrustFor` accepts what is read back.
