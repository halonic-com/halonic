# inbox.card-bar-reach

- Status: active
- Since: unreleased
- Source: task HAL-21192, from click-test run 46169816593 (step 19, item verdicts); one scroll area and a pinned foot from HAL-21255, after Noah's look check on HAL-21253; builds on `inbox.card-surface`

When an agent's card asks several questions in a window taller than 576px, the Inbox shall give the card one scroll area, its body, which holds the questions, and a foot under it that never scrolls and holds only the card's reason or failure line and **Submit**, so neither can leave view however many questions the card asks. In a short window (at most 576px tall) the item pane scrolls the whole card, as `inbox.card-surface` says, and the failure line sits directly above **Submit**.

## Examples

- Given an 800 by 600px window and an open agent's card that asks for a verdict on two items,
  when its questions are scrolled to the top or to the bottom,
  then **Submit** and the failure line are both in the card's foot, in view.
- Given an agent's card whose answer failed to send,
  when the card shows "Couldn't record your decision." with **Try again**,
  then that line is in the foot, directly above **Submit**.
- Given a short window,
  when an agent's card shows,
  then nothing in the card scrolls on its own and the item pane scrolls the whole card.
