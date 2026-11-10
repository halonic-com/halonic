# halonic-connect

Checks the address the Android app connects to and reads the computer's hello answer (flow-install-update 5.3 and 5.4). Plain Rust with no Tauri types; the shell's `connect` command wraps it.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, for example `connect_check_` for `connect-check`.

## Spec and fixtures

`spec/` holds the JSON Schema of the two messages that cross the boundary: the computer's hello answer and the shell's `ConnectResult`. They are generated from `apps/studio/src/connect/protocol.ts`; run `SPEC_WRITE=1 pnpm exec vitest run src/connect/protocol.test.ts` in `apps/studio` after changing a schema. `fixtures/<message>/{valid,invalid}/` holds example messages. TypeScript checks them against the spec; Rust reads the hello answers with `read_hello` and compares the serialised `ConnectResult` values with the valid ones (`src/fixtures.rs`).
