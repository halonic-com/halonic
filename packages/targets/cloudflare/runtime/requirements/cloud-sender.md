# runtime.cloud-sender

- Status: active
- Since: unreleased
- Source: selling layer S2-19 (HAL-13552); selling layer design, section 4.4; signed-request format of HAL-13534

When the deployment sends a body to Halonic Cloud, the sender shall sign it with the deployment key in the `deployment-to-cloud` direction of the signed-request format, with the product the key belongs to, the time from its clock and a nonce from its random source, and post it once to the path on Cloud's URL. A self-test request shall carry `self-test=1` in its query, which the signature covers. The sender shall answer `delivered` for a 2xx answer, `key-refused` with the key id for 401, `retry` with reason `server` for 429 and 5xx, `retry` with reason `refused` for any other answer, and `retry` with reason `network` when no answer came within 10 seconds or the request failed. It shall never throw for a failed send and never retry by itself. No answer shall hold the key or the signature.

Rationale: Cloud counts and bills what a signed request reports, so only the deployment's key may send it, and a self-test must not count as the key's first use. The outbox that calls the sender keeps every body until it is delivered, so the sender only says what happened. A refused key is its own answer because the caller can resend at once with the current key. Answers are logged, so they must not carry what could sign a request.

## Examples

- Given the golden key, time and nonce, when the golden body is sent to `/v1/usage`, then the request carries exactly the golden headers.
- Given a self-test send, then the request's URL has `?self-test=1` and its signature verifies for that URL.
- Given Cloud answers 401, then the answer is `key-refused` with the key id.
- Given the request fails, then the answer is a `network` retry, and neither it nor any other answer holds the signature or the private key.
