# Decision: the CLI words the nine reason codes of `Sandbox` port version 6

- Task: HAL-5900; asked for by Liam in his review of #1836 (HAL-5750)
- Approval: Liam approved the change in review on [HAL-5926](/HAL/issues/HAL-5926) and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9/2WBaIf87LL6qeP5ZjeGWZzjgUcnlP5SqkxmCLpQBkIGnrRweQvLea0p5dsctXp8ytCEejvBa/cDzjabL63AA==

## What changes

Port version 6 (HAL-5389) added `not-supported`, `blocked-by-policy`, `virtualisation-off`,
`wsl-missing`, `restart-needed`, `distro-missing`, `setup-conflict`, `setup-needed` and
`sign-in-needed`. The CLI read them as `other`. Each now has its own reason and fix in
`apps/cli/src/messages/sandbox.ts`, for a refused `run` and for `halonic doctor`.

- The test "words version 6's codes as other until the sandbox design words them", in
  `apps/cli/src/messages/sandbox.test.ts`, is replaced by the word-for-word tests that cover
  every code, in the port's order, so that file runs one test fewer. It checked a stopgap
  this change removes; no expectation is weakened. A code this version doesn't know still reads
  as `other`, and that test stays.
- `cli.sandbox-gate` gains an example: Windows without the sandbox's one-time setup
  (`setup-needed`) gets the WSL fix, not the generic `other` text. That was the visible gap
  Liam named.

## Where the words come from

The onboarding wording (HAL-3778 section 4, approved) has two of the reasons:
"Hardware virtualisation is turned off on this computer." and "Windows needs to restart to
finish setting up WSL." The other seven, and every fix, are the team's call, a small wording
decision on an approved screen (board, HAL-2282), confirmed by Sofia on HAL-5917. They follow
the meanings in the design (HAL-3779 section 2.5) and these rules:

- On Windows the fix leads with WSL, since native srt is experimental and the WSL path is
  recommended (HAL-3779 section 3). `setup-needed` and `setup-conflict` both point to "Set up the
  sandbox with WSL", the name of the approved button, not "use Halonic inside WSL 2", which reads
  as installing the CLI inside Linux. Halonic never changes a machine-wide setup that belongs to
  another program.
- The CLI has no setup command in 0.1, so a fix that needs Halonic's own setup points to
  Studio's Settings > Sandbox (HAL-3778 section 7, built in HAL-5405).
- `not-supported` and `blocked-by-policy` offer another sandbox there, since one often works
  where another can't (onboarding's "You can use another option instead").
- `wsl-missing` says `wsl --install --no-distribution`: plain `wsl --install` also installs
  Ubuntu and asks for a Linux user, which Halonic's own Linux system doesn't need.
- Every line of a refused `run` whose fix the person does first ends with "then run it again",
  after any note such as the virtual machine one, so the three Studio-setup fixes read alike
  (Liam's review, HAL-5926).

## `runnerFence` on Windows keeps `windows`

Plugin and integration code on Windows stays `not-fenced` with `windows`, now with a comment
saying why, and its test covers the new codes. `not-supported` would say this build of Windows
can't run it, which isn't true of any build. And the saved yes to run without the sandbox is
kept per reason (`UnfencedRuns`), so a new code would ask everyone on Windows again for no
change in risk. `windows` as "has no Windows mode" fits the runner as well as a backend.

## Covers

- cli.sandbox-gate
- cli.messages
- apps/cli/src/messages/sandbox.test.ts
