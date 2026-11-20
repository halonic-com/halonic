# contracts.launch-token-refusal

- Status: active
- Since: unreleased
- Source: HAL-14230; B1 design note D3 on HAL-14206, security review on HAL-14212 (section 1)

Where a server listens on loopback for the program that launched it (the agent host, the engine role), it shall refuse, before it looks at the path: a `Host` header other than `127.0.0.1:<port>` or `localhost:<port>` with 421, a request with any `Origin` header with 403, and a request whose `Authorization` header isn't exactly `Bearer <launch token>` with 401. The host check shall come first, then the origin, then the token, so an unknown path without the token answers 401 and only a caller with the token can tell an unknown path (404) from a served one. One suite, `launchTokenRefusalContract`, shall hold these rules, and every such server shall run it.

## Examples

- Given the token and `Host: localhost:<port>`, then a served path answers 200.
- Given `Host: localhost`, `Host: 127.0.0.1:<another port>` or `Host: [::1]:<port>`, then it answers 421, even with the token.
- Given `Origin: null` or the server's own address as `Origin`, then it answers 403, even with the token.
- Given the token with one character changed, one missing or one added, `bearer` in lowercase, two spaces, or no `Bearer`, then it answers 401.
- Given an unknown path and no token, then it answers 401; with the token, 404.
