# Decision: validate says an unknown provider in the run's words

- Approval: the task HAL-15841 asks for this change, from words check C637 (HAL-15824). The team decides it under the HAL-2282 rule, since it rewords a message that is already there. Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:En+e9eWYkAimMFu0xsdR24Vmv0w1ORpffr3XLFNdw8LBK00kGTtiCcLuTGZUwjFhO4MT9o1brXwg/ZsoSoLTDg==

## What changes

- `workspace.references`: an alias in `models.yaml` on a provider no file names now gets `The model alias smart names the provider cloud, which the workspace doesn't have. Add providers/cloud.yaml, or point the model alias smart at a provider the workspace has.` instead of `Alias smart uses unknown provider cloud. Add providers/cloud.yaml, or point the alias smart at a provider the workspace has.`. With a near provider it is `The model alias careful names the provider mok, which the workspace doesn't have. Did you mean mock?`. The code stays `unknown-provider`.
- An alias in a `hub.yaml` already shares that message's function since HAL-15830 (#4910), so it gets the same new words. The requirement's examples quote them.
- `packages/testing/parity/allowed-differences.json`: the entry `unknown-provider-says-the-fix` gets the new message and a line in its why (`signed-off` by Liam in review). The recorded fixtures are the old loader's output and stay as they are.

## Why

C637: a run that stops for the same cause says "the model alias smart names the provider cloud, which the workspace doesn't have." and "…point the model alias smart at a provider the workspace has." (`apps/cli/src/messages/run-failures.ts`). "Unknown provider" is the code's name, not a sentence. One cause gets one sentence, wherever the alias is written.

## Tests

No test was weakened or skipped. The tests in `model-providers.test.ts` and `references.test.ts` check the new words at the same file, key path and line. One assertion that a provider which is there gets no error looked for "unknown provider"; the assertion next to it already looks for "the workspace doesn't have", which now covers both checks, so the first one was removed.

## Covers

- packages/testing/parity/allowed-differences.json
- workspace.references
