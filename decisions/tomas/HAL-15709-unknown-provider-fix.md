# Decision: validate's unknown provider in models.yaml says the fix

- Approval: the task HAL-15709 asks for this change, from flow check C618 #5 (HAL-15701). The team decides it under the HAL-2282 rule, since it rewords a message that is already there. Liam signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:PDCUkbW42dHKCmGyawMHjF78kHA+Agblmhb6npNIyttBjOy0dgbxiJ2khxHDFeIf4/umtDz4bX+xdFRPR8HGDg==

## What changes

- `workspace.references`: an alias in `models.yaml` on a provider no file names now gets `Alias smart uses unknown provider cloud. Add providers/cloud.yaml, or point the alias smart at a provider the workspace has.` instead of the old loader's `Alias "smart" uses unknown provider "cloud"`. When a provider's id is near, the second sentence is `Did you mean <provider>?`, as the hub alias check already says. The code stays `unknown-provider`. The requirement names this message as a second exception to "the old loader's message", the example for a provider file with a wrong `type:` quotes the new start, and one example is added for the parity case and the near provider.
- `packages/testing/parity/allowed-differences.json`: a new entry, `unknown-provider-says-the-fix` (`signed-off` by Liam in review), lists the old and new message for the one parity case that reaches this check, `models/unknown-provider`. The recorded fixtures are the old loader's output and stay as they are.

## Why

validate stops an unknown provider before any run starts, so its line is the only place a person sees the cause. It was the one config line with no fix, while the run view's banner for the same cause says "Add the provider anthropic in Models, or point the model alias default at a provider the workspace has." The quotes go, like the newer lines around it.

## Tests

No test was weakened or skipped. `models/unknown-provider` moved out of the "old loader's error" list in `references.test.ts` into its own test that checks the new message at the same file, key path and line. `model-providers.test.ts` adds a test for the near provider.

## Covers

- packages/testing/parity/allowed-differences.json
- workspace.references
