# The sandbox's limits

What the sandbox for agents is and what it is not. Read it with the
[threat model](threat-model.md#46-agents-in-a-sandbox-b8), which has the full
list of what it is meant to stop. Workspace trust is a separate check; see
[workspace trust](trust.md).

Only agents that run in Claude Code or Codex use the sandbox. An agent in
Halonic's own harness starts no program, so it has none.

Today neither `halonic run` nor Studio runs an agent in Claude Code or Codex.
`halonic run` checks the sandbox and then stops with exit 9, because it can't
run those agents yet (requirement `cli.run-sandbox-gate`), and Studio doesn't
start the agent host. This page describes the fence those runs will use.

## What it is

The sandbox is `adapters/sandbox-srt`, built on
[sandbox-runtime](https://github.com/anthropics/sandbox-runtime) (srt). It
gives a program a fence made of the operating system's own controls:
bubblewrap on Linux, Seatbelt on macOS, and on Windows a sandbox user account
with network filters. The program gets only the environment variables its
profile names, can write only to its working, temp and settings folders, and
reaches only the Halonic bridge and the sites you allowed for that agent.

Before a session starts any program, it proves the fence: a canary file the
fence must hide and a canary loopback port it must block
([the proof](../adr/2026-11-09-sandbox-fence-proof.md)). A session that isn't
`fenced` starts nothing.

## No sandbox, no run

If the sandbox can't start, the step doesn't run, and no option makes it
(requirements `cli.sandbox-gate` and `cli.run-sandbox-gate`). The one exception
is an agent you chose to run on this computer; see
["This computer" has none of it](#this-computer-has-none-of-it). The CLI ends
with exit 9 and names one reason code: `windows`, `container`,
`user-namespaces-restricted`, `bubblewrap-missing`, `linux-tools-missing` or
`other`. When more than one applies, the first in that list wins, because its
fix comes first ([the reason codes](../adr/2026-11-09-sandbox-check-reason-codes.md)).

## The limits

- **It's a fence, not a virtual machine.** The operating system's kernel is
  shared with the program, so a kernel bug can break out of it.
- **There are no CPU or memory limits.** A profile's only limit on
  resources is a time limit for the whole run (`timeLimitMs`). A program can
  use all the CPU and memory it can get until the run is cancelled or times out.
- **Inside the working folder, anything goes.** The program can change any file
  there without asking. Keep work you can't lose in git.
- **Allowed sites see what the agent can read.** The fence checks a site's
  name, not what is sent to it.
- **Only blocked sites reached through the proxy have a name.** The run page
  names each site a step was refused, once, with its tries. A program that
  connects without the fence's proxy is still refused, but the log has no site
  name for it, so in 0.1 the run page shows no row for it. A blocked site gets
  no connection on any system; on Windows, the name may still be looked up.
- **It doesn't stop the steering.** A model tricked by a mail or a web page is
  still tricked. The sandbox limits what the steered agent can reach.
- **Linux in a container can't use it.** Bubblewrap can't nest in Docker or
  Podman, so the check reports `container`. Ubuntu 24.04 and later may
  report `user-namespaces-restricted` until an AppArmor profile for `bwrap` is
  added.
- **macOS depends on `sandbox-exec`.** Apple marks it deprecated.
- **WSL 2 counts as Linux** and gets the Linux fence.

## Windows is a preview

On Windows the fence uses srt's alpha Windows mode (decision D44). It works
only after srt's one-time install, run once as an administrator, and it has no
`env`, `sh` or process group, so the launcher builds one `cmd.exe` command line
and stops a program with `taskkill`. A program, argument or variable with a
double quote, a percent sign, a line break or a NUL is refused. The CI job `sandbox-windows` proves the fence on a real Windows machine. Without the install the check reports `windows`, and the CLI says to
use Halonic inside WSL 2.

## "This computer" has none of it

Nothing offers this choice yet: Studio has no screen for it and the CLI has
no command that makes one. Today the CLI only reads such a choice. The limits
below describe the choice once Studio offers it.

The choice is per agent and per computer: run an agent on this computer
without the sandbox. That agent runs with all your rights: it can read your keys
and Halonic's own data, change any file you can and reach any address. The
choice lives in your profile folder, never in the workspace. It is bound to the
exact bytes of the agent's file, so a changed file goes back to the sandbox, and
it doesn't carry to another computer. The CLI reads these choices and prints a
`!` line before the run.

## Related decisions

- [A session proves its fence](../adr/2026-11-09-sandbox-fence-proof.md)
- [Sandbox check reason codes](../adr/2026-11-09-sandbox-check-reason-codes.md)

## Keeping this page true

A pull request that changes the sandbox adapters, the profile, the reason
codes or the gate updates this page and
[threat model 4.6](threat-model.md#46-agents-in-a-sandbox-b8) together.
