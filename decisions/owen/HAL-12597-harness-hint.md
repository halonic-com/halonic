# Decision: run's sandbox refusal suggests --harness halonic, and serve never falls back

- Task: HAL-12597 (C44 docs check P6 and P9, HAL-12580 section 8, via HAL-12591)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12597 (Liam asked for both changes on the task; he reviews and signs this note)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:kElhCjsDFYE0VLYtIdGH04zpKIqvBHx2fIWNNOQ3a5N7x5UVLMSWxo8PhE+3bHKLGEeyUnB+y+H+YONKnr/WCA==

## What changes

- `cli.run-sandbox-gate`: when `halonic run` is refused because the sandbox can't start, line 2 of the refusal now ends with "Or run it with --harness halonic, which runs every agent in Halonic's own loop and needs no sandbox." It never suggests "On this computer" as the way out. `runs send`, `routines watch` and `serve` have no `--harness` and don't get the hint. Two examples are added: the hint itself, and that `--harness halonic` gets past the sandbox check.
- `cli.commands.serve.harness`: one sentence states what the code and its test already do: when an agent needs the sandbox and it can't start, the served run starts nothing; running on this computer without the sandbox is never a fallback, and only an agent the person set to "On this computer" themselves runs outside it. One example is added for it.

Nothing is removed from the behaviour; no test is weakened or deleted. The serve change only writes down existing behaviour; its test now also checks that no program started at all.

## Why

A person whose sandbox can't start got only the reason and exit 9, with no way forward that keeps them safe. `--harness halonic` runs the same workflow without the harness program, so no sandbox is needed. "On this computer" would run the harness program with the person's full rights, so it is never offered as the fix. The serve sentence closes a gap the docs check found between the threat model and the requirement. The hint's wording builds on the existing refusal and was decided by the team.

## Covers

- cli.run-sandbox-gate
- cli.commands.serve.harness
