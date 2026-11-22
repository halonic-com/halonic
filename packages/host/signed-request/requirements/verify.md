# signed-request.verify

- Status: active
- Since: unreleased
- Source: HAL-13534 (selling layer design, section 8, S2; threat model, section 6)

The receiver shall accept a signed request only when all four signature headers are present and well formed, the timestamp is at most 5 minutes from its own clock either way, the key id names a key it accepts right now, and the signature holds over the message rebuilt from the request as received, the direction the receiver accepts and the product of the key that verified it; and it shall then return that key's product, never a product named by the request.

## Examples

- Given a request signed a minute ago with a key the receiver accepts,
  when it is checked,
  then it is accepted, with the key's product, the customer and the command id it was signed with.
- Given a request without the signature header, or with a nonce of the wrong length,
  when it is checked,
  then it is refused before any key is looked up.
- Given a request signed 6 minutes ago, or 6 minutes ahead,
  when it is checked,
  then it is refused as outside the time window.
- Given a key the receiver no longer accepts (revoked, or past its retiring time),
  when a request it signed is checked,
  then it is refused as an unknown key.
- Given a signed request whose body, path, method, host, customer or command id was changed on the way,
  when it is checked,
  then it is refused as a bad signature.
- Given a request signed for product B, checked with a key that belongs to product A,
  when it is checked,
  then it is refused as a bad signature.
- Given a request signed `deployment-to-cloud`,
  when a receiver that accepts only `cloud-to-deployment` checks it,
  then it is refused as a bad signature.
