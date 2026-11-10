# harness-codex.subagents

- Status: active
- Since: 0.1.0
- Source: HAL-3636, HAL-4131, HAL-4213 (Codex 0.166.0 has `multi_agent` on by default; protocol from `codex app-server generate-json-schema`, recorded sessions in `src/fixtures/`)

The Codex harness shall report the subagents Codex starts as Halonic agents. When a `spawnAgent` call of an agent completes, the harness shall report `agent.started` for the new subagent, with the prompt it was given and the agent that started it as `parent`. Each subagent shall get a name of its own: "subagent" for the first, then "subagent-2", "subagent-3" and so on. The tool calls in a subagent's thread shall be reported as the task agent's are, with the subagent as `agent`. When a subagent's turn completes, the harness shall report `agent.finished` with the same `parent` and the last thing the subagent said as output; when it failed or was interrupted, the output shall say so, and the run shall go on. When a subagent that finished is given another task (`sendInput`), its next turn shall start with `agent.started` again, with that task as the prompt; a task sent while the subagent is still working is taken into its current turn and shall not be the prompt of a later start. When the task agent finishes while subagents are still working, the harness shall report `agent.finished` for each of them, newest first, with an output that says the task agent finished first, before the task's final `agent.finished`; when the task agent's turn failed or was interrupted, it shall report them the same way before the run ends with the error. Codex's other subagent calls, such as `wait` and `closeAgent`, shall give no event.

## Examples

- Given the task agent "writer" spawns two subagents, and each runs one command and answers,
  when the notifications are read,
  then the events are `agent.started` for "subagent" and "subagent-2" with `parent` "writer", their commands as `tool.called` and `tool.result` with their own name as `agent`, `agent.finished` for each with `parent` "writer" and its answer, and the task's final `agent.finished`.
- Given a subagent that answered and is then sent "Count the lines of notes/b.md.",
  when its next turn starts and completes,
  then the events are `agent.started` with that prompt, its command, and `agent.finished` with its new answer.
- Given a subagent whose turn failed,
  when its `turn/completed` is read,
  then the event is `agent.finished` with `parent` and an output that says Codex stopped with an error, and the run doesn't end.
- Given a subagent that is sent "Read tuesday.md too." while it is still working,
  when its turn completes and a later turn starts,
  then that later `agent.started` doesn't have "Read tuesday.md too." as its prompt.
- Given the task agent finishes while "subagent" and the subagent it spawned, "subagent-2", are still working,
  when the task's `turn/completed` is read,
  then the events are `agent.finished` for "subagent-2", then for "subagent", each saying the task agent finished first, then the task's final `agent.finished`.
- Given the task agent's turn fails while "subagent" and the subagent it spawned, "subagent-2", are still working,
  when the task's `turn/completed` is read,
  then the events are `agent.finished` for "subagent-2", then for "subagent", each saying the task agent finished first, and the run ends with the turn's error.
