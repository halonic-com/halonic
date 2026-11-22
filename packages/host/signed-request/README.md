# @halonicjs/host-signed-request

The signed-request format a deployment and Halonic Cloud use to talk to each
other. Each request carries an Ed25519 signature over its method, host, path
and query, the product of the signing key, the customer and command id where
there are any, a timestamp, a nonce and the SHA-256 of its body, plus the
direction it goes in. Web-standard APIs only (WebCrypto), so it runs the same
in a deployment's Worker, in Cloud's Worker and on Node.

- **Layer:** host
- **Owner:** tomas
- **Public API:** `@halonicjs/host-signed-request`

## Rules the format holds

- **Two directions, separate keys.** A deployment signs `deployment-to-cloud`
  with its deployment key; Cloud signs `cloud-to-deployment` with its own
  command key. The direction is signed, so a request never verifies the other
  way.
- **The product comes from the key.** The receiver looks the key up and
  verifies the signature against that key's product; a request can't name
  another product.
- **5 minutes, either way.** A timestamp further from the receiver's clock is
  refused. Each nonce is kept for that window and refused the second time.
- **The receiver decides which keys count.** `findKey` returns only keys
  accepted right now: a revoked key, or a retiring key past its time, isn't
  found.
- **Key sets give each key one job.** In Cloud's published key set every key
  is a `session` key or a `command` key, and is found only for that job.

## Example

```ts
import { signRequest, verifyRequest } from "@halonicjs/host-signed-request";

// Sending (a deployment, to Cloud):
const headers = await signRequest(
  { direction: "deployment-to-cloud", method: "POST", url, body, product },
  { key: deploymentKey, clock: systemClock, randomBytes },
);

// Receiving (Cloud):
const verified = await verifyRequest(
  { method: request.method, url: request.url, headers: request.headers, body },
  { direction: "deployment-to-cloud", findKey, nonces, clock: systemClock },
);
if (!verified.ok) return new Response(null, { status: 401 });
// verified.value.product is the product of the key that signed it.
```
