# quick-ask.session

- Status: active
- Since: unreleased
- Source: HAL-18625 (board's approval of the HAL-18594 design, section 5)

When the quick-ask box opens, the Quick Ask feature shall offer every agent the person has a 1:1
chat with in Messenger, pick the agent the person asked or picked last, or else the first one, and
show the text the person typed and didn't send. When there is no such agent, the feature shall say
there are no agents. When the person sends a question, the feature shall send it as a normal message
in the 1:1 chat with that agent through Messenger, keep no copy of it, and clear the box's text.
When the question isn't sent, the feature shall keep the text in the box with the reason. The
feature shall keep the picked agent and the unsent text in the page's storage, not in memory, so
they survive the box's window being closed and made again.

## Examples

- Given chats with Chief and Liam, and Liam asked last,
  when the box opens,
  then Liam is picked.
- Given the person typed "Where are we?" and closed the box,
  when the box opens again in a new window,
  then "Where are we?" is in the box.
- Given Paperclip · Acme is offline,
  when the person sends a question to its agent,
  then nothing is sent, the reason is "offline" and the text stays.
