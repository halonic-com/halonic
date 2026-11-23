# Decision: three CLI tests move with their code into `targets/node/harness`

- Approval: HAL-17003 (PR (e) of HAL-14217, Liam's option B); Liam approves this note in review
- Kind: internal

The Node harness wiring moves from `apps/cli/src` into `@halonicjs/target-node-harness`, with only its imports changed. The unit tests of the moved files go with them, unchanged apart from their imports, so they keep testing the same code:

- `apps/cli/src/fenced-sandbox.test.ts` → `packages/targets/node/harness/src/fenced-sandbox.test.ts`
- `apps/cli/src/local-bridge-servers.test.ts` → `packages/targets/node/harness/src/local-bridge-servers.test.ts`
- `apps/cli/src/sandbox-journals.test.ts` → `packages/targets/node/harness/src/sandbox-journals.test.ts`

The same tests run, with the same `expect` calls, in the new package. `sandbox-journals.test.ts` keeps the `.skipIf` it had in the CLI; the guard sees it as new only because the file has a new path. The CLI's harness-host tests that drive the whole engine through `test/local-harness-host-kit.ts` stay in the CLI and import from the new package.

## Covers

- apps/cli/src/fenced-sandbox.test.ts
- apps/cli/src/local-bridge-servers.test.ts
- apps/cli/src/sandbox-journals.test.ts
- packages/targets/node/harness/src/fenced-sandbox.test.ts
- packages/targets/node/harness/src/local-bridge-servers.test.ts
- packages/targets/node/harness/src/sandbox-journals.test.ts
- cli.bridge-compatible-own-ports
- cli.sandbox-kept-grants
