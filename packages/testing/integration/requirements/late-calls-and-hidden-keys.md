# integration.late-calls-and-hidden-keys

- Status: active
- Since: unreleased
- Source: HAL-17787 (the run-time checks cover what an integration does after it answers, and keys it hides in an error)

The conformance suite shall keep the global network APIs replaced by tripwires until the test that ran a case ends, and shall fail that test when the integration used one after its call returned. The suite shall fail a case when a canary secret, as it is, URL-, form- or JSON-encoded, or in base64 or base64url, appears in the tool's result, in its error's message, stack or own fields, or in any error in that error's `cause` chain.

## Examples

- Given an integration that answers, then calls the global `fetch` from a detached promise,
  when the case runs,
  then the test fails and names the global `fetch`.
- Given an integration that throws an error whose `cause` holds the key,
  when the case runs,
  then it fails because a secret value appears in the tool's result or error.
- Given an integration that answers with its key in base64,
  when the case runs,
  then it fails the same way.
