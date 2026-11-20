# Decision: validate fails on a provider type, a default alias and a baseUrl the run fails on

- Approval: the task HAL-14260 asks for this change, from the first-run error check on HAL-14245 (c336) and the validate-vs-run gaps on HAL-14257 (c337, row 9); Liam decided it as maintainer, wording under the HAL-2282 rule, and signs this note in review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:PYG/Tj54yRsQuzdEpU8XNauV1u1z5txYynzwmK5ml2v60Zk7vxgynMwK2tHqPtbnmdS7rOYGlzaAINO64MfhBw==

## What changes

- `format.provider-file`: a provider `type` Halonic can't call fails with `provider-type` at `type`, naming the file and listing the types the run accepts (one shared list, the run's). A `baseUrl` that doesn't start with http:// or https:// fails with `provider-base-url` at `baseUrl`. Two examples are added; none removed.
- `cli.commands.validate.check-workspace`: `unknown-default-model` is an error, on the first agent without a model that a workflow of the hub runs, when there is one, since the run would stop there. When no workflow runs such an agent it stays a warning, so workspaces that run today keep passing.
- `workspace.references`: an alias in `models.yaml` is no longer reported as using an unknown provider when a provider file named after that provider failed its own checks. An alias on a provider no file names still gets the error. Two examples are added (the four failing provider parity cases, and a misspelled `type:`).
- `cli.workspace-file-problems`: the counts in two examples drop by one, since that alias is no longer counted; a new example says the run stops with exit 2 for these workspaces instead of starting and failing with exit 4.
- `packages/testing/parity/allowed-differences.json` gains `alias-of-failed-provider-not-reported`, listing the 4 parity cases where the old loader gave the alias error. It is marked `signed-off`: this note's signature is the review of its exact text.

## Why

`halonic validate` said "No problems" for these workspaces and the run then failed with exit 4. A new user should see the problem, on the right line, before anything runs. Without the `workspace.references` exception, a misspelled `type:` would also report every alias on that provider as unknown, pointing at `models.yaml` instead of the `type:` line; this follows the failed workflow file rule from HAL-12126.

## Tests

No test was weakened or skipped. The provider format tests, `validate` command tests and `doctor` tests gain a case for each new error (code, line, exit 1, the ✕ Workspace line). `run/file-problems.test.ts` checks that the same workspaces now stop with exit 2. `references.test.ts` gains a test for the failed provider. Two existing tests expect one problem fewer, for the alias no longer reported. The list of entries' requirements in `allowed-differences.test.ts` gains the new entry's requirement.

## Covers

- format.provider-file
- cli.commands.validate.check-workspace
- cli.workspace-file-problems
- workspace.references
- packages/testing/parity/allowed-differences.json
