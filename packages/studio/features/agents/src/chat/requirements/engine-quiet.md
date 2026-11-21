# agents.chat.engine-quiet

- Status: draft
- Since: unreleased
- Source: HAL-13177; states (HAL-5896) section 4, H12 and H13, K1; microcopy 2

When a Try it answer fails because the engine stopped answering, the chat shall keep its transcript and show "The engine isn't answering. Showing what it said last." at the top of it. While that line shows, **Send** shall wait with the line as its reason, the message in the box shall stay, and the last reply shall offer no **Try again**. The chat shall ask whether the engine answers every 5 seconds and when the window comes to the front; the first answer shall clear the line, and Send and Try again shall work again.

## Examples

- Given the engine stopped answering during a reply,
  when the person writes "And this one?" and presses Send,
  then nothing is sent, "And this one?" stays in the box, and Send's reason is the line.
- Given the line shows,
  when the window comes to the front and the engine answers,
  then the line goes and Send sends.
- Given the line shows,
  when the engine doesn't answer the first ask but answers 5 seconds later,
  then the line stays after the first ask and goes after the second.
