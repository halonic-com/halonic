# inbox.card-bar-reach

- Status: active
- Since: unreleased
- Source: task HAL-21192, from click-test run 46169816593 (step 19, item verdicts); builds on `inbox.card-surface`

When an agent's card shows in a window taller than 576px, the Inbox shall keep its bar of answers at most half the window tall and let the bar scroll on its own beyond that, so a form of several questions can't push **Submit** past the card's edge. In a short window (at most 576px tall) the bar shall stay whole, and the item pane scrolls the card, as `inbox.card-surface` says.

## Examples

- Given an 800 by 600px window and an open agent's card that asks for a verdict on two items,
  when both verdicts are picked,
  then **Submit** can be scrolled to in the bar and clicked.
- Given a short window,
  when an agent's card shows,
  then its bar doesn't scroll on its own and the item pane scrolls the whole card.
