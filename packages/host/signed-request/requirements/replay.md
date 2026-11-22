# signed-request.replay

- Status: active
- Since: unreleased
- Source: HAL-13534 (selling layer design, section 8, S2; threat model, section 6)

The receiver shall record each accepted request's nonce for its key until the request's timestamp leaves the time window, and shall refuse a second request with the same key and nonce in that time; it shall record a nonce only after the signature holds.

## Examples

- Given a request that was accepted,
  when the same request is sent again a minute later,
  then it is refused as replayed.
- Given a request with a bad signature,
  when it is checked,
  then its nonce isn't recorded, and the genuine request with that nonce is still accepted.
- Given two requests signed with the same nonce by two different keys,
  when both are checked,
  then both are accepted.
