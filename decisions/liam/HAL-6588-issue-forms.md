# Decision: the issue forms ask what 0.1.0 triage needs, and stop promising connectors

- Task: HAL-6588 (forms drafted on HAL-6575 and HAL-6394)
- Approval: Chief's task, no board card because issue forms publish nothing; Maya reviews it on [HAL-6624](/HAL/issues/HAL-6624), Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:U9ffSvCjGuGHVWtY+z7Ec8iLCDqcc1Jfrr3w4jZw2WZFWrs7tEbicf8q4QyYeisVFCb9jbbIb131xchNF+T1Aw==

## What changes

Only `.github/ISSUE_TEMPLATE/`. The Bug report asks for the command, what happened, what was expected, the version and commit, the `halonic doctor` output, the system (with the WSL2 distro) and the Node.js version. The Feature request becomes "Idea or feature request" with four fields. A new Install problem form covers the install steps and the first run. The Integration request no longer says services work with Halonic today. `config.yml` links the Known issues list first; blank issues stay off.

## Why

0.1.0 installs from source, and install and first-run problems on Windows and old Node.js are the reports we expect most. The forms ask for what tells those apart in one reply. In 0.1.0 no connector reaches a run (HAL-5982), so the old Integration request text was wrong.

No workflow, action, check or setting changes. The docs and FAQ links go in on launch day, once those pages answer.

## Covers

- .github/
