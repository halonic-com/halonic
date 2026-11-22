# signed-request.signed-message

- Status: active
- Since: unreleased
- Source: HAL-13534 (selling layer design, section 8, S2; threat model, section 6)

The signer shall give each signed request an Ed25519 signature over one message that covers the direction (`cloud-to-deployment` or `deployment-to-cloud`), the key id, the method, the host, the path with its query, the product of the signing key, the customer where there is one, the command id where there is one, a timestamp in whole seconds, a nonce of 16 random bytes and the SHA-256 of the body's exact bytes, written as one JSON array in that order after a format label; and it shall refuse a customer or command id the headers can't carry. A customer may be a scope such as `o/org_1`, so the customer header allows `/`.

## Examples

- Given a request to `https://app.example.com/v1/usage?batch=2` signed for product `prd_a`,
  when it is signed,
  then its headers carry the key id, the timestamp, a 22-character nonce and an 86-character signature, and the signature verifies over that message.
- Given two requests that differ only in one covered part (the method, the host, the path, the query, the body, the customer, the command id or the direction),
  when each is signed with the same key, time and nonce,
  then the two signatures differ.
- Given a customer id with a line break in it,
  when the request is signed,
  then signing fails and no headers are made.
- Given an organisation's customer scope `o/org_1`,
  when the request is signed and verified,
  then the verified customer is `o/org_1`.
