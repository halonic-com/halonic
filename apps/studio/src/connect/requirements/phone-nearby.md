# studio.connect.phone-nearby

- Status: draft
- Since: unreleased
- Source: HAL-16823 (the typed route's computer picker; port shape agreed with Priya on HAL-16829; the shell's commands from HAL-16824)

When the phone's own page lists the computers on this Wi-Fi in the Android app, the page shall call only the shell's `phone_nearby_browse` and `phone_nearby_stop`, with a new channel for each browse. The page shall pass a list to the picker only once the shell answered `browsing`, and never after the browse was stopped or a newer browse started. It shall check every list again: at most 20 computers, each with an id and a name that is not empty after trimming and at most 64 bytes long, sorted by name. If an answer or a list isn't one the page knows, then the page shall report it, read the answer as `unavailable` and drop the list.

## Examples

- Given the shell sends the empty list and then answers `browsing`,
  when the picker browses,
  then it gets the empty list once the answer came.
- Given the shell answers `{"kind":"no-local-network","askAgain":true}`,
  when the picker browses,
  then it gets that answer and no list.
- Given a browse that was stopped while Android's question showed,
  when the shell answers `browsing` and sends a list,
  then the picker gets neither the list nor a later one.
- Given a list with 24 computers, one named `"  "` and one named with 65 bytes,
  when the page reads it,
  then the picker gets at most 20 computers, without those two.
