# Decision: the CLI's sandbox fixes no longer point to Studio

- Approval: Liam decided this on [HAL-7540](/HAL/issues/HAL-7540) (found in Kim's docs fact-check on HAL-7512), small wording on approved CLI output, a team decision with no board card (HAL-2282 rule)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2S5ZGU/CYJtW/mWkO6UZKkOF6m1j3YRTXePwsY4brlpRX1+qwFfgp6TNuiemwZRoZjT6NyFUYzAi/LHe9TmtBg==
- Task: HAL-7540

## What changes

Five fixes for a sandbox that can't start told the user to go to "Halonic Studio, under Settings >
Sandbox". 0.1.0 ships no Studio, and runs on Windows only inside WSL 2 (README), so the fix
pointed to something the user doesn't have. In `apps/cli/src/messages/sandbox.ts`, for a refused
`run` and for `halonic doctor`:

- `setup-needed`, `distro-missing` and `setup-conflict` now say "Use Halonic inside WSL 2 on this
  computer", the fix the `windows` code already gives. In 0.1.0 `setup-needed` is what native
  Windows gets from srt when its Windows install is missing; inside WSL 2 the sandbox is
  bubblewrap, which needs neither srt's Windows install nor Halonic's own Linux system.
- `not-supported` drops "or pick another sandbox in Studio" and says "Update it, or in WSL switch
  the Linux system to WSL 2", because in 0.1.0 srt gives this code for WSL 1.
- `blocked-by-policy` drops the Studio part and keeps "Ask whoever manages this computer to allow it".
- A refused `run`'s line for these now ends with "then run it again", as the rule in HAL-5900 asks
  of every fix the person does first.

This replaces the HAL-5900 rule that fixes needing Halonic's own setup point to Studio's Settings >
Sandbox. When Studio ships with that page, these fixes can point to it again.

The example in `cli.sandbox-gate` for Windows without the one-time setup changes its expected
words to match. No test is removed or weakened: the tests assert the new words, word for word.

## Covers

- cli.sandbox-gate
- apps/cli/src/messages/sandbox.test.ts
