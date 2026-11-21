# Decision: the sign-in command makes the agent's settings folder first

- Task: HAL-15354, found while fixing HAL-15329
- Approval: decided by the team on HAL-15354 (a fix to the approved sign-in command, no new flow or wording). Liam signs on review.
- Kind: user-visible

## What changes

- `ports.harness-sign-in-command`: the command now makes the agent's settings folder before
  it signs in: `mkdir -p -m 700 '<folder>' && …` in `sh`, and
  `New-Item -ItemType Directory -Force -Path '<folder>' | Out-Null; …` in PowerShell. The
  folder is quoted the same way in both places. The Claude Code example changes to match, and
  one example for Codex in PowerShell is added. The tests check both shells, a quote, `$`, `~`
  and `*` in the folder, as before.
- `words.doctor-lines` and `cli.doctor-report`: the expected Fix line of an agent that isn't
  signed in changes to the new command. Nothing else in those tests changes.

## Why

An agent that never ran has no settings folder yet, and `halonic doctor` names that folder
without making it (a check doesn't write). Codex 0.169.0 refuses it: `CODEX_HOME='<missing
folder>' codex login` prints "Error loading configuration: CODEX_HOME points to …, but that
path does not exist" and signs nobody in. So the Fix line doctor printed for a Codex agent
didn't work. Claude Code makes its own folder, but with the person's usual mode (755 here), so
the command makes it for every harness: one rule, and the folder is only the user's in `sh`, as
the host makes it before a run. A folder that is there already is left as it is.

Studio's Sign in button had no such gap: Studio asks `POST /v1/harnesses/settings-folder` for the
folder first, and that route makes it private. The sign-in route itself still makes nothing,
because it takes any absolute folder in its body, and making one there would let a caller make
folders anywhere. The Rust agent host only passes both routes on to the Node one.

## Covers

- ports.harness-sign-in-command
- words.doctor-lines
- cli.doctor-report
