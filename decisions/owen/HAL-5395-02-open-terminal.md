# Decision: the agent host may open a terminal the person can see

- Approval: [HAL-5395](/HAL/issues/HAL-5395)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:MYrD/V+8RVP+YOgpj+gNQtt4JHHXzCorNFHZKpdnOvuJEvYjpuCNrAyaBN1kPE3UDiD429xhG/mCijdDODGvBw==

The board chose a "Sign in for this agent" button in Studio (HAL-5355,
option 1). It runs the program's own sign-in, such as `claude auth login`,
in a terminal window the person can see, pointed at that agent's settings
folder. The agent host starts it, so `apps/agent-host/src/terminal/open-terminal.ts`
starts processes and needs an entry in `tooling/check/process-starters.json`.

What it starts, and only that:

- Windows: `cmd.exe` from the Windows folder, running `start` with the
  program's absolute path and plain-word arguments. The variables travel in
  the environment, never on the command line, and a path with `%` isn't run.
- macOS: `/usr/bin/open` on a `.command` file it wrote to a new private
  temp folder. The variables are quoted for `sh` there.
- Linux: the first of a fixed list of terminals found in the absolute
  `PATH` folders.

It refuses a program or variable under a skill's `scripts/` folder, which
`open-terminal.test.ts` shows (the entry's `scriptsTest`).

Four cases in `open-terminal.test.ts` are skipped on Windows, each marked
`[platform:win32]`: they need file modes, `/bin/sh` or POSIX paths, which
Windows doesn't have. The Windows command itself is tested on every system,
with a starter that records what it would start.

## Covers

- tooling/check/
- apps/agent-host/src/terminal/open-terminal.test.ts
