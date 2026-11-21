# agents.chat.first-load

- Status: draft
- Since: unreleased
- Source: HAL-13177; states (HAL-5896) section 4, H7 and H11; microcopy 14.1 and 2

The Try it chat's first load shall be the agent's, since a Try it chat isn't kept in v0.1. While the agent is read, the chat shall show nothing for 300 ms, then three still skeleton lines with the screen-reader status "Loading this chat", and after 10 seconds "Still loading" with **Try again**. When the agent can't be read, the chat shall show "Couldn't load this chat" with the reason under it, such as "The engine isn't answering. It may still be starting.", and **Try again**, which reads it again. Once the agent is read, the chat shall show its empty draft (H2).

## Examples

- Given the agent's read takes 12 seconds,
  when the chat opens,
  then it shows nothing for 300 ms, then the skeleton lines, then "Still loading" with Try again.
- Given the engine isn't answering when the chat opens,
  then it shows "Couldn't load this chat · The engine isn't answering. It may still be starting." with Try again.
