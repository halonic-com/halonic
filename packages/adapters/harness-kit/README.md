# @halonicjs/adapter-harness-kit

What the harness adapters (`harness-claude-code`, `harness-codex`) share, so
each keeps the `Harness` port's promises in the same way: reading a
program's output line by line, and the filter every event passes through on
its way out.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-harness-kit`

## Reading a program's output

`readLines` reads a sandboxed program's `stdout` as UTF-8, one line at a
time, with `\n` or `\r\n` line breaks. A line longer than `maxLineLength`
ends the reading with an error that doesn't quote it, so a program that
never ends a line can't fill Halonic's memory.

## The event filter

`HarnessEventFilter` removes the run's bridge token from every string in an
event, and from the errors it makes: the token is in the program's
environment, so a tool call such as `env` can print it. It lets the task
agent's final `agent.finished` through once, and nothing after it.

## Example

```ts
import { HarnessEventFilter, readLines } from "@halonicjs/adapter-harness-kit";

const filter = new HarnessEventFilter({ agentId: task.agentId, bridgeToken: bridge.token });
for await (const line of readLines(process.stdout, { maxLineLength: 16_000_000 })) {
  for (const event of filter.pass(eventsOf(line))) yield event;
  if (filter.finished) break;
}
```
