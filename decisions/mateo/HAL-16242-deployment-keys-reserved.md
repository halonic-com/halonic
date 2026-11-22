# Decision: a deployment's own keys join the names no workspace may pick

- Task: HAL-16242
- Approval: Liam reviews this security PR and signs this note as the CTO
- Kind: internal

## What changes

- `packages/core/ports/src/secrets.ts`: a new list, `deploymentSecretNames` (`cloud-key`, `user-secrets-key`, `admin-key-hash`). `isHalonicSecretName` counts them, so `workspaceSecrets`, `workspaceSecretWriter` and the workspace format check refuse them like `token-key`.
- The requirement `ports.workspace-secrets` names the three in its text and its first example. Nothing it refused before is allowed now.
- They are a list of their own, not part of `halonicSecretNames`, because the Cloudflare runtime's `requiredSecrets` is that list: adding them there would make every deployment need all three. The desktop shell's reserved names stay as they are, because no desktop keychain holds a deployment key, and Studio reads a workspace's picks through `workspaceSecrets` anyway.

## Why

A Worker reads every secret by name from `HALONIC_SECRET_<NAME>`. Before this change a workspace could name `admin-key-hash`, or the deployment keys the selling layer adds, as a model's or a provider's secret, and the run would read it and send it to the model's address. The key that wraps end users' data keys (the `@halonicjs/adapter-user-secrets` package, in its own PR) must never be readable that way.

## Tests

No test was skipped or weakened. `workspace-secrets.test.ts` adds the three names in several spellings to the refused list, and a test that each is Halonic's own but not in `halonicSecretNames`.

## Covers

- packages/core/ports/
- ports.workspace-secrets
