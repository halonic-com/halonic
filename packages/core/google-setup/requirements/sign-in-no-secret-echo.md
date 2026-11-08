# google-setup.sign-in.no-secret-echo

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan D6; HAL-718)

The sign-in shall never read Google's `error_description`, shall keep an `error` value only when it is a plain snake_case code of at most 64 characters and give `unrecognised` otherwise, and shall return the authorisation code, the PKCE verifier and the tokens only in the `code` and `tokens` results, which stay in the host package.

## Examples

- Given a callback or token answer whose `error_description` holds a fake code and secret,
  when it is read,
  then the result's JSON holds neither.
- Given `error=bad <code>`,
  then the error code is `unrecognised`.
- Given a cancelled callback that also carries a code,
  then the result's JSON holds neither the code, the verifier nor the `state`.
