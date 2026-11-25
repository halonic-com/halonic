# server.messaging-rate

- Status: draft
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, §4 (PR S2); Julian's security note on HAL-17513, finding S6; ADR `docs/adr/2026-11-24-agent-messaging.md`, polling

The server shall allow at most 30 messaging writes (answer, send and the port's other writes) per minute for each session, counted in the `Coordination` port, and shall answer the next with 429 `too_many_requests` and a `Retry-After`, sending nothing to the provider. The messaging routes shall count toward the server's daily request ceiling (`server.daily-requests`). The server shall run one poll loop for all its clients together, through the `Scheduler` port: about every 30 seconds while any client reported focus in the last 2 minutes, and every 5 minutes otherwise, so the number of clients never multiplies the calls to Paperclip.

## Examples

- Given one session, when it sends 31 answers in one minute, then the 31st answers 429 and the provider gets 30.
- Given three desktops signed in, none in focus, when 10 minutes pass on a fake scheduler, then the provider is polled twice.
- Given one desktop that reports focus, when 1 minute passes, then the provider is polled twice, and after 2 minutes with no focus report the loop slows to every 5 minutes.
