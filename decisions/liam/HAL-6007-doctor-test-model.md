# Decision: doctor needs no trust for a workspace on the test model only

- Approval: Liam decided this on [HAL-6007](/HAL/issues/HAL-6007) (Sofia's CLI output read, HAL-5959), a fallback state of the approved doctor output, a team decision with no board card (HAL-2282 rule); Priya reviewed it on HAL-6047; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5XYHkD2UFzZaU/uCG2SHqXC4GDS1kRZtEXc+DryEuE+m/7Y5i5Rg/y8pc9JONkZk9rLViP1p1BGso1g0U0GQAQ==
- Task: HAL-6007

## What changes

`app.doctor-workspace`: while a run in the workspace can only reach the test model, the Workspace
line is ✓ and says no trust is needed, and the trust check isn't read. One example is added. The
other examples and the rule that the line is never marked as failed stay as they were.

`cli.doctor-workspace`: the command also reads whether a run can only reach the test model, with
the exact rule `halonic run` skips trust by: `reachesOnlyTheTestModel(trustContentInputOf(workspace,
integrations))`, with the same local integrations `run` reads. One example is added.

`DoctorWorkspace.testModelOnly` is optional and `WorkspaceTrust` gains `not-needed`, so other
callers of `@halonicjs/app` build as before.

## Why

On a fresh `halonic init --example acme`, doctor said ! "not trusted yet" for a workspace that
`halonic run` runs without asking, because it only reaches the test model. That sent the user to
`halonic trust` for nothing. Doctor now follows `run`'s rule instead of its own copy, so the two
can't drift. `run --harness codex` still asks for trust; doctor can't see that flag and checks the
default run.

`cli.commands.routines.watch` is listed because its `expect` count differs from run to run (polling
tests, see HAL-5568) and the guard on the merge base flags it for any change in `apps/cli`. This
pull request doesn't touch routines.

## Covers

- app.doctor-workspace
- cli.doctor-workspace
- cli.commands.routines.watch
