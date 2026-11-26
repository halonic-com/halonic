# Decision: the Inbox note field shows only once its option is pressed

- Approval: asked for on HAL-19020, from the visual check of #6270 on HAL-19016; it follows the kit's form for Ask for changes (component specs 23 A8) and adds no words, a team decision with no board card (HAL-2282 rule); Liam approves this note in his review of this pull request
- Kind: user-visible
- Task: HAL-19020

## What changes

`inbox.option-note` (unreleased) said the card shows the note field above the buttons all the
time. Every Paperclip approval then showed an empty box "What should change?" before anyone chose
Request changes, and the primary button moved down. Now the field shows only once its option is
pressed, focused, with that option's button and **Cancel** under it. Cancel or Escape brings the
buttons back and sends nothing. The requirement's text and examples say so.

## Tests

No test was weakened. The test that found the field on a fresh card now finds none there, and
finds it focused after Request changes is pressed; tests for Cancel and Escape are added.

## Covers

- inbox.option-note
