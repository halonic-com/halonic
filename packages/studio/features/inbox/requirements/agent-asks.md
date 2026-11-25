# inbox.agent-asks

- Status: active
- Since: unreleased
- Source: HAL-18557; design review HAL-18481, improvement 7 and flow 5.2 (approved by the board on HAL-10)

An agent's card in the Inbox shall say who asks over its title, with their picture: "Chief · Chief of Staff asks" when the source gives the agent a title, and "Chief asks" when it doesn't. When the question is one line, the card shall show it once, as its title, and not again under it.

## Examples

- Given a one-line question from Chief, whose title is Chief of Staff,
  when you open it,
  then the card says "Chief · Chief of Staff asks" over the question, and the question shows once.
