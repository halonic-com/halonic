# studio.served-inbox

- Status: active
- Since: 0.1.0
- Source: HAL-10630 (part 3 of HAL-10618, the Inbox on a phone); studio.served-inbox-runs, server.waiting-runs

The served Studio shall have the Inbox: its place in the window and on the phone's tabs, and its Needs you card on Home, reading the waiting runs of the workspace it is served from through the page's own address and session, so a phone that opens the served Studio can see, approve, reject or wait on what a run asks of it.

## Examples

- Given the served Studio opens, then the Places list has an Inbox and the page has asked `GET /api/waiting-runs`.
- Given the computer lists no waiting run, then the Inbox shows nothing waiting.
