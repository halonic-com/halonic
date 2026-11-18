# agent-host.gateway-run-ledger

- Status: active
- Since: unreleased
- Source: HAL-10827 (follow-up of HAL-5685)

The agent host shall keep, for each harness run it has going, a session for the remote gateway whose id is the id the host gave the run. A session shall hold its events numbered from 1 by one, never reused: the prompt and each later answer as `message` events, an `approval-requested` event for each approval the harness reports as an event of the run (the ones Codex asks) and for each approval the bridge of the run asks Studio for (Claude Code's, and those for Halonic's own tools for every harness), found by the engine's run and the agent; a bridge call that ends without a decision settles as denied, an `approval-settled` event for each decision, a `state` event when the session goes between `running` and `waiting` and when it ends as `done` or `failed`, and the task agent's result as an agent `message`. The agent host shall judge each approval's risk itself, from the tool alone: `risky` for every tool for now, as even a read can reach a secret outside Halonic's fence. The approval's summary names the tool and its arguments as the desktop card does, shortened to 300 characters; the gateway's transport protects it. It shall keep at most 500 events of a session, dropping the oldest first but never one from the oldest approval that waits, and answer a watch from a `seq` whose next event is gone, or that is past the last event, with `history-gone`, and end a watch whose unseen events were trimmed the same way. When a run ends with an approval nobody decided, the agent host shall settle it as denied. It shall pass an answer that comes from a phone to the run through the same call as one from Studio; an approval is not such an answer, as it must be decided where Studio's engine decides it; until the host can tell Studio, a phone can't answer an approval of the bridge. A fault in the ledger shall never fail or hold up the run it records.

## Examples

- Given a run whose agent asks to run a shell command,
  when the agent host records the request,
  then the session holds an `approval-requested` event with risk `risky` and the state is `waiting`.
- Given a session whose first events are gone,
  when a phone watches from a `seq` before the oldest kept one,
  then it gets `history-gone`, and from `seq` 0 it gets the oldest kept event.
- Given a run that ends while an approval waits,
  when the run ends,
  then the approval is settled as denied before the session is `failed` or `done`.
