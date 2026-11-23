# The sandbox's limits

What the sandbox is and what it is not. Read it with the
[threat model](threat-model.md#46-agents-in-a-sandbox-b8), which has the full
list of what it is meant to stop. Workspace trust is a separate check; see
[workspace trust](trust.md).

Three kinds of program use the sandbox: an agent that runs in Claude Code or
Codex, the program of a workspace `stdio` connector that a run starts
(requirement `cli.connector-sandbox`, in the CLI and in the agent host), and a
plugin's local tools. An agent in Halonic's own loop starts no program, so
it has none.

Which commands run an agent in Claude Code or Codex depends on the version.
Halonic 0.1.0 runs none. On `main`, which isn't released yet, `halonic serve`
runs them (requirement `cli.commands.serve.harness`), and so does Studio, in
the agent host's sandbox (#3518). Studio refuses such an agent as
`unavailable` only when no agent host runs. `halonic run` checks the sandbox
and then starts them, keeping what they change as a proposal for `halonic
proposals` (requirement `cli.run-proposal`). `halonic routines watch` still
refuses a routine whose agent runs in a harness.

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
`fenced` starts nothing. The one exception is a session that has no fence by
design (`off`), which starts a program you chose to run without the sandbox
([sandbox without a fence](../adr/2026-11-11-sandbox-without-fence.md)).

## No sandbox, no run

If the sandbox can't start, an agent in Claude Code or Codex doesn't run, and
no option makes it (requirements `cli.sandbox-gate` and `cli.run-sandbox-gate`).
The one exception is an agent you chose to run on this computer; see
["This computer" has none of it](#this-computer-has-none-of-it).

A connector is different. Where the sandbox doesn't work, a run's `stdio`
connector starts on this computer as before, without the fence, under the
connector file's trust line (decision D45, requirement `cli.connector-sandbox`).
A plugin's local tools and local
integration code don't start without the fence unless you said yes to that on
this computer, and the agent host never starts a plugin's backend without it.

You give that yes in Studio, in the trust check that asks for it or with
**Allow…** in Settings › Agent sandbox, and Studio saves it in your profile on
this computer, for the reason the sandbox can't
start right then. It's one yes for the whole computer: it covers every
workspace you trust and every plugin, not only the one whose check asked.
The `halonic` command reads the same yes, except on Windows with the WSL
sandbox (below): it runs a workspace's local integrations without the sandbox
only with it, checks it
again at every start, and warns on stderr when it does. It never gives the yes
itself, and it doesn't use it for plugin backends. On a computer without
Studio, such as a server or a container, plugins and integrations run only in
the sandbox.

On Windows with the default sandbox, WSL, Studio's agent host runs in
Halonic's WSL distro with its own profile, so the yes applies to Studio only:
the command in a Windows terminal reads your Windows profile, never sees it,
and still runs integrations only in the sandbox. Where the sandbox can't start,
its refusal says so and ends with "on Windows, integration code can't run in
the sandbox in this version of Halonic. Use Halonic inside WSL 2 on this
computer." The command shares the yes only when your saved sandbox choice isn't
the WSL one.

When the sandbox stops an agent, the CLI ends with exit 9 and names one reason
code: `windows`, `container`, `not-supported`,
`blocked-by-policy`, `virtualisation-off`, `wsl-missing`, `restart-needed`,
`distro-missing`, `runtime-missing`, `setup-conflict`, `setup-needed`,
`user-namespaces-restricted`,
`bubblewrap-missing`, `linux-tools-missing`, `ripgrep-missing`, `sign-in-needed`
or `other`. When more than one applies, the first in that list wins, because its
fix comes first: what Halonic can't fix, then what an administrator can, then
what you can do in one step ([the first reason codes](../adr/2026-11-09-sandbox-check-reason-codes.md),
and [the rest](../adr/2026-11-11-pluggable-sandbox-layer.md)). The CLI also has
a code of its own, `windows-node-in-wsl`, for Windows' Node.js started from a
WSL folder.

The CLI and Studio give different fixes for two of these codes,
`runtime-missing` and `setup-conflict`, on purpose.
With the WSL sandbox, the command in a Windows terminal can't run integration
code in the sandbox at all, so for `distro-missing` and `runtime-missing` it
says to use Halonic inside WSL 2. With srt's Windows mode (the sandbox choice
that isn't WSL) it can, so `setup-conflict` is the one it answers with a
command, below. Studio starts the sandbox itself, so it says the same for
`distro-missing`, but for `runtime-missing` it says to choose **Check again**
and, if the setup still doesn't finish, to reinstall the Halonic desktop app.
For `setup-conflict` both say to remove the other program's sandbox setup
first. Then the CLI says to run `halonic sandbox setup`, and Studio says to set
up the sandbox in Settings.

## The limits

- **It's a fence, not a virtual machine.** The operating system's kernel is
  shared with the program, so a kernel bug can break out of it.
- **There are no CPU or memory limits.** A profile's only limit on
  resources is a time limit for the whole run (`timeLimitMs`). A program can
  use all the CPU and memory it can get until the run is cancelled or times out.
- **Inside the working folder, anything goes.** The program can change any file
  there without asking. Keep work you can't lose in git.
- **An agent's settings folder is writable, and its sign-in is kept between
  runs.** The program can change anything in it during a run. Before each run,
  Halonic clears the folder down to its own settings files and the program's
  sign-in (`harness-kit.settings-folder-reset`), so instructions, skills,
  agents, commands or command rules a run leaves there don't reach the next
  run. The sign-in files stay as the last run left them: for Claude Code that
  includes `.claude.json`, its own file for the account. Within one run, what
  the program writes there can change how it behaves for the rest of that run.
- **Allowed sites see what the agent can read.** The fence checks a site's
  name, not what is sent to it.
- **A connection straight at an address isn't reported.** The sandbox reports
  each site it refuses: the run log records it as `sandbox.blocked`, and
  Studio's run page lists it under Blocked sites. A connection the sandbox
  stops below its proxy, such as one straight at an IP address on Windows, is
  refused but not reported, because only the proxy knows the name that was
  asked for. A blocked site still gets no connection on any system; on
  Windows, the name may still be looked up.
- **A live run's program copy controls which code runs, not what it can
  reach.** A run that reads the live version starts a connector's program in a
  copy of the workspace at that version, so a change that isn't live, such as a
  script an agent wrote, never runs before someone made it live. The copy is
  no fence: don't assume it confines anything. An agent in a harness writes its
  files in a proposal folder of its own, a different folder from any copy a
  connector starts in, and what it changed comes back as a proposal to review.
  Two limits follow from it being a copy of what is committed: an unpinned
  connector that needs `node_modules` or `.venv` fails in a live run, which is
  safe but must be fixed by pinning or committing what it needs, and on Windows
  a deep profile path can make the copy fail.
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
double quote, a percent sign, an exclamation mark, a line break or a NUL is refused. The CI job `sandbox-windows` proves the fence on a real Windows machine. Without the install the check reports `setup-needed`, and the CLI says to
run `halonic sandbox setup`, which runs that install with one administrator
prompt. Studio's Settings › Agent sandbox
runs the same install.

Removing the sandbox (Settings › Agent sandbox, or the uninstaller) also takes
back the write access srt kept on your folders between sessions. A removal that
runs with administrator rights, such as an uninstall started as administrator
or a silent uninstall from an elevated prompt, can't do that part safely, so it
leaves it for later and writes nothing in your profile.

Halonic takes that access back later only when it runs on Windows itself, as
you and without administrator rights. The installer does it when you install
Halonic again normally, not as administrator, whichever sandbox is chosen and
whether or not "Set up the agent sandbox" is ticked: it takes the access back
first, before its sandbox step sets srt's sandbox account up again. Studio with
the Windows sandbox chosen, or a `halonic` command installed on Windows, does
it at its next start or before you set the sandbox up again. Studio's agents in
WSL (the default when nothing is chosen) and a command line inside WSL don't,
because neither can reach srt's Windows account. None of them does while srt
still lists its sandbox account, or when Halonic can't read srt's status.

The words after a removal follow those two cases. "Its access to your project
folders ends the next time you start Halonic without administrator rights"
(`keptAccess: until_next_start`, srt's sandbox account is gone) is true when you
start Halonic on Windows itself, as you, as above; Studio's agents in WSL and a
command line inside WSL don't end it. The uninstaller, after which Halonic is
gone, says instead that it has that access "until you install Halonic again
normally, not as administrator". "It may still have access to some of your
project folders" (`manual`, srt still lists its sandbox account, or its status
can't be read) means a start or installing again may not end it.

An uninstall started as administrator, or a silent one from an elevated
prompt, can't read srt's status: it starts only Halonic's signed helper, never
the agent host in the install folder, which anyone could swap. So it can't tell
whether any access was kept, and its last page always gives the `manual` words
and steps. Those steps end the access in either case, because installing again
normally takes back what an earlier removal left before the sandbox is set up
again.

For `manual` the fix is the same everywhere: remove the sandbox again without
administrator rights. Only that removal takes the access back; a start
doesn't, so quitting Halonic and opening it again is not enough on its own.
Each place says how to do it from there:

- `halonic sandbox remove`: run `halonic sandbox remove` from a terminal that
  isn't running as administrator. That works only in a terminal on Windows
  itself, not inside WSL. Running it again is fine after a removal.
- Settings: quit Halonic and open it again normally, not as administrator, then
  remove the sandbox in Settings › Agent sandbox. While srt still lists the
  access with its sandbox account, Settings offers **Remove the sandbox…**
  under **Needs setting up** too (`accessKept` on the check), so you don't
  have to set the sandbox up again first.
- The uninstaller's last page, for when Halonic is already gone: install
  Halonic again with "Set up the agent sandbox" on, then uninstall it normally,
  not as administrator. A normal uninstall runs without administrator rights,
  so its removal takes the access back. To keep using Halonic, install it
  again afterwards.

For `until_next_start`, a start is enough: Settings says to quit Halonic and
open it again normally, not as administrator. The CLI names its `manual` step
there too, `halonic sandbox remove` from a terminal that isn't running as
administrator, because a removal without administrator rights also takes the
access back and a user can check that it ran.

## "This computer" has none of it

You can choose to run an agent on this computer, without the sandbox. You make
the choice in the desktop app, on the agent's Harness page under **Where it
runs**: **On this computer** opens a warning, and nothing is saved until you
confirm with **Run on this computer**. Settings › Agent sandbox › **New agents
run** makes the same choice for each agent the desktop app creates. Studio in a
browser can't make it, and the CLI has no command that makes it; the CLI only
reads it.

That agent runs with all your rights: it can read your keys and Halonic's own
data, change any file you can and reach any address. The choice is per agent
and per computer. It lives in your profile folder, never in the workspace, so it
doesn't carry to another computer. It is bound to the exact bytes of the agent's
file: once the file changes, even only its whitespace, the choice is on hold and
the agent runs in the sandbox again until you confirm again (**Review and
confirm** on the Harness page). While it's on hold, any `halonic` command that
would start it first prints a `!` line that says so and where to confirm again.
When the sandbox can't start, the refusal says the agent needed it because its
file changed, and doesn't offer the choice as a way out.

What starts such an agent:

- `halonic serve`, `halonic run` and `halonic runs send` (which lets a waiting
  run go on) start it without the sandbox, and print a `!` line for it before
  it starts: "Writer runs on this computer without the sandbox, as chosen on
  9 Nov."
- Studio starts it through the agent host (HAL-13195), with the launcher the
  CLI uses, once the host's own gate passes: the workspace is trusted, the
  person's choice is for the agent's saved file as it is now, and the profile
  is one the host built for that agent. Where the host offers no such session
  (on Windows, or without a profile folder), Studio's run fails before the
  agent's program starts, and the Harness page says so under **On this
  computer**: "Studio can't start it this way yet; halonic in a terminal on
  this computer can."
- `halonic routines watch` refuses a routine whose agent runs in Claude Code or
  Codex, wherever that agent runs, so it doesn't start this one either (exit 9).

## Related decisions

- [A session proves its fence](../adr/2026-11-09-sandbox-fence-proof.md)
- [Sandbox check reason codes](../adr/2026-11-09-sandbox-check-reason-codes.md)
- [The pluggable sandbox layer](../adr/2026-11-11-pluggable-sandbox-layer.md)
- [Sandbox without a fence](../adr/2026-11-11-sandbox-without-fence.md)

## Keeping this page true

A pull request that changes the sandbox adapters, the profile, the reason
codes or the gate updates this page and
[threat model 4.6](threat-model.md#46-agents-in-a-sandbox-b8) together.
