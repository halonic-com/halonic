# Decision: workspace connectors start in the sandbox session

- Approval: Paperclip task HAL-2310 (D45, board on HAL-2257 Q3; decided by Liam on HAL-2303); Liam approves this note in review
- Kind: internal

Parts 3a and 3b of HAL-2310 (halonic#2074) start a workspace's `stdio` connector in the agent sandbox
session, with its own working folder, its own secrets and only the sites it names. Two changes need a note:

- `packages/core/format/spec/connector.schema.json`: the golden schema shows `maxItems: 50` on `sites`,
  so editors show the cap the format already enforces (Liam's nit on halonic#2067). No rule changes.
- `workspace-connector-place.test.ts` skips one test on Windows (`it.skipIf`): it makes a program with
  the execute bit on its `PATH`, which Windows has no equivalent of. The same refusal is tested on
  Windows through the program's path and arguments in the neighbouring tests.

Nothing is removed and no test is weakened.

## Covers

- packages/core/format/spec/connector.schema.json
- packages/adapters/connector-stdio-sandbox/src/workspace-connector-place.test.ts
