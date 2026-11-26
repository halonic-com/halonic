# feedback.send-states

- Status: active
- Since: unreleased
- Source: HAL-19511; states from Noah's design on HAL-19384, words approved on HAL-19391

While the crop is loading, the Send feedback window shall mark its 220-pixel crop box busy, show
the skeleton fill in it only after 300 ms, and keep the size line's height. If the crop can't be
loaded, the window shall say "Couldn't load the screenshot." in the crop box with "Send without a
screenshot", which hands on the text with no screenshot, and with "Select again" when the window
can start a new selection, and shall keep the window open. While the text field holds an error,
the field shall keep the danger focus ring. While Studio is offline, the window shall show an info
Callout "Studio is offline" / "Send saves your feedback on this computer and sends it
automatically once Studio is back online.", and while Studio isn't connected to Paperclip, "Studio
isn't connected to Paperclip" / "Send saves your feedback on this computer and sends it
automatically once Studio is connected to Paperclip.". While a feedback is being sent, the text
field shall be read-only, Select again shall be hidden, and Send shall show its busy spinner only
after 300 ms. If Paperclip refuses the feedback, the window shall stay open with the text, and
show a danger Callout "Couldn't send your feedback" / "Paperclip said: {reason}. Your text and
screenshot are still here." with "Try again", which takes the focus once; the reason loses a full
stop at its end, and with no reason the Callout shows its title alone. If the crop can't be made
into a PNG, the window shall hand on nothing and show "Couldn't prepare the screenshot" / "Your
text is still here." with "Send without a screenshot".

## Examples

- Given a crop the shell refuses as `gone`,
  when the window opens,
  then it says "Couldn't load the screenshot." and stays open, and "Send without a screenshot"
  hands on the text with no PNG.
- Given Paperclip refuses with "Project not found.",
  when the person presses Send,
  then the Callout says "Paperclip said: Project not found. Your text and screenshot are still
  here." and has the focus.
- Given Studio is offline,
  when the window opens,
  then "Studio is offline" shows above the footnote.
