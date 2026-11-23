# Decision: the Worker calls the models its index names

- Approval: part b2 of the plan on HAL-13210 (22 Nov); the reviewer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZLpTd37uWJUnnimQMoaKGNo2rMUFkTtGjNARuDmvFCtxRdI7gEhYZACeQV3G6Wgvf0yOKAPfxBJEvNw5JSYkCQ==
- Task: HAL-17039

## What changes

`runtime.worker-runs` said that, until the Worker reads the deployed workspace's models, a model
call fails the run's step with an error saying the Worker can't call a model yet. That stop-gap is
gone: the Worker now resolves each model call from the snapshot's run-definitions index, with the
keys from the Workers secrets. So:

- the requirement's last sentence now points to the new requirement `runtime.worker-models`, and
  its example of the failing model step is removed;
- the test "fails a step that calls a model, because the Worker can't call one yet" in
  `packages/targets/cloudflare/runtime/src/worker-runs.test.ts` is replaced by "calls the model the
  index names for a step's agent", which runs the same step to completion with the index's mock
  model.

The requirement is `Since: unreleased`; no released behaviour changes.

## Why

The failing step was a placeholder for this part of the plan. Keeping the old test would assert
the opposite of what the Worker now does.

## Covers

- runtime.worker-runs
- packages/targets/cloudflare/runtime/src/worker-runs.test.ts
