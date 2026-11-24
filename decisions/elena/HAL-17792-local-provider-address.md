# Decision: in a local-only workspace, a model provider's address decides whether its `local: true` counts

- Approval: the task HAL-17792 asks for this change. It narrows which providers count as local, so it changes what a run may do; Elena wrote it, so Liam signs this note in review.
- Kind: user-visible

## What changes

- `workspace.local-only`: a provider counted as local when its file set `local: true`. Now `local: true` counts only when the address the provider calls (its `baseUrl`, or else its type's default) is `localhost`, a loopback address or a literal private-network address, by the same rule the format already uses for connectors and integrations. A public address or a host name is never local. In a local-only workspace such a provider file gets a new `local-only-provider` error at `local` that names the address, next to the existing alias and model errors. The model resolver counts a provider as local by the same rule, so the engine no longer treats such a model as local. The mock model stays local. The requirement's text says so and gains two examples.

## Why

The local-first ADR promises that nothing leaves the computer while `privacy.localOnly` is on. For connectors the check already reads the address; for model providers it trusted the file's own flag, so a shared workspace whose provider said `local: true` with a public `baseUrl` would send every prompt there with local-only on, and nothing would say so.

## Tests

No test was weakened or skipped. `local-only.test.ts` gains a test of a provider at a public address with `local: true` (the new error) and one at `127.0.0.1` and `192.168.1.20` (no error); `workspace-model-resolver.test.ts` gains a test that the public one resolves with `local: false`. Both new failing cases failed before the fix.

## Covers

- workspace.local-only
