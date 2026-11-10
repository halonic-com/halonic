# studio.inbox-real-runs

- Status: active
- Since: 0.1.0
- Source: HAL-1218 ("Done when"); the restart case from HAL-1257

When a real run on the local engine stops at a tool call that needs your OK, the Studio's Inbox shall show one item for that call and count it, approving it shall run the tool, rejecting it shall pass the refusal with your note back to the agent, and without an answer the run shall keep waiting with its item, also after the engine starts again on the same run store.

## Examples

- Given a run whose agent calls the `write` tool `publish`,
  then the Inbox has one item for `publish` and the count is "1 waiting", and `publish` hasn't run.
- Given that item,
  when you approve it,
  then `publish` runs, the agent gets its result, and the run's review step shows as an item with the agent's reply as its body.
- Given that item,
  when you ask for changes with "Not today",
  then `publish` doesn't run and the agent gets "Refused: a person rejected the call and wrote: Not today".
- Given that item and nobody answering for 30 days,
  then the run still waits and the item is still there.
- Given that item on a run store in a folder,
  when a new engine starts on the same folder and you approve the item there,
  then `publish` runs.
