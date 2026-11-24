# harness-bridge.web

- Status: active
- Since: unreleased
- Source: HAL-13211 (a harness step on the Cloudflare Worker runs in a container per run); HAL-17124

When a run's program calls the bridge on a runtime without Node, such as the Cloudflare Worker, the bridge shall answer the Web request with a Web response through the same routes, budget checks and spend records as the Node bridge. It shall let a request in only when it has no `Origin` header, or answer 403, and when it carries the credential of the run the request reached, checked as `harness-bridge.run-credential` says, or answer 401 whatever the path. A request body shall be read within the bridge's size and time limits. Work a route leaves for after its reply, such as recording a streamed call's spend, shall be handed to the runtime to wait for, and a failure in it, or in a reply body part way, shall be reported to the run without the credential. The Web-only entry point that exports this bridge shall use no Node API.

## Examples

- Given a run that was given a credential and may reach Anthropic with a key,
  when its program sends a model request with that credential,
  then the provider's reply comes back and the call's spend is recorded.
- Given a run that was given a credential,
  when a request sends no credential, another run's credential, or carries an `Origin` header,
  then it is refused with 401, 401 or 403, and no provider is called.
- Given a run that was given a credential,
  when a request with it asks for a path the bridge doesn't serve,
  then the answer is 404.
- Given a request whose body is larger than the bridge's limit,
  when it comes with the run's credential,
  then the answer is 400 and no provider is called.
