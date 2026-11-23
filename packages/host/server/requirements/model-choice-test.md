# server.model-choice-test

- Status: active
- Since: unreleased
- Source: HAL-16635 (HAL-14808 PR 2, Liam's D1 note); rules of `server.secrets-refusals` and `server.secrets-no-echo`

When `POST /api/model-choice/test` passes the checks of `server.model-choice-routes`, the server shall:

- build the choice anew from its `kind` and `provider` or `model` only, and drop every other field, so the test calls only the provider's built-in address (`choiceProvider`) and never an address the browser sends;
- take a `key` only with a key choice, as a string of at most 1,024 characters, and refuse any other `key` with 400 `bad_request`;
- refuse a request that carries a `key` over a connection that is neither HTTPS nor addressed to a loopback name with 403 `secure_connection_required`, before anything is called; there is no confirm flag;
- count each test in the session's own window of 15 minutes and, from the 11th test in a window, answer 429 `too_many_tests` with a `Retry-After` header and call nothing;
- answer the service's outcome: `not-a-key`, `files`, `tested` (with a `testId` only when it passed) or `superseded`.

No answer, refusal, log line or error log entry shall hold the key, and the request log shall record nothing for a request to this address, whatever its status.

Rationale: a test spends the person's own key with the provider, so it goes over a checked channel, only to the provider it names, and not as often as a script likes. The server is never an open proxy to an address a caller picks.

## Examples

- Given `{"choice": {"kind": "key", "provider": "anthropic", "baseUrl": "https://evil.example"}, "key": "sk-ant-fake"}`, then the service is asked to test `{"kind": "key", "provider": "anthropic"}` and nothing else.
- Given a test with a key over plain http to a LAN name, then the answer is 403 `secure_connection_required` and the service isn't asked.
- Given a test of a local model over plain http to a LAN name, then it is tested.
- Given 10 tests in one session within 15 minutes, then the 11th answers 429 `too_many_tests`, and another session can still test.
