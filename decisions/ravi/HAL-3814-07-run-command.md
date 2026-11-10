# Decision: golden files for `halonic run`

- Requirement: `cli.run` (`apps/cli/requirements/run.md`)
- Task: HAL-3814; plan for `halonic run`, PR D, approved by the maintainer on HAL-3895
- Approval: the maintainer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zgYFPR8PC3SisO3L9oZNYZNDVzRkvOeUuSM11GA6QUOdU9gPXGye7n38cNhTbzFQoh+gdTdZJyQfS6FhUuOiAg==

`halonic run` is a new command, so it brings its own golden files, written from a run of the
Acme example on the test model with a fixed clock and fixed ids. Each file holds the command's
output in the three modes the CLI checklist asks for: colour, `NO_COLOR` and `--json`.

- `support-reply-waiting.txt`: Support reply on Sam's email, waiting at Approve this reply?,
  with the waiting lines of cli-output 3.4. The hint under the waiting line names only
  Studio's Inbox, as `halonic runs show` writes it until `halonic runs send` lands (HAL-4182).
- `support-reply-approved.txt`: the same run with `--event approve`, ending with the receipt
  ("Sent nothing · asked you once") and the run log command.

No existing golden file or test was changed or removed.

## Covers

- apps/cli/src/commands/run/golden/support-reply-waiting.txt
- apps/cli/src/commands/run/golden/support-reply-approved.txt
