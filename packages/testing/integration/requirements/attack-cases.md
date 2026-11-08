# testing-integration.attack-cases

- Status: active
- Since: 0.1.0
- Source: HAL-135 ("a generated integration that tries to reach an undeclared host, read a file, or leak a key must fail")

The conformance suite shall fail an integration that reaches an undeclared host (directly, through a redirect, or while swallowing the refusal), reads a file (through its host or in its source), reads the environment, sends its key to a host the key may not go to, asks for an undeclared secret, passes a key through to its result, goes around its host with the global `fetch`, sends an unrecorded request, declares a lower risk than its code, ignores an aborted signal, or passes a provider's error body through.

## Examples

- Given each attack fixture,
  when the check named for it runs,
  then it throws a `ConformanceFailure` whose message names the cause.
- Given the well-behaved fixture,
  when the same checks run,
  then they pass.
