# quick-ask.answer

- Status: active
- Since: unreleased
- Source: HAL-18625 (board's approval of the HAL-18594 design, sections 4 and 5)

While the quick-ask box is open after a question was sent, the Quick Ask feature shall read the
chat again each time the agent's source changes, never on a timer, and say whether the agent is
working, has answered (with its messages since the question) or asks the person to choose with a
card made since the question. When the box closes, the feature shall stop reading. When an answer
came after the box closed, the next opening shall offer it as the last answer, with the agent's name
and the time, until the person sees it or forgets it.

## Examples

- Given a question sent to Chief and the box open,
  when Chief's source changes with Chief's reply,
  then the answer is Chief's reply.
- Given a question sent to Chief and an older open card from Chief,
  when Chief starts working,
  then the state is working, not the older card.
- Given the box closed before Chief replied at 13:41,
  when the box opens again,
  then the last answer is Chief's, at 13:41.
