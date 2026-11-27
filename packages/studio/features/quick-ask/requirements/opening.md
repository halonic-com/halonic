# quick-ask.opening

- Status: retired
- Since: unreleased
- Source: HAL-19821, after the board's check of quick ask on Windows (HAL-19376); the kit's skeleton bars as Messenger's chat list shows them (`messenger.load-states`); retired for `quick-ask.box-states` (HAL-19510), which draws the question row at once with the text box focused and keeps the "Loading your agents" announcement

While the quick-ask box reads the agents to ask, it shall show its hint row "Enter ask · Tab another agent · Esc close" at once and, after 300 ms, the kit's skeleton bars in the question row's shape, the agent's picture and a text line, hidden from screen readers, which hear "Loading your agents". When the agents arrive, the box shall show the text box, the agent and **Ask** in the bars' place.

## Examples

- Given the agents still on their way,
  when the box has shown for 300 ms,
  then it shows the skeleton bars and the hint row, and a screen reader hears "Loading your agents".
- Given the box showing its skeleton bars,
  when the chat with Chief arrives,
  then the text box says "Ask Chief anything".
