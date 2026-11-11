# @halonicjs/adapter-harness-kit

What the harness adapters (`harness-claude-code`, `harness-codex`) share, so
each keeps the `Harness` port's promises in the same way: reading a
program's output line by line, the filter every event passes through on
its way out, writing the agent's settings folder and building each harness
call's sandbox profile.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-kit`

## Reading a program's output

`readLines` reads a sandboxed program's `stdout` as UTF-8, one line at a
time, with `\n` or `\r\n` line breaks. A line longer than `maxLineLength`
ends the reading with an error that doesn't quote it, so a program that
never ends a line can't fill Halonic's memory. The last line is read even
without a line break; bytes that aren't UTF-8 become U+FFFD. When the caller
stops early or a line is too long, the stream is cancelled.

`outputTail(output, keptCharacters)` reads a program's output to its end
and keeps only its last characters: a harness reads standard error this
way, so the program never stalls on a full pipe, and the last line says why
a run failed. A read error is the caller's to handle, for instance
`outputTail(process.stderr, 4_096).catch(() => "")`.

## The event filter

`HarnessEventFilter` removes the run's bridge token from every string in an
event, and from the errors it makes: the token is in the program's
environment, so a tool call such as `env` can print it. It lets the task
agent's final `agent.finished` through once, and nothing after it. That is the
one without a `parent`: a subagent's `agent.finished` doesn't end the run.
`finished` says whether it has passed, and `error(message)` makes an `Error`
with the token removed from its message.

## The settings folder

`writeSettingsFiles(folder, files, writer)` writes a harness's settings
files, by file name, into the agent's settings folder (a harness also uses it
for a run's own files). A file that already
holds the same text is left alone, because the program may watch its
settings and another run of the agent may be reading them.
`diskSettingsFolder` writes on this computer's disk: each file is written
aside and then renamed into place, so a reader never sees half a file; a write that fails removes its
temporary file.
Tests pass a `SettingsFolderWriter` that keeps the files in memory.

## Install folders on Windows

On Windows, the agent host's `--sandbox-setup` doesn't give sandboxed
programs srt's read grant for the user profile, so a harness installed in
it can't start unless the session profile names its folders.
`windowsInstallReadPaths(install, folders)` gives those paths, to add to the
profile's `readOnlyPaths`: the real folder of the program the sandbox starts
(`claude.exe`, or the `node.exe` of an nvm or fnm install) and, for a harness
that runs on Node, its package folder under `%APPDATA%\npm\node_modules`.
Each is named only when it is inside `%USERPROFILE%`; an install in
`%ProgramFiles%` adds nothing. It never names the user profile itself, and
refuses a folder that is the profile or overlaps Halonic's data folder. A data
folder that doesn't exist yet is compared at its real place, so a program at
the target of a junction that leads into where it will be is refused too.
Tests pass a `RealPath` that resolves links without a disk.

## The sandbox profile

`HarnessProfiles` is the engine's `HarnessProfileBuilder`. For each harness
call it builds the sandbox profile from the trusted workspace, Halonic's data
folder and the person's home folder (`HarnessProfilesOptions`), on real paths,
with every link resolved. The working folder is the one the agent's file
names, or `files/agents/<agent id>`, inside the run's proposal folder when it
has one and inside the workspace otherwise; one that leaves that folder or is
in `.git`, a definition folder or Halonic's data is refused. The definition
files at the top are read-only. The profile denies the person's SSH keys,
cloud sign-ins, browser data, password stores and own Claude Code and Codex
settings, and all of Halonic's data folder except the run's own folders
(requirement `harness-kit.harness-profile`). The host gives the agent's file
(`HarnessAgentFile`), the temp folder and the settings folder through
`HarnessProfileHost`. `profileDiskOnThisComputer` is the `ProfileDisk` it uses
by default.

## Example

```ts
import { HarnessEventFilter, readLines } from "@halonicjs/adapter-harness-kit";

const filter = new HarnessEventFilter({ agentId: task.agentId, bridgeToken: bridge.token });
for await (const line of readLines(process.stdout, { maxLineLength: 16_000_000 })) {
  for (const event of filter.pass(eventsOf(line))) yield event;
  if (filter.finished) break;
}
```
