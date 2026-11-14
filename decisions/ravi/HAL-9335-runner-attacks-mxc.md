# Decision: the MXC fence job also runs the runner's attack list

- Approval: Liam signs this note in review on the review task of HAL-9335
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XGCdiswDTIx0YZTgGn/IjkuacbO6oKeC5GxJesxkMtLzfkNn74C4yOO6xQnomSiHxHLNwWCbxFyRp0Z60t04Cg==
- Task: HAL-9335

## What changes

- `.github/workflows/ci.yml`: the `sandbox-mxc-fence` job (Windows 11 Arm) gets a second step that
  runs `test:fence:mxc` of `@halonicjs/adapter-integration-runner`. The `sandbox-mxc` changed area
  now also covers `packages/adapters/integration-runner/`, so the job runs when the runner changes.
  Triggers, rights and secrets don't change: `contents: read`, no secrets, nothing uploaded.
- `packages/adapters/integration-runner/fence/runner-attacks.mxc.test.ts` runs the attack cases of
  the I5 design (HAL-958, section 6) that need an OS fence in a real `sandbox-mxc` box with the
  runner's own MXC profile, with Node's permission model on and off. A23 closes a session under a
  running program and checks that it stops and nothing starts after.

## Why

`mxcFencesRunner` stays off until A1 to A40 have passed on MXC on `windows-11-arm`, A6 and A23
included (HAL-3403, `app.runner-start-gate`). Cases A1 to A3, A5, A7 to A11, A18 to A22, A24 to A34,
A37, A38 and A40 don't touch the OS fence and already run in every `pnpm test`.

## A36 is a recorded gap past Node's layer

Liam's ruling on HAL-9362: the runner always starts with Node's permission layer on, which refuses
the child process `cmdkey` needs. With the layer off, a program in the MXC box can list the host
user's Credential Manager entry, as on native Windows. The test expects both results, so a gap that
closes fails too. For the gate, a recorded gap counts as met for the runner only; A6 and A23 still
have to pass for real. Local tools have no Node layer, so `mxcFencesLocalTools` (own constant, stays
`false`) is split from `mxcFencesRunner` in the flip PR.

## Covers

- .github/
- app.runner-start-gate
