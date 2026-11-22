# cloudflare-live.webhooks

- Status: active
- Since: unreleased
- Source: HAL-9962 (for HAL-9955); build plan 3c (HAL-6706); multi-cloud ADR 5.9; Worker side `runtime.serve`, HAL-9923

The live suite shall send signed webhook deliveries to a deployed Worker over the network and fail unless the Worker answers as the shared webhook checks do. A delivery with a wrong signature, and a correctly signed one with a timestamp outside the window, shall be answered 401 `webhook_rejected`. A signed delivery to an address with no routine shall get the same status and body as a wrong signature. A signed delivery for a routine that exists shall start the routine's run and be answered 202, and the same delivery id sent again shall be answered 409.

Rationale: the Node host and the Worker share the webhook checks, but only a call over the network proves the deployed Worker, its secrets and the snapshot it reads answer the same way.

## Examples

- Given a wrong signature, then the answer is 401 with the code `webhook_rejected`.
- Given a correct signature and a timestamp an hour old, then the answer is 401.
- Given the address of no routine, then status and body are those of a wrong signature.
- Given a correct delivery and a Worker that answers 501, then the run-start check fails and names the 501.
- Given the same delivery id twice and a Worker that answers 202 both times, then the replay check fails and names the second 202.
