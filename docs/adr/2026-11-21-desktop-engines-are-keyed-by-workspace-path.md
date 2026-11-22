# Desktop engines are keyed by workspace path, under one supervisor, whatever window or app profile opens them

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

[Desktop engine in its own process](2026-11-20-desktop-engine-runs-in-its-own-process.md)
records the engine role, the control pipe, the engine's HTTP API, secrets, trust
and lifetime. After that record was written, the board decided four more things
on 20 Nov (HAL-14206, decisions D10 to D13): how several engines are shown and
run, where per-computer state lives, app profiles, and Code's layered workspace
with one inbox. The security review of that record also asked it to say what the
shell sends on the control pipe, how approvals reach the engine, and which
earlier decision it reverses.

That earlier decision is HAL-13318 (#3916): in 0.1 the desktop engine ran in the
page, and `shell.engine-start` was parked as a draft requirement. The record of
20 Nov reverses it for desktop.

## Decision

**What the shell sends on the control pipe.** The pipe is a closed set of kinds
both ways. From the shell to the engine there are three:

- the sandbox host's connection: its URL and launch token, or the WSL relay port.
  That token is the agent host's own launch token, and the shell sends it nowhere
  but this pipe;
- "stop", which starts Quit's shutdown for that engine;
- the answer to a secret, token or origins request: the value, or a refusal with
  its reason, by request id.

The shell sends nothing else, and the engine treats anything else as a fault and
exits.

**Approvals go to the engine.** The engine calls the sandbox host's harness
bridge directly, with the connection it got on the pipe, so remote decisions come
back to the engine that owns the run. An approval card in a window answers
through `POST /api/runs/<id>/events`. The first answer wins, as today.

**One supervisor, the Workspaces window.** One engine per workspace, several at
once. A supervisor in the shell owns the set: it starts, tracks, restarts and
stops them, and the restart limit counts per engine. Quit stops them all. The
Workspaces window lists every workspace the profile remembers, running ones
first, with Start for a stopped one and Open in Studio for every one. An engine
started from the terminal shows as "Running in Terminal", found read-only through
`engine.lock`'s `holder.pid`; it gets Open in Studio but no Stop, because the
shell never signals a process it didn't start. The tray menu is Open Code, Open
Studio, Workspaces… and Quit Halonic, and the background process is named
Halonic.

**State is keyed by the workspace's path.** `.halonic/` holds only the project's
shared workspace. Approvals, review records, run history and `engine.lock` move to
the app's data on this computer, one folder per workspace, keyed by the
workspace's canonical path, never by a file inside the workspace. User plugins and
settings move from `~/.halonic/` to the per-user app folder. One resolver maps a
workspace path to its state folder, and the CLI, the engine role and the shell
all use it; it exists before the move, pointing at today's location, so the move
is one change in one place. Until 1.0 the old layout is still read, with a
one-time move, and terminal detection checks both locations.

**A window is an app profile on a workspace.** An app profile says which sections
show, the default agent and the window name. Studio and Code are profiles; Code's
own agents and workflows are an ordinary workspace, and there are no Code-only
code paths. The supervisor keys engines by workspace only, so a Studio window and
a Code window on one folder share one engine and one lock. The engine, its
routes, secrets and trust don't depend on the profile. Open Code starts no engine
for cloud runs.

**Code's workspace has two layers.** A Code session's engine loads an ordered
list of layers: Code's own workspace at the bottom, shipped with the app, and the
project's `.halonic/` on top. The bottom layer is never written and needs no
workspace trust, because it ships signed with the app; the project layer goes
through the trust checks as before. Rights come from where a run happens, not
from the layer its agent came from: a local run gets local rights and the shell's
secret rules, and a cloud run gets the cloud's.

**One inbox.** Approvals stay with the run that asked: local runs in the
per-computer state, cloud runs in Halonic Cloud. Code's window has one inbox with
three sources, each item labelled "This computer" or "Halonic Cloud" with what
started its run: local sessions from the engine's waiting-runs route, cloud
sessions, and cloud work started by a trigger. The `RemoteEngine` is the local
source; the cloud sources come later.

## Consequences

- The shell's supervisor, not a window, owns every engine. Window code opens and
  closes views; it never starts or stops an engine itself.
- Nothing per computer is written inside a workspace once the move lands, so a
  workspace's contents can't change its own approvals, run history or lock. The
  security review of the move covers the state folder's permissions.
- Adding a profile adds no engine code. A test opens a Studio window and a Code
  window on one folder and expects one engine.
- The engine loader takes layers, and a test checks that the bottom layer is
  never written and skips the trust check only because it ships with the app.
- Inbox items carry a source. Until the cloud sources land, every item is "This
  computer".
- The engine and shell READMEs still describe HAL-13318's page engine, and
  `shell.engine-start` is still parked. The steps that build the engine role
  update them in the same pull request as the behaviour.
- Users generating their own desktop apps from profiles is out of scope here.

## Changed from an earlier decision

[Desktop engine in its own process](2026-11-20-desktop-engine-runs-in-its-own-process.md)
named one supervisor and terminal engines in passing. This record adds the
Workspaces window, the tray menu, the per-computer state folder keyed by
workspace path, app profiles, Code's layers and the one inbox, and states what
the shell sends on the control pipe and how approvals reach the engine. Nothing
in the earlier record is undone. Both records together reverse HAL-13318 (#3916)
for desktop: the engine no longer runs in the page.
