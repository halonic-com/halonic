# harness-bridge.odd-status

- Status: active
- Since: unreleased
- Source: HAL-19515 (found in the review of PR 6480)

When a provider answers a model call with a status above 599, the bridge shall treat the provider as busy: it shall move the call on to the next host pin where there is one, and otherwise answer the program 503 with the kind `unavailable`, instead of passing the status on or failing as an internal error.

## Examples

- Given an OpenRouter alias with a fallback host pin, whose first host answers with status 600,
  when the program sends a model call,
  then the call moves on to the fallback pin and the program gets its reply.
- Given a provider that answers with status 600 and no host pin left,
  when the program sends a model call,
  then the program gets a 503 with the kind `unavailable`.
