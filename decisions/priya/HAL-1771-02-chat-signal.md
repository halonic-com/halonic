# Decision: Stop is passed on to the model turn and the tools

- Requirement: `app.chat-stop` (`packages/core/app/requirements/chat-stop.md`)
- Task: HAL-1771, a follow-up from the review of HAL-1539
- Approval: the maintainer asked for this change in HAL-1771 and approves this note in review

## What changes

1. **The requirement no longer says `RunExecutor.chatTurn` can't cancel a model turn.** Since
   `ports.chat-turn-signal`, `ChatTurnRequest` takes an optional `signal`. The chat service now
   passes the answer's signal on to each model turn and, as a new optional second argument of
   `ChatTool.call`, to each tool call.
2. **Two examples are added**: the signal reaches the model turn and the tool, and an answer
   from an executor that ignores the signal is still dropped.

## What stays

Nothing the requirement promised is taken away. No further turn or tool call starts after Stop, a
late answer is still dropped, the calls left still get "Not run: the person stopped the chat.", and
the messages added before the stop are kept. `ChatSettings` leaves out `signal`, so the stop
signal has one way in: `ChatAnswerRequest.signal`.

## Tests

The existing `app.chat-stop` tests are unchanged. New tests check that every model turn's request
and every tool call get the answer's signal, and that an answer that comes after Stop from an
executor that ignores the signal is dropped. No test was dropped or weakened.
