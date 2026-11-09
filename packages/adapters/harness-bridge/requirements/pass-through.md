# harness-bridge.pass-through

- Status: active
- Since: 0.1.0
- Source: HAL-194 (build plan B2, decision 6); `docs/guides/failure-path.md`

When a route of the Node bridge passes a request on to a provider, the bridge shall send the request's bytes to the route's fixed provider URL with only the headers the route names and adds, and shall copy the reply's status, the reply headers the route allows and the body back to the program byte for byte as they arrive, the provider's error replies included. When the provider can't be reached or doesn't start its reply within the response time limit, the bridge shall answer 503 with the kind `unavailable`. When the program goes away, the bridge closes, the response time limit passes, a reply goes silent for longer than the idle time limit, or the program reads nothing of a reply for as long as the idle time limit, the bridge shall stop the call to the provider, with a reason that names which of these happened.

## Examples

- Given a provider that streams its reply,
  when the program sends a request through the bridge,
  then each event reaches the program as it arrives.
- Given a provider that answers 429 with `retry-after: 7`,
  when the bridge passes the reply back,
  then the program gets the 429, the header and the same body.
- Given a stream that has sent one event and then nothing for longer than the idle limit,
  when the limit passes,
  then the bridge stops the call to the provider and the program's reply ends with an error.
- Given a program that stops reading a long reply,
  when the idle limit passes while the bridge waits for room to write,
  then the bridge stops the call, and the reason names the program, not the provider.
- Given a reply in the middle of its stream,
  when the bridge closes,
  then the bridge stops the call to the provider and the program's reply ends with an error.
