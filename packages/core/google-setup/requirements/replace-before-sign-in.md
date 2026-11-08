# google-setup.replace-before-sign-in

- Status: active
- Since: 0.1.0
- Source: HAL-698 (build plan A1; design 4.3, "Replacing before the first sign-in")

When a client secret is replaced straight away, which the caller does only before the setup's first sign-in, the store shall make the new value the secret in use and remove any staged secret for that ref. When no secret is saved for the ref, the store shall throw `ClientSecretError` `not-saved`.

## Examples

- Given a saved secret A and a staged secret S,
  when A is replaced with B,
  then the secret in use is B and nothing is staged.
- Given no saved secret for `gclient_9`,
  when it is replaced,
  then the call throws `ClientSecretError` `not-saved`.
