# @halonicjs/adapter-harness-kit

What the harness adapters (`harness-claude-code`, `harness-codex`) share, so
each keeps the `Harness` port's promises in the same way: reading a
program's output line by line, the filter every event passes through on
its way out, and writing the agent's settings folder.

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
a run failed.

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
files, by file name, into the agent's settings folder. A file that already
holds the same text is left alone, because the program may watch its
settings and another run of the agent may be reading them.
`diskSettingsFolder` writes on this computer's disk: each file is written
aside and then renamed into place, so a reader never sees half a file.
Tests pass a `SettingsFolderWriter` that keeps the files in memory.

## Example

```ts
import { HarnessEventFilter, readLines } from "@halonicjs/adapter-harness-kit";

const filter = new HarnessEventFilter({ agentId: task.agentId, bridgeToken: bridge.token });
for await (const line of readLines(process.stdout, { maxLineLength: 16_000_000 })) {
  for (const event of filter.pass(eventsOf(line))) yield event;
  if (filter.finished) break;
}
```
