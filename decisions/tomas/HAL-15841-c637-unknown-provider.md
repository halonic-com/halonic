# Decision: validate says an unknown provider in the run's words

- Approval: the task HAL-15841 asks for this change, from words check C637 (HAL-15824). The team decides it under the HAL-2282 rule, since it rewords a message that is already there. Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ypWOf7A7FNOvvvaTdjc/jrZrstR1sRkdP8hfTX0W5sk5RS9n1qVwoxaVglsSOKJ49z1mVrlR3USDXOXtnqiOCg==

## What changes

- `workspace.references`: an alias in `models.yaml` on a provider no file names now gets `The model alias smart names the provider cloud, which the workspace doesn't have. Add providers/cloud.yaml, or point the model alias smart at a provider the workspace has.` instead of `Alias smart uses unknown provider cloud. Add providers/cloud.yaml, or point the alias smart at a provider the workspace has.`. With a near provider it is `The model alias careful names the provider mok, which the workspace doesn't have. Did you mean mock?`. The code stays `unknown-provider`.
- An alias in a `hub.yaml` on a provider no file names gets the same message, from the same function (shared since HAL-15830), instead of `Alias careful uses unknown provider mok. Did you mean mock?` and `Alias smart uses unknown provider anthropic. Add providers/anthropic.yaml, or point the alias smart at a provider the workspace has.`. The requirement says so, and its examples quote the new words.
- `cli.commands.validate.check-workspace`: its example of `halonic validate` on an alias on `cloud` quotes the new words. The line that links the provider file's example (HAL-15830) still shows, since the message still says to add a file in `providers/`.
- `packages/testing/parity/allowed-differences.json`: the entry `unknown-provider-says-the-fix` gets the new message and a line in its why (`signed-off` by Liam in review). The recorded fixtures are the old loader's output and stay as they are.

## Why

C637: a run that stops for the same cause says "the model alias smart names the provider cloud, which the workspace doesn't have." and "…point the model alias smart at a provider the workspace has." (`apps/cli/src/messages/run-failures.ts`). "Unknown provider" is the code's name, not a sentence. One cause gets one sentence, wherever the alias is written.

## Tests

No test was weakened or skipped. The tests in `model-providers.test.ts` and `references.test.ts` check the new words at the same file, key path and line. One assertion that a provider which is there gets no error looked for "unknown provider"; the assertion next to it already looks for "the workspace doesn't have", which now covers both checks, so the first one was removed.

## Covers

- cli.commands.validate.check-workspace
- packages/testing/parity/allowed-differences.json
- workspace.references
