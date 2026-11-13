# oauth-sign-in.client-auth

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4)

The sign-in shall prove the client at the token and revoke endpoints as its `clientAuth` says: for `post`, `client_id` and (when there is a secret) `client_secret` in the form body; for `basic` with a secret, an `Authorization: Basic` header of the form-encoded ID and secret as padded standard base64 and no `client_id` in the body; for a client without a secret, only `client_id` in the body. It shall never put the secret in a URL.

## Examples

- Given `clientAuth: basic`, the ID `fake client` and the secret `s3cr&t:+/=`,
  then the header decodes to `fake+client:s3cr%26t%3A%2B%2F%3D`.
- Given a public client,
  then only `client_id` is sent, in the body.
