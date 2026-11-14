# Decision: a required MXC fence job on Windows 11 Arm in CI, and the box environment MXC needs

- Task: HAL-3655
- Approval: Liam approves this note in review on the review task of HAL-3655
- Kind: internal

## What changes

`.github/workflows/ci.yml` gets a new job, `sandbox-mxc-fence` ("Sandbox fence (MXC on Windows 11)"),
on `windows-11-arm`, and `ci-ok` now needs it, with no `continue-on-error`. It runs the `test:fence`
script of `@halonicjs/adapter-sandbox-mxc` (contract suite, fence proof, attack cases); a missing
package or script fails the job. A new `sandbox-mxc` changed area decides when it runs: the adapter,
the sandbox choice in `core/app`, `packages/core/ports/`, `ci.yml`, `.github/actions/` and
`pnpm-lock.yaml`.

Triggers, rights and secrets don't change: `contents: read`, no secrets, nothing uploaded.

`packages/adapters/sandbox-mxc/requirements/box-request.md`: the box's environment is still only
the profile's variables, `TEMP` and `TMP` as the temp folder and the Node flags, and now also
`SYSTEMROOT` (the host's Windows folder) and `LOCALAPPDATA` (the temp folder) when the profile has
none. The code and its tests change to match.

## Why

MXC is opt-in, but a person can switch it on in v0.1, so its fence must block from day one (HAL-3645).

The first run of the fence tests on a real Windows 11 Arm computer showed that MXC refuses to start
a box whose environment lacks `SYSTEMROOT` and `LOCALAPPDATA`, and that Winsock needs the real
`SYSTEMROOT`. `SYSTEMROOT` is no secret. `LOCALAPPDATA` is the temp folder, so the box learns
nothing of the user's profile folder. Nothing else of the host's environment is passed.

## Tests

No test was weakened or skipped. The job is new and required. One expectation of the box's
environment gained the two variables, and a new test covers a profile that brings its own, in any
letter case.

## Covers

- .github/
- sandbox-mxc.box-request
