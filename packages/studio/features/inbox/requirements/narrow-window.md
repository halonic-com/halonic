# inbox.narrow-window

- Status: active
- Since: unreleased
- Source: HAL-17822; a11y check 2, row Z2 (HAL-12633); HAL-12667 option 1; HAL-8778, phone layout 5; `inbox.page`

While the window is narrower than 900px (`kit.narrow`), such as a 1280 × 800 laptop at 200 % zoom, the Inbox page shall show one pane at a time, as it does on a phone: the list shall fill the page, and opening an item shall show its card at the page's width in place of the list, under the bar with **Back to Inbox** and, for an item that waits, where it is among what waits ("1 of 4"). **Back to Inbox** shall show the list again with focus on the row the item was opened from. **New request** shall be a row under the list's heading and open the request sheet, as on a phone. A narrow window that isn't a phone shall keep the list's visible heading "Inbox", since it has no phone top bar. At 900px and wider, the page shall show the list and the open item side by side.

## Examples

- Given two items in a 640 × 400 window,
  then the list fills the page and no item pane shows;
  when you open the second row,
  then its card replaces the list with **Back to Inbox** over it;
  when you press **Back to Inbox**,
  then the list shows again with focus on the second row.
- Given the same items in a 1280 × 800 window,
  when you open a row,
  then the list and the card show side by side, with no **Back to Inbox**.
- Given the same items on a 390 × 844 phone,
  then the page is as `inbox.page` says for a phone.
