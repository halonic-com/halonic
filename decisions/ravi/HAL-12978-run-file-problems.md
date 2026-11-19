# Decision: run and test refuse file problems before they look the workflow up

- Approval: Liam reviews this on HAL-12978
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:rx60Gh+N+8EsrDQMrZmTMhiTXaKkQj46o6dk4UZ2aB7Cvk09k8Q4Tw9ibF5paGGGnlNrJg0huIK82j0O50J5DQ==

`halonic run` said a workflow didn't exist when its own file had an error, because it looked the workflow up
before the file-problem check, and `halonic test` failed every test instead. Both now refuse right after
loading with the file-problem lines (`<Workspace> has N problem(s) in its files. Nothing ran.` / `See them
with: halonic validate …`) and exit 2, as `runs send` already does. This note covers the edits to the active
requirement `cli.workspace-file-problems` that add `test` and the order of the check.

## Covers

- cli.workspace-file-problems
