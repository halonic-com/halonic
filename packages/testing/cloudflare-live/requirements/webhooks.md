# live.webhooks

- Status: active
- Since: 0.1.0
- Source: HAL-9962 (for HAL-9955); build plan 3c (HAL-6706); multi-cloud ADR 5.9; Worker side `runtime.serve`, HAL-9923

The live suite shall send signed webhook deliveries to a deployed Worker over the network and fail unless the Worker answers as the shared webhook checks do. A delivery with a wrong signature, and a correctly signed one with a timestamp outside the window, shall be answered 401 `webhook_rejected`. A signed delivery to an address with no routine shall get the same status and body as a wrong signature. A signed delivery for a routine that exists shall be answered 501 while the Worker starts no runs, and the same delivery id sent twice shall be answered 501 both times, because a delivery that wasn't started keeps its id free. The two 501 checks are the run-start and replay checks, pending: they shall fail on the first answer that isn't 501, so they are changed to 202 and 409 when the Worker starts runs.

Rationale: the Node host and the Worker share the webhook checks, but only a call over the network proves the deployed Worker, its secrets and the snapshot it reads answer the same way. A pending check that asserts today's answer can't be skipped by accident.

## Examples

- Given a wrong signature, then the answer is 401 with the code `webhook_rejected`.
- Given a correct signature and a timestamp an hour old, then the answer is 401.
- Given the address of no routine, then status and body are those of a wrong signature.
- Given a correct delivery and a Worker that answers 202, then the run-start check fails and names the 202.
