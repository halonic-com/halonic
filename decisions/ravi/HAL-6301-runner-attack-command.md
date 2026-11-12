# Decision: the fence jobs also run when the integration kit or the ports change

- Approval: a change under `.github/` needs Liam's review (docs/guides/checks.md, note guard); Liam approves this note in review of the runner attack follow-ups on [HAL-6301](/HAL/issues/HAL-6301)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qo0IePZrfl+tnZkUMOSdpYv9zA68J+Ve96wOsAj4FymBKKZV+9AdJMkvDsbU405ZetG8Fz1dM6D75YbwtFFFCQ==
- Task: HAL-6301

## What changes

- `.github/workflows/ci.yml`: the `sandbox-fence` area also covers
  `packages/adapters/integration-kit/` and `packages/core/ports/`. Nothing else in the
  workflow changes. `docs/guides/checks.md` says the same.
- `packages/adapters/integration-runner/fence/runner-attacks.test.ts`: A36 asks securityd for
  the keychain item by name and expects a refusal, now that
  [HAL-6346](/HAL/issues/HAL-6346) denies the Keychain's Mach services. The Docker socket in
  A35 counts only where the socket is there. Attempts that time out are recorded as `timed out`, never as `refused`.
- `decisions/ravi/HAL-983-fenced-attacks.md` no longer says the A36 skip leaves no platform
  untested, says how HAL-6346 closed A36, and lists the known gaps and the `sandbox-srt`
  devDependency.

## Why

The integration runner is built on the integration kit and the ports, so a change to either
can change what the runner does in the fence. Until now only a change to `sandbox-srt` or the
runner itself started the fence jobs.

The first A36 named the keychain by its path in the hidden home folder, so the file fence
refused it and securityd was never asked. Asked by name, the item came back inside the fence,
until HAL-6346 denied the Keychain's Mach services to the runner's profile. The case now asks
by name and checks that the item comes back outside the fence, so a refusal inside comes
from the denied Mach services, not from the file fence.
A refusal that is only a timeout, or a missing Docker socket, said nothing about the fence and
still passed.

## Covers

- .github/
- packages/adapters/integration-runner/fence/runner-attacks.test.ts
