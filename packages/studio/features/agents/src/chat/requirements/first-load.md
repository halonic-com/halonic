# agents.chat.first-load

- Status: draft
- Since: unreleased
- Source: HAL-13177; states (HAL-5896) section 4, H7 and H11; flow-agents 3.1 (page states); Sofia's design check C516 (HAL-14955), S-4

The Try it chat's first load shall be the agent's, since a Try it chat isn't kept in v0.1, so the agent page shall show one state for it, flow-agents 3.1's: while the agent is read, nothing for 300 ms, then the skeleton with the screen-reader label "Loading <name>", and after 10 seconds "Still loading" with **Try again**; when the agent can't be read, "Couldn't load this agent" with the reason under it, such as "The engine isn't answering. It may still be starting.", and **Try again**. The state shall show in the panel, and the chat shall show nothing meanwhile; while the panel doesn't show beside the chat (closed, or a narrow tab), the chat shall show the state instead. **Try again** shall read the agent and its settings again, and when they are read the agent's name shall take the focus. Once the agent is read, the chat shall show its empty draft (H2).

## Examples

- Given the engine isn't answering when the agent page opens,
  then the panel shows "Couldn't load this agent · The engine isn't answering. It may still be starting." with Try again, and the chat shows nothing.
- Given that page, when the engine answers and the person presses Try again,
  then the chat shows its empty draft and the agent's name has the focus.
- Given that page with its panel closed,
  then the chat shows "Couldn't load this agent" with Try again.
