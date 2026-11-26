# kit.final-state

- Status: active
- Since: unreleased
- Source: HAL-19496 (board report on HAL-10: a card decided here or elsewhere shows its final state, who and when, the same way); plan approved by Liam; the five words go to Sofia's check

The kit shall give a card's final state as one line, the same whether the card ended in Halonic or elsewhere: "Approved", "Rejected" or "Answered" for an answered card, by the option it was answered with (approve or accept, reject, anything else), "Cancelled" or "Expired" for a card closed without an answer, and for an action card how its action ended: "Succeeded", "Failed", "Declined" or "Expired"; then "by you" when the person ended it, or "by" and the name of whoever did when the source names one; then " · " and the time. Approved, Answered and Succeeded shall show in the success tone, Rejected and Failed in the danger tone, Cancelled, Declined and Expired in the neutral tone.

## Examples

- Given a card Ada approved at 14:02,
  then its line is "Approved by Ada · 14:02", in the success tone.
- Given a card the person rejected at 14:02,
  then its line is "Rejected by you · 14:02".
- Given a card that expired at 14:02, with no one named,
  then its line is "Expired · 14:02", in the neutral tone.
- Given an action card the person declined at 12:10,
  then its line is "Declined by you · 12:10", in the neutral tone.
