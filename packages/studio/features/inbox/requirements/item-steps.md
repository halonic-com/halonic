# inbox.item-steps

- Status: active
- Since: unreleased
- Source: note 2 of the HAL-19192 sketches, approved by the board; Sofia's design check on HAL-20395; task HAL-20396

While an item that waits is open, the Inbox shall show up and down buttons after where it is among what waits ("1 of 7"), named "Previous item" and "Next item", whose tooltips name their keys, K and J. Up shall open the item before it in the list's order and down the one after it, as a click on that row does; K and J shall do the same while no field has focus and no Ctrl, Alt or Cmd key is held. Past either end, that button shall keep its place but be hidden, from screen readers and the Tab order too, and its key shall do nothing.

## Examples

- Given three items that wait, the second one open,
  when the person presses **Next item**,
  then the third item is open and the header reads "3 of 3".
- Given the same items, the first one open,
  when the person presses K,
  then the first item stays open, and **Previous item** is hidden.
- Given an open item whose answer field has focus,
  when the person types "j",
  then the letter goes into the field and the open item stays.
