# Decision: read a program start for paths in one place

- Approval: Liam asked for this in his review of halonic#1527 on [HAL-4748](/HAL/issues/HAL-4748); planned on [HAL-4777](/HAL/issues/HAL-4777), with Julian's security check and Liam's review of the pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+hzci1bKBv3SWXkhb8AaKZwBJNaGF0F6ht9fGzDaHVEIsC4lcfGP5vmpk12LSStlhVvzLsyE89cwHzz3mAxRAw==
- Task: HAL-4777

## What changes

`format.skill-scripts-folder` reads a start the way the working-folder guards already do. Before,
it looked at the folder, the program, each argument and the text after an argument's first `=`.
Now it looks at the folder and every path `pathsNamedBy` lists: the program, each argument and
`env` value whole and split at `;`, `=`, `:`, `@` and spaces, the whole text after each `=`, `:`
and `@`, each piece also without a short flag such as `-c`, and the folder path of a `python -m` module. Each of these is checked as
written, resolved from the start folder and through symbolic links, as before.

So the guard refuses more starts: a link after a second `=`, a path after `:` or `@`, a path
behind a short flag, `python -m skills.x.scripts.y`, and an `env` value such as `NODE_OPTIONS`
that names a skill's script, or a link after `=` whose name holds a `:` (`--define=K=a:b`).
Every start it refused before, it still refuses: the whole argument and the whole text after the
first `=` are still in the list (as one of the texts after each `=`, `:` and `@`), and no example
or test is removed.

`env` is read only when the adapter passes it, and only the part a workspace writes.
`nodeProgramStarter` (the MCP stdio adapter) gets the program's whole environment, but checks only
`checkedEnv`: the variables the connector file sets. The app's own environment (`PATH`,
`PYTHONPATH`, ...) and the secret values aren't workspace content, so a path in them refuses
nothing; reading them would refuse every connector for a user whose own `PATH` happens to name a
skill's `scripts/`, and would hand every secret value to `realpath`. So `mcp.program-starter` now
also refuses a value the connector file sets that names a skill's `scripts/`. The sandbox adapters
pass no `env` yet, so for them only the extra argument pieces are new; reading the profile's
environment there is a follow-up.

The new requirement `format.program-start-paths` describes the shared reading. It is the reading
`workspace.working-folders` and `format.working-folder-start` already used: their behaviour
doesn't change, apart from `workspace.working-folders` now also splitting at `;` and spaces alone,
which keeps the drive letter of a Windows path list.

## Why

Three guards refuse a start by what it names, and each had its own copy of how to read one. A
path one guard found, another missed: the skill-scripts guard let `python -m skills.x.scripts.y`
start, while the working-folder guards read that form. One shared reading means
a fix to one is a fix to all. Reading too much as a path only makes a guard stricter.

## Covers

- format.skill-scripts-folder
- mcp.program-starter
