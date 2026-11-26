# quick-ask.box

- Status: active
- Since: unreleased
- Source: HAL-18966, plan on HAL-18625 (board's approval of the HAL-18594 design, sections 4–7); the window in `studio.src-tauri.quick-ask-window`

The Quick Ask feature shall add the focused app `ask`, which floats on its see-through window with
no frame. Its box shall be a `dialog` labelled "Ask an agent", with the focus in a text box whose
placeholder is "Ask {agent} anything", the picked agent's button named "Ask {agent}. Change agent",
an **Ask** button, and the hints "Enter ask · Tab another agent · Esc close". Enter shall send and
Shift+Enter shall make a new line. Tab or a click on the agent shall open the picker: a search box
"Find an agent" over the agents only, **Recent** first, then each workspace and team; typing narrows
it, ↑/↓ moves, Enter picks, and Esc closes only the picker.

When the person sends, the box shall clear its text, keep the focus and show the question at once.
While the agent works it shall show "{agent} is working", and while the question waits, "You can
close this. The answer comes to your chat with {agent}." When the answer comes while the box shows,
the box shall show it in a polite live region, offer **Copy** in place of the hints, and say "Reply
to {agent}" in the text box. When the answer holds a card, the box shall say "{agent} asks you to
choose" and the card's question. When a question isn't sent, the box shall keep it once, edged in
the danger colour, with "Not sent · Try again" and "Couldn't reach {source}. Your question is still
here."; Try again shall send it again. When there is no agent to ask, the box shall say "No agents
yet" and "Connect a workspace or a team in Studio to ask its agents." with **Open Studio**, which
brings Studio's window forward.

Esc, or a click beside the box, shall fade the box out and hide its window through
`plugin:quick-ask|hide`. When the window is hidden or loses the focus, the box shall go and stop
watching for the answer; when the window shows again, the box shall open empty, with the unsent
text and the picked agent kept.

## Examples

- Given chats with Chief and Liam, and Chief asked last,
  when the box shows,
  then the text box says "Ask Chief anything" and has the focus.
- Given the box,
  when the person presses Tab, types "ele" and presses Enter,
  then Elena is picked and the text box says "Ask Elena anything".
- Given Chief working on the question,
  then the box says "Chief is working" and "You can close this. The answer comes to your chat with Chief.".
- Given Paperclip · Acme is offline,
  when the person sends "Where are we?",
  then the box says "Not sent · Try again" and "Couldn't reach Paperclip · Acme. Your question is still here.".
- Given the box showing,
  when the person presses Esc,
  then the box fades out and its window hides.
