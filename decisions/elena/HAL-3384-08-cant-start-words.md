# Decision: one set of words for programs that can't start, R11's

- Task: HAL-3384
- Approval: the words are R11 of microcopy 24.1 (HAL-751), approved by the board on HAL-1949 for Studio's trust check. The CLI's requirement already says it shows "the words Studio's trust check shows for the same state". Raised as C1 of the C506 code check of #4299 (HAL-14929); decided by the team on HAL-3384.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dccG39V5liFVRHIUffjcRgDmUcyYrNRgHsXYOB4izemK9bkxEfxLuCBDiLYX/xn7wEz7sxK2KbnieXX5TU71DA==

## What changes

- `cli.commands.plugin.programs-run`: when the sandbox can't start, the Runs line under a program in `halonic plugin add` and `halonic trust --plugin <id>`, and the line under a plugin on `halonic plugin list`, say "Doesn't start on this computer: the sandbox can't start here" instead of "Doesn't run now. The sandbox can't start on this computer". The two examples change to match. Nothing else changes: the same state gives the line, `--json` stays the same, and no test is removed or weakened; the two tests now expect the new words.
- `plugins.plugin-trust-check`: the Programs Runs line listed for "when it can't start" changes the same way, so it no longer contradicts `plugins.plugin-trust-program-rows`, which already shows R11 in Studio. The other three Runs lines and every other sentence stay.

## Why

Studio's trust check shows R11 for a program whose sandbox can't start (`plugins.plugin-trust-program-rows`, #4299), while core's `pluginTrustRunsText` still gave the older T8 sentence, which the CLI shows. Once Studio passes the programs' state (#4326), the two would say different things for the same computer, although the CLI's requirement promises Studio's words. R11 is the board-approved text, so it wins: core's sentence for `sandbox-unavailable` becomes R11's first sentence, and Studio's row builds R11 from it plus "The tool that uses it stays off.", so the words live in one place.

## Covers

- cli.commands.plugin.programs-run
- plugins.plugin-trust-check
