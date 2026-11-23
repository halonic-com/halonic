# inbox.proposal-phone

- Status: active
- Since: unreleased
- Source: HAL-10916; flow-inbox 2.2 and 8; HAL-11945 section 3, row Q12; `inbox.proposal-page`

While the device is a phone, an open run proposal shall show **Accept all** across the page's whole width and **Reject all** under it, both 48 px high, in a bar under its changes rather than in its header. Its **See run 01JD8Q ›**, **Reject** and **Accept** shall be 48 px high. The bar over an open item that waits shall show **Back to Inbox** and where the item is among what waits, such as "1 of 4"; a decided or done item shall show no place.

## Examples

- Given run `01JD8Q`'s proposal with two undecided changes is open on a phone,
  then its header has no buttons, and the bar under its changes shows **Accept all** then **Reject all**, each the page's width.
- Given two proposals wait and the second is open on a phone,
  then the bar over it says "Back to Inbox" and "2 of 2".
- Given a done proposal is open on a phone,
  then the bar over it says "Back to Inbox" and no place.
