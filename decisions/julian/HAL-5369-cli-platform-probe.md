# Decision: a manual-only CLI platform probe

- Task: HAL-5369
- Approval: assigned by Liam on [HAL-5369](/HAL/issues/HAL-5369); Liam approves this note in review there
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:E9brY2yRgB+jtOPZTIBkHRmMQ2ardQVpRzhwuzpSr4JAQIddYdzBSat+vf98JC/kT6EJnRmijbIv2JljSTXZCg==

## What changes

A new workflow, `.github/workflows/cli-platform-probe.yml` ("CLI platform probe"), runs only by hand
(`workflow_dispatch`, no push, pull request or schedule trigger). It installs Codex and Claude Code at
the versions given as inputs and runs them on Windows, macOS and Linux runners with their own
sandboxes turned on, against a fake model server on 127.0.0.1, so no account or key is used. Each CLI
runs one command that writes in the working folder and in the home folder. On macOS it also checks
which sign-in `claude auth status` sees with and without `CLAUDE_CONFIG_DIR`, using a made-up entry in
a throwaway keychain. On Linux it installs bubblewrap and socat first. The scripts live in
`.github/probes/cli-platform/`.

It is report-only: it writes what happened to the job summary and fails nothing. It has
`contents: read` only and checks out without keeping credentials.

## Why

A repeatable way to see how each CLI version behaves on each system, to rerun when either CLI's
version changes.

## Tests

No test was weakened or skipped. The same scripts ran on the Windows and macOS runners in HAL-5354;
all three jobs ran once on this pull request's branch, through a temporary push trigger that was
removed before review.

## Covers

- .github/
