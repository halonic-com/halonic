# Decision: a session without network gets none of srt's variables

- Approval: the I5 design approved on HAL-958 (section 9: with network set to none, `sandbox-srt` drops srt's proxy variables, so the runner's environment holds only its own); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4mmfCixCplFR2fj3TF4WlANC5js9+2j0GSLtFyRoaUu9IMr7Cc/AOZBnbc4SO1bzjJ7WIZvz6shdpIrPaDcTBw==
- Task: HAL-983

## What changes

`sandbox-srt.session` gains one promise and one example: when a profile reaches no network (no
bridge and no allowed site), the program and the fence probe start with none of what
sandbox-runtime sets inside the fence, only the session's own variables. On Linux and macOS the
runner uses `env -i`; on Windows, where nothing empties the environment, it removes every variable srt
sets to lead a program to its proxy (curl's, git's, Docker's, rsync's, the Google Cloud SDK's and
Node's) with `set "NAME="`. A unit test checks that list against what srt itself generates, so
an srt update that adds one fails it. With a bridge or an allowed site nothing changes.

Every existing promise and example stays as it was. No example was removed or weakened.

## Why

The fenced runner for local integrations gets no network (`bridge: null`, no sites). srt still
set its proxy variables inside the fence, pointing at a proxy that refuses everything. They open
nothing, but the design says the runner's environment holds only `TMPDIR` and what Halonic gives
it, so an integration can't read where srt's proxy listens. The probe starts the same way as the
programs, so the fence proof covers the environment they really get. This follows the approved
design, so the note is internal.

## Covers

- sandbox-srt.session
