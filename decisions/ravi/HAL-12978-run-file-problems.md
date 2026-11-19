# Decision: run and test refuse file problems before they look the workflow up

- Approval: Liam reviews this on HAL-12978
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Cx78UtwEZvj/277BSFI66DGxFVPldpDBTu1+Gt+Jxm6/kEa32Zn4DxreXEUP8JkXcs6MYMzvWct2Y5oy18v8Bg==

`halonic run` said a workflow didn't exist when its own file had an error, because it looked the workflow up
before the file-problem check, and `halonic test` failed every test instead. Both now refuse right after
loading with the file-problem lines (`<Workspace> has N problem(s) in its files. Nothing ran.` / `See them
with: halonic validate …`) and exit 2, as `runs send` already does. This note covers the edits to the active
requirement `cli.workspace-file-problems` that add `test` and the order of the check, and the move of
its three `run` tests from `run/command.test.ts` to `run/file-problems.test.ts`, which keeps that file
under the 500-line limit.

## Covers

- cli.workspace-file-problems
- apps/cli/src/commands/run/command.test.ts
