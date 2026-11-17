# Decision: the harness gets the files its pin records, and the run's folder is cleared when the call ends

- Task: HAL-10212 (follow-ups 1 and 2 of the review of #2917 on HAL-10210)
- Approval: HAL-10212, Liam's review of the pull request; Liam signs this note as the CTO
- Kind: internal

## What changes

- `HarnessInstructionSource.pinOf` becomes `open`: it gives the pin, the run's read-only instruction folder and a `release()`. The engine calls `release()` once the call has ended, after the sandbox session closed, whatever the outcome.
- The engine passes the folder to the sandbox profile builder (a third argument of `profileOf`) and to the harness task (new optional `instructionsFolder` on `HarnessTask` in `ports`).
- The profile opens the folder read-only, never writable.
- The instruction snapshot refuses any file that isn't `AGENTS.md` or `skills/<id>/SKILL.md` (`harness-kit.instruction-snapshot` gets one sentence for it), because Claude Code treats a `--plugin-dir` folder as a plugin and would also load hooks, commands, agents and `.mcp.json` from it.
- Claude Code loads `skills/<id>/SKILL.md` from it with `--plugin-dir`; Codex adds `<folder>/skills` as an extra skills root before it starts the thread.

`harness.instructions` already named these files; the run now really has them. Nothing a requirement promised is weakened: the new sentences only add the refusal and the folder's path through the engine, the profile and the two harnesses.

## Why

Liam's review of #2917: the harness got only the instructions text, so `harness.instructions` listed skill files the run never saw. Folders also piled up under `tempRoot/instructions` under `halonic routines watch`.

## Tests

No test was weakened or removed. `pinOf` tests became `open` tests, and the engine's failing-instructions test now expects an empty log, because the instructions open before the sandbox does. New tests cover the release order, the profile's read-only folder, the Claude Code argument and the Codex request. Claude Code's `--plugin-dir` was also checked by hand against the installed `claude`: it loaded a skill from such a folder. Codex's `skills/extraRoots/set` was checked against the app-server schema of `codex` 0.166.0 (`codex app-server generate-json-schema`): the method and its `extraRoots` param exist. New test: a `hooks/hooks.json` entry (and other names) is refused and nothing is written.

## Covers

- engine.run-harness
- harness-kit.instruction-snapshot
- harness-kit.harness-profile
- harness-claude-code.command
- harness-codex.start
