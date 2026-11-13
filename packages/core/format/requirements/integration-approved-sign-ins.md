# format.integration-approved-sign-ins

- Status: active
- Since: 0.1.0
- Source: HAL-8323 (HAL-984 design, section 4, "The approved sign-in")

`approvedSignIns` shall give each sign-in of a sheet with every setting filled in: its `authorizeUrl`, `tokenUrl`, `revokeUrl` and `issuer` as `https` URLs (a `{ fromSetting, path }` URL becomes the host of that setting plus the path), its client ID (fixed, or read from its setting), its client authentication, the name of its client secret, its scopes without their reasons, and its resolved access hosts and placement. It shall refuse a client ID setting that is missing (`client-id-missing`) or holds a space or line break (`client-id-invalid`). It shall hold no secret value.

## Examples

- Given the Example sign-in with `clientId: { fromSetting: clientId }` and `clientId` set to `abc123`, then the approved sign-in has `clientId: abc123`, its scopes as `["projects.read"]` and `accessHosts: ["api.example.com"]`.
- Given a `{ fromSetting: gitlab, path: /oauth/token }` token URL and `gitlab` set to `https://git.example.com`, then the approved `tokenUrl` is `https://git.example.com/oauth/token`.
- Given the `clientId` setting empty, then `approvedSignIns` fails with `client-id-missing`.
- Given the `clientId` setting `a b`, then `approvedSignIns` fails with `client-id-invalid`.
