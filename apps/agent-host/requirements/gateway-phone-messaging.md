# agent-host.gateway-phone-messaging

- Status: active
- Since: unreleased
- Source: architecture note section 2.3 on HAL-17511 (Julian's P1, P5 and the phone caps, HAL-17540); plan approved on HAL-18874

The agent host shall give the remote gateway a `PhoneMessaging` view of its agent messaging and team status that forwards only the members the view names, sends no files and passes on only `to` of a send's options. It shall rate a paired phone's searches and sends at 10 of each a minute, refilling evenly, keyed by the paired phone and not by its connection, so a phone that reconnects keeps its used-up rate. Nothing the gateway sends a phone during a session that touches every allowed message shall hold the Paperclip key, or any value the provider got from Paperclip outside the port's own types.

## Examples

- Given a phone that searched 10 times this minute,
  when it reconnects and searches again,
  then it gets `rate-limited`; six seconds later it may search once more.
- Given a Paperclip whose every answer carries a canary key, token and password address,
  when a phone reads, searches, answers and sends through the gateway,
  then no byte the gateway sends holds the key or the canary.
