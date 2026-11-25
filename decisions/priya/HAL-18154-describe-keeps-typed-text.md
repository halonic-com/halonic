# Decision: Describe keeps unsent text, and Ask about shows the item under Shown:

- Approval: /HAL/issues/HAL-18155 (Sofia's design decision, option a), with Liam's review of #5940 on HAL-18055
- Kind: user-visible
- Task: HAL-18154

## What changes

- assistant.chat.describe: when the Describe link reuses a Build draft whose box holds text the
  person typed and didn't send, the box keeps that text and the Describe text goes after it, in a
  new paragraph, with the caret at the end. Before, the Describe text replaced it.
- assistant.chat.ask-about: "Ask about this <kind>…" also shows the item under "Shown:" by its
  name, as Sofia asked on HAL-18155, so the chat says what it is about after a tab switch.

## Why

Liam's review of #5940 found that Describe threw away what the person had typed. Nothing typed
should be lost without the person deleting it, and putting the new text last keeps the caret where
they go on typing ("Make a workflow that ▏"). The Shown chip uses a part that already exists (5.7)
instead of a new status line.

## What doesn't change

Which chat opens, that nothing is sent, the panel opening and focus in the box. No test was
weakened: the existing tests stay as they were, and new tests cover the kept text and the chip.

## Covers

- assistant.chat.describe
- assistant.chat.ask-about
