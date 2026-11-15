# Decision: Codex no longer reads instructions out of the working folder

- Task: HAL-3106 slice 3e (HAL-10521)
- Approval: Liam reviews the trust path on HAL-10521
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:K7HHjdgb3t7V8zjB+PxVMmWHu1n6gt8CbcW4RYDKkH6BrlvoXirNJOAI5LWmnSxV9iRkuHWjyBxCb7TiPf9oDQ==

## What changes

Two active requirements get a sentence and an example, and nothing is weakened: no test was removed or made weaker.

- `harness-codex.config`: Codex starts with `-c project_doc_max_bytes=0` and `-c skills.include_instructions=false`. Before, it read the working folder's `AGENTS.md`, `AGENTS.override.md` and the skills in `.agents/skills` at the moment the run started, so a person could trust one version of an agent's instructions and the run would use another.
- `harness-claude-code.command`: states what `--setting-sources user` already did. With Claude Code 2.1.318, a `CLAUDE.md`, a `CLAUDE.local.md` and a `.claude/skills` skill in the working folder never reach the model request; with `project` and `local` added they all do. The command is unchanged, and a test now pins it.

## What I found, by hand

I started each program against a local server that records the model request, with a marker in each file of a working folder. Claude Code with `--setting-sources user`: no marker. Codex without the new arguments: the `AGENTS.md`, `AGENTS.override.md` and skill markers. With them: none. `codex app-server`, which the harness uses, gives back both settings from `config/read`. The two settings are `-c` arguments, not `config.toml` lines, because a command-line setting wins over a project's own `.codex/config.toml`.

## Skills

The harness is given no skills: `HarnessTask` holds only `instructions`, and with the live paths closed no skill reaches either program. When skills are delivered, they must come from the pinned copy; that is a later slice and needs its own design.

## Covers

- harness-codex.config
- harness-claude-code.command
