# agents.chat.reply-ends

- Status: draft
- Since: unreleased
- Source: HAL-13177; flow-agents 4.4; microcopy 8.3; states (HAL-5896) section 4, H13, H23, H24, decision D4; HAL-915

When a Try it reply fails before any tool was called, the chat shall end it with the agent's line in `danger`, "*Sorter*'s reply failed: *reason*.", and **Try again**, which takes the reply back, sends the same message again with the conversation as it was before it, and puts focus in the box. When the engine stops answering while it answers, the line shall read "Stopped when Halonic's engine stopped." with **Try again** once the engine answers again (`agents.chat.engine-quiet`). When either happens after a tool was called, the line shall add "Some tool calls already ran. Send a new message to continue." and offer no Try again, since sending again could repeat what the tool did. Only the last reply shall offer Try again. A reply that was answered shall have no end line.

## Examples

- Given a reply that fails with "Anthropic was busy" before any tool call,
  when it ends,
  then it reads "Sorter's reply failed: Anthropic was busy." with Try again, and the failure is announced assertively.
- Given that reply,
  when the person clicks Try again,
  then the same message is sent again, once, with the conversation before it, and focus is in the box.
- Given a reply that called a tool and then the engine stopped answering,
  when it ends,
  then it reads "Stopped when Halonic's engine stopped. Some tool calls already ran. Send a new message to continue." with no Try again.
