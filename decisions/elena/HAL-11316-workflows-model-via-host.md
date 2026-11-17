# Decision: the Workflows page no longer refuses agents with a real model provider, so the tests of that refusal go

- Requirements: `studio.engine-service`
- Test file: `apps/studio/src/engine/engine-service.test.ts`
- Task: HAL-11316
- Approval: Liam approved dropping the mock-only refusal and its tests on HAL-11316 (option 1, desktop only)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zdtI9j8wcB5OV+pDzultTfZBt7jPtHq22HPzbFN9TdMiOXrgP5iQ48HadwbVurI0ByUVnYUzy/u+jTADVBoJCw==

## What changes

`EngineService.check` no longer refuses an agent whose model isn't the mock model. The page engine already
sends its model calls through the shell's `http_fetch` (`ShellHttpClient`), so a real provider works from the
page on desktop. The Android app never loads this page, so nothing changes there.

The harness refusal and the connector refusal stay, with their tests.

## Which tests went and why

`engine-service.test.ts` goes from 21 to 17 tests, and `studio.engine-service` from 37 to 29 expect calls.
The removed tests checked only the refusal that no longer exists (or a case that only mattered for it):

- refuses an agent whose method uses a real provider's alias;
- passes an agent whose methods use the mock model too;
- passes an agent whose model is the mock model;
- passes when a real provider exists that no agent of the workflow reaches;
- leaves a model the workspace doesn't define to the engine;
- never calls a model server for a run it refuses (replaced by the new test below).

Nothing else was weakened. Two tests come in:

- sends an agent's model call through the given `http`, with the key from `secrets`: a workflow whose agent
  uses an `openai-compatible` provider makes its model call through the given `http`, at the provider's
  address, with the key from `secrets`, and never through `globalThis.fetch`;
- still refuses an agent in a harness that also names a provider: the harness refusal stays, and this
  covers the case where the agent's model names a real provider as well.

Six tests go and two come in: 21 - 6 + 2 = 17.

## Covers

- studio.engine-service
- apps/studio/src/engine/engine-service.test.ts
