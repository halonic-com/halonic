# Decision: a box with no bridge proves its network control in a control box

- Approval: Liam signs this note in review of the pull request
- Kind: internal
- Signature: UNSIGNED
- Task: HAL-9342 (ruling), HAL-9335

## What changes

- `sandbox-mxc` fence proof: when the profile has no bridge, the session first runs a control box:
  the same policy with a dead-end loopback bridge (a listener of the adapter that takes a connection
  and drops it), on the same computer, right before the real proof. Its probe must reach its bridge
  and be blocked from every outside address. Only then does a timeout in the real box count as
  blocked, and only on a target where the control box also timed out: a target it was refused on
  stays unproven. Profiles with a bridge keep the bridge as the control.
- `sandbox-mxc.session` has the new wording and examples. `attack-cases.md` of the runner states the
  limit: the control runs in a twin box, not in the runner's box.
- `integration-runner.mxc-profile` and the HAL-9155 ruling stay as they are: the runner's own box
  still has no bridge, no loopback rule and no DNS. The control box is a separate, short-lived
  box that holds no caller program.

## Why

The runner's no-bridge profile could never get a `fenced` proof. Option 4 (the probe talks to
itself inside the box) was tried first, as Liam ruled, and failed on `windows-11-arm`: MXC refuses
the probe's own loopback socket with EACCES (CI run 43623375655). So this is the ruling's fallback,
option 2.

## Covers

- sandbox-mxc.session
