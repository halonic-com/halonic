# cloudflare-durable.usage-reserve

- Status: active
- Since: unreleased
- Source: HAL-16243 (split from HAL-13219); selling layer design, sections 4.3 and 13.6

The usage account shall hold a step's maximum only when the scope's use so far, plus what is already held, plus that maximum stays within each limit, checking and writing in one synchronous storage transaction with no outside I/O between them. A limited unit the step gives no maximum for shall take the limits' default. Settling shall charge what the step used and release the rest, once per reservation id: a repeat, or an id it never held, shall change nothing. A reservation shall run out at its step's time limit plus a margin; then it shall be charged in full, and a settle that comes later shall correct that charge to what was used.

Rationale: two parallel steps of one scope must not both pass a check and together overshoot; a step that can't hold its maximum is refused before it starts instead of being cut off halfway; a lost settle must neither free the reservation for nothing nor charge it twice.

## Examples

- Given a limit of 1,000 and 50 parallel reservations of 300,
  when they are made,
  then 3 are held and the next is refused with 900 used, 300 needed and 100 left.
- Given a reservation of 600 that ran out and was charged in full,
  when its settle arrives with 100 used,
  then the charge becomes 100 and a correction of -500 goes to Cloud.
