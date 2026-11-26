# integration-runner.requests

- Status: active
- Since: 0.1.0
- Source: HAL-4281, HAL-4353, HAL-4375 (HAL-983, design HAL-958 sections 3.3 and 3.7, attack cases A21, A27, A37)

When the integration in the runner sends a request through its host, the bridge shall send it through Halonic's kit client with the same body kind, secret placements and signal, answer with the response head and then one body piece per read, refuse a body the kit refuses in-process before it crosses, refuse a request outside a running tool call, over 8 requests in flight, with more than 100 headers or 16 secret placements, or with a URL, headers and secret placements over 32 KiB together (each header and placement counting 4 bytes more), close every request of a call when the call answers, is cancelled or fails, and ignore a `pull`, `cancel-body` or `abort` for a request closed that way, answer every request even when the kit's refusal is too large for a frame, and report a kit refusal on the leak list as blocked.

## Examples

- Given an integration that reads a response body,
  when it reads,
  then Halonic reads the kit's body only then, one piece per read.
- Given a request body over 720 KiB, or a `Blob` body,
  when the integration sends it,
  then it fails with the kit's `request-too-large` or `body-not-supported` and nothing crosses.
- Given a timer that sends a request after its tool call has answered,
  when it fires,
  then the request fails and never reaches the kit.
- Given a request whose URL, headers and secret placements come to more than 32 KiB,
  when the runner sends it,
  then it fails with `request-too-large` and never reaches the kit.
- Given 6,000 headers of `a: b`,
  when the runner sends them in one request,
  then it fails with `request-too-large` and never reaches the kit.
- Given a body opened in a call that has since answered or been cancelled,
  when the runner pulls it,
  then Halonic has already aborted the kit's request and answered `call-not-running`, the pull is ignored, and the slot is free for later calls.
- Given a kit refusal whose message is too large for a frame,
  when Halonic answers the request,
  then the runner gets the same code with a short message, and Halonic keeps running.
- Given a kit client that refuses with `secret-in-request`,
  when the integration sends that request,
  then it gets the kit's refusal and the bridge reports a leak attempt.
