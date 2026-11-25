# server.paperclip-sign-in-cap

- Status: active
- Since: unreleased
- Source: Julian's review of HAL-18732 (`server.paperclip-sign-in`); the reason agreed with S8's owner on HAL-18769.

While the server holds 8 Paperclip sign-ins that haven't ended, started ones and ones still waiting for Paperclip's challenge alike, when a sign-in start is asked for, the server shall answer `{ outcome: "refused", reason: "too-many-sign-ins" }`, send no request to Paperclip and hold nothing new in memory. A sign-in stops counting once it is approved, refused, cancelled or past its end time, or when its start fails.

Rationale: every open sign-in holds a board key nobody approved yet; the cap keeps how many the server holds small, also when starts come at once.

## Examples

- Given 8 open sign-ins, when a ninth start is asked for, then it answers `too-many-sign-ins` and Paperclip gets no new challenge request.
- Given 11 starts sent at once, then 8 start and 3 are refused with `too-many-sign-ins`.
- Given 8 open sign-ins, when one is cancelled, then the next start starts.
