# studio-click-test.checkbox-words-look

- Status: active
- Since: unreleased
- Source: HAL-21123, the click step for `kit.checkbox-words` that the review of #6943 (HAL-18916) left to a follow-up

The checkbox card shall carry a fourth option that no step ticks, whose words are at most 120 characters, the most Paperclip takes in an option's label, and wider than the 800px window, so that they wrap in the Inbox and in a chat. When the checkbox card step has a copy of that card open, in the Inbox or in a chat, the click test shall, before it ticks anything, read where the app drew that option's label and its box, and the label's line height and padding, and shall fail the surface as `CHECKBOX_WORDS_LAYOUT`, with the numbers it read, unless the box's middle is within 0.5px of the middle of the words' first line, half a line under the label's padding. Where the words take fewer than two lines, it shall fail the surface as `CHECKBOX_WORDS_ONE_LINE`, because a box centred against one line sits where a box on the first line does; where the line height or the padding doesn't read as pixels, as `CHECKBOX_WORDS_UNREAD`; and where the option doesn't show within 10 seconds, as `NO_OPTION`. After a failed reading it shall still tick and submit the surface's picks, so that the card isn't left open for the next step, and a failed click then fails the surface with its own code.

## Examples

- Given a label 40px high with 20px lines and no padding, and its 16px box 2px under the label's top,
  then the step goes on to its picks.
- Given that label with its box centred against both lines, 12px under the label's top,
  then the surface fails as `CHECKBOX_WORDS_LAYOUT`, and its picks are still submitted.
- Given a phone's label, 72px high with 24px lines and 12px of padding above and below, and its box 16px under the label's top,
  then the step goes on to its picks.
- Given words that fit on one 20px line,
  then the surface fails as `CHECKBOX_WORDS_ONE_LINE`.
- Given a card without the option,
  then the surface fails as `NO_OPTION`.
