# Decision: the host reads Paperclip every 5 seconds while a chat waits for its agent

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19388
- Kind: user-visible

`agent-host.paperclip-polling` said the host reads Paperclip about every 30 seconds while Studio is
in front. A short agent reply could start and finish between two reads, so the board never saw
"Chief is typing…" (HAL-19362, reported on HAL-10). The requirement now adds: for 3 minutes after
the person sends, while that conversation waits for its agent (the agent is working on it, or hasn't
answered since the person's message), the host reads about every 5 seconds, with one extra read of
the conversation list and none of a conversation's messages,
and goes back to 30 seconds once nothing waits or the 3 minutes are up. The 30-second, 5-minute and
come-to-the-front rules don't change, timers still go through the `Scheduler` port, and no test was
weakened: the change adds two examples and their tests.

## Covers

- agent-host.paperclip-polling
