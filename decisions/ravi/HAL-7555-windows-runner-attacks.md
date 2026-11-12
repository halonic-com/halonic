# Decision: the Windows fence job runs the runner's attack list with Node's layer only

- Approval: a change under `.github/` needs Liam's review (docs/guides/checks.md, note guard); Liam approves this note in review of the Windows attack run on HAL-7555
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Iz8bDds21YVOf/F+3XU2XK194YVef13bi1xk2jrXwLkLK9gSTWYlvNTRKFk3swf1OWQQcHLUGmPcDCHKuPtsDA==
- Task: HAL-7555

## What changes

- `.github/workflows/ci.yml`: the `sandbox-windows` job also installs the integration runner's
  dependencies and runs its `pnpm test:fence:windows` before srt's Windows install. Nothing
  else in the workflow changes.
- `packages/adapters/integration-runner/fence/runner-attacks.windows.test.ts` runs the attack
  list from the I5 design (HAL-958, section 6) on native Windows. The runner starts through
  `sandbox-host`, as on the path the user confirms without the fence, with Node's layer on.
  `vitest.fence.config.ts` leaves `*.windows.test.ts` out; `vitest.fence-windows.config.ts`
  runs only those.
- `fence/attack-session.ts` takes the sandbox's own folders from its caller, so the same
  helper runs an attack in `sandbox-srt` or `sandbox-host`.

## Why

Design section 4.3: on native Windows the runner has no OS fence, only Node's permission model,
and Windows CI records the cases that get through, so a known gap stays written down. The run
goes before srt's install, so the machine is as a user's is without it.

## Known gaps

Each case below expects what gets through, so it fails if the gap closes as well as if another
case starts getting through. The first Windows run corrected the design's list (HAL-958,
section 6): Node 26's network permission refuses DNS and named pipes, and Windows adds
variables to the environment that the design hadn't counted.

- **A16, A39 signals:** `process.kill` ends another process, and a stand-in for Halonic's own
  process. Node's layer doesn't cover signals.
- **A17 the environment:** the launcher passes only `TMPDIR`, but libuv adds the variables a
  Windows program needs when they are missing, with the user's own values: `HOMEDRIVE`,
  `HOMEPATH`, `LOGONSERVER`, `PATH`, `SYSTEMDRIVE`, `SYSTEMROOT`, `TEMP`, `USERDOMAIN`,
  `USERNAME`, `USERPROFILE`, `WINDIR`. So the integration learns the account name and profile
  folder. No key or Halonic variable gets in. The launcher could close it by passing its own
  values for these; that is a follow-up.
- **A36 the Credential Manager:** with Node's layer on, the runner can't start `cmdkey`, so the
  attempt is refused. With the layer off, `cmdkey` lists the test's generic credential. Nothing
  but Node's layer stands in front of it.

No longer gaps, now expected `refused`:

- **A4, A6 DNS:** a name lookup through `node:dns` is refused, and a query to a DNS server the
  integration names itself never reaches it.
- **A35 named pipes:** connecting to a named pipe on this computer is refused with
  `ERR_ACCESS_DENIED`, and the pipe sees no connection.

## Covers

- .github/
- packages/adapters/integration-runner/fence/runner-attacks.windows.test.ts
