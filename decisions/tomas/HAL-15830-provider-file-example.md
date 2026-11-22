# Decision: validate links a provider file's example, and a hub's alias on an unknown provider reads as one in models.yaml

- Approval: the task HAL-15830 asks for this change, from flow check C638 #4 and #6 (HAL-15825). The team decides it under the HAL-2282 rule, since it adds one line to an approved command's output and rewords a message that is already there. Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:sM1LcbwAzP1yvghv7WInnR7x9b/ZwAFF6UdjhSZfDjTCvmeLkmk/yr4XIMlqoA/0gTQ5gHEYyWTlZnXgCAjvBQ==

## What changes

- `cli.commands.validate.check-workspace`: when a shown problem says to add a file in `providers/` (code `unknown-provider` without a near provider, from `models.yaml`, a `hub.yaml` or a `provider/model` setting), `halonic validate` says once, above the summary, "What goes in a provider file, with an example: https://docs.halonic.dev/reference/provider/#example". A near provider's "Did you mean mock?" asks for no file, so it gets no line. `--json` doesn't change. One example is added.
- `workspace.references`: a hub's alias on a provider no file names now gets the same message as one in `models.yaml`: `Alias careful uses unknown provider mok. Did you mean mock?`, or `Alias smart uses unknown provider anthropic. Add providers/anthropic.yaml, or point the alias smart at a provider the workspace has.`, in place of `Alias "careful" uses unknown provider "mok": Did you mean mock?` and `…: add providers/anthropic.yaml, or use a provider the workspace has`. The code stays `unknown-provider`. The old loader had no hub alias check, so no parity case or allowed difference changes.

## Why

No guide under `docs/` in this repo shows a provider file and no command writes one, so a CLI user told to "Add providers/cloud.yaml" had to copy `providers/mock.yaml` and guess its fields. The docs site's provider reference has the fields and an example; the link goes once under the problems, not into every message, so the messages stay the same in Studio and in `--json`. The hub alias kept the old form after HAL-15709 changed `models.yaml`'s, so one check read two ways.

## Tests

No test was weakened or skipped. `command.test.ts` adds a test for the line and for its absence with a near provider. `model-providers.test.ts` checks a hub alias's new message, near and not near.

## Covers

- cli.commands.validate.check-workspace
- workspace.references
