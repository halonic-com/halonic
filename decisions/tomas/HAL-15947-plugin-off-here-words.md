# Decision: a plugin that is off for the sandbox tells one story, and a refusal shows its fingerprint once

- Approval: the task HAL-15947 asks for this change, from flow check C656 #3 and #6 (HAL-15937). The team decides under the HAL-2282 rule: the words are the ones `plugin list` and `run` already use for the same facts, and Liam signs this note in review.
- Kind: user-visible

## What changes

- `cli.open-plugin-backend`: the opener checks that the runner is built only once the start gate allows a start. Where the sandbox can't start and nobody allowed plugin code to run without it, the call now fails with the gate's reason, not "the integration runner isn't built". One example is added. A runner that isn't built still refuses, with the same words, wherever the gate allows a start.
- `app.plugin-connector`: a backend refused by an `Error` named `PluginBackendNotFencedError` with a reason it knows is reported as `sandbox-unavailable` with that reason, instead of `failed`. The engine's `connector.part-off` event keeps its codes; only this case moves from `failed` to `sandbox-unavailable`.
- `cli.plugin-local-tools`: `halonic run` words such a backend as `plugin list` words its reason ("Halonic is running inside a container, and the sandbox can't start there. Run Halonic on the computer itself, not in a container."), then "See why with halonic doctor.", in place of the error's own text.
- `cli.commands.plugin.off-here`: without a terminal, the command after a plugin that stays off here reads "Read the list above. To trust it anyway, run: halonic trust --plugin … --yes --fingerprint …" in place of "Read the list above, then run: …". The example's words are added.
- `cli.not-trusted`: when stdout is a terminal outside CI and the trust check or the fix line already shows the fingerprint, the bare fingerprint line on stdout is left out. A pipe, a file, `CI` and `--json` keep it exactly as before. One example is added.

## Why

C656 #3: in a container, `plugin add` ended with the command to trust the plugin, `plugin list` said it was off for the sandbox, and `run` said "the integration runner isn't built". The runner line is real only in a source checkout before `pnpm build`, but it hid the cause that would still stop the backend after a build: the sandbox. Checking the gate first makes `run` give that cause, in the words the other two commands use, and `doctor` checks the sandbox. Iris asked for the `doctor` pointer. The desktop app line of `plugin list` isn't repeated: `run` knows the plugin's id, not the name Settings shows. `plugin add` keeps the command, which a script needs, but no longer reads as the step that turns the plugin on; the warning above it already says trusting won't.

C656 #6: a refused `run` or `routines watch` showed the fingerprint in the trust check, then again as a bare last line. That line is for scripts (`tail -n1`), so it stays wherever a script may read stdout: a pipe, a file or CI. At a terminal, a person already read it once. When the lines above don't show it, the bare line stays, so the fingerprint is never lost.

What a run may do doesn't change: the same gate refuses the same starts, nothing runs without the sandbox, and no key or setting moves.

## Tests

No test was weakened or skipped.

- `open-plugin-backend.test.ts`: a new test with no sandbox and no runner expects the sandbox's reason and the backend reported as `sandbox-unavailable`. It fails on `main`, where the runner line comes first.
- `plugin-connector.test.ts`: a new test reads the error by name, and a reason it doesn't know as `failed`.
- `plugin-connector-factory.test.ts`: a new test for the backend's lines.
- `off-here.test.ts`: the no-terminal test expects the new command line.
- `not-trusted.test.ts`: a new test leaves the bare line out at a terminal when the check shows the fingerprint, and keeps it when it doesn't. The existing piped tests are unchanged, and `trust/plugin.test.ts` still expects the bare line in a terminal with `CI` set.
- `style.test.ts`: three expectations of `decideStyle`'s whole result gain the new `person` field.

## Covers

- cli.open-plugin-backend
- app.plugin-connector
- cli.plugin-local-tools
- cli.commands.plugin.off-here
- cli.not-trusted
