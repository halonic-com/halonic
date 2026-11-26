# quick-ask.box-states

- Status: active
- Since: unreleased
- Source: HAL-19510, the states designed on HAL-19384 for the approved box (words checked on HAL-19391; fallback states on an approved screen, team decision under HAL-2282)

While the quick-ask box reads the agents, the box shall show its top row at once, with the text box
focused and taking typing, the placeholder "Ask an agent", a skeleton in place of the agent button,
drawn after 300 ms, when screen readers hear "Loading your agents", and **Ask** sending nothing. When the agents arrive, the box shall keep the text typed meanwhile.
If the agents can't be read, the box shall say "Couldn't load your agents" and "Studio didn't
answer." with **Try again**, which reads them again, and **Open Studio**, and shall keep the text
typed so far. When no agent's name holds the picker's search, the picker shall say
`No agent matches "{text}"` in place of the list and keep the search. When the person presses
**Try again** on a question that wasn't sent, the box shall say "Sending…" under the question,
without the danger edge, until it is sent or fails again. When the person presses **Copy**, the
box shall show "Copied" for 2 seconds and say it once to screen readers; if the clipboard refuses,
the box shall show "Couldn't copy" for 2 seconds.

## Examples

- Given the agents still being read,
  when the box has shown for 300 ms,
  then it shows the agent's skeleton and a screen reader hears "Loading your agents".
- Given the agents still being read,
  when the person types "Where are we?",
  then the text box holds it, and still holds it once the agents arrive.
- Given the agents can't be read,
  when the box opens,
  then it says "Couldn't load your agents" and "Studio didn't answer." with Try again and Open Studio.
- Given the picker open,
  when the person types "zed",
  then the picker says `No agent matches "zed"`.
- Given a question that wasn't sent,
  when the person presses Try again,
  then the box says "Sending…" until Messenger answers.
- Given an answer,
  when the person presses Copy,
  then the link reads "Copied" for 2 seconds.
