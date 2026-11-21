# Decision: the doctor's Node checks move to `packages/adapters/doctor-node`

- Approval: [HAL-13407](/HAL/issues/HAL-13407), Liam's plan (two pull requests, this one a move)
- Kind: internal

The doctor's machine checks that need Node (command paths, the network, the
workspace, local model servers, the Studio watch limit) move out of the CLI into
the new adapter package `packages/adapters/doctor-node`, so the agent host can
run the same checks for Studio in the next pull request. Nothing changes in
behaviour: `doctor --dir examples/acme` prints the same output as on `main`, and
the `doctor` command's own tests are untouched.

The guard sees the moved test files as deleted. They live on unchanged under
`packages/adapters/doctor-node/src/` (only `studio-watch-limit.test.ts` changes
an import path). Six of the seven tests in `apps/cli/src/doctor-machine.test.ts`
moved with the code to `packages/adapters/doctor-node/src/doctor-machine.test.ts`;
the one that stays checks that `nodeDoctorMachine` still names this
computer's system and its harnesses.

## Covers

- apps/cli/src/command-paths.test.ts
- apps/cli/src/doctor-network.test.ts
- apps/cli/src/doctor-workspace.test.ts
- apps/cli/src/local-model-servers.test.ts
- apps/cli/src/studio-watch-limit.test.ts
- apps/cli/src/doctor-machine.test.ts
