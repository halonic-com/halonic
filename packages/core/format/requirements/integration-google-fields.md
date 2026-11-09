# format.integration-google-fields

- Status: active
- Since: 0.1.0
- Source: HAL-1164, the shape agreed on HAL-677 and the `google-sheet` check in halonic-com/integrations at ac597f7

When `parseFile` or `parseIntegrationSheet` reads a permission sheet with Google fields, the format shall accept `googleScopes` as `{ scope, reason }` entries with an optional `restricted: true`, `googleApis` as `{ api, name }` entries, where `name` is up to 80 letters, digits, spaces and `( ) & ' / . , -` starting with a letter or digit, and `googleCheck` as `{ method: GET, url }`, and fail a Google field on a sheet without the `google-account` secret, `googleScopes` without `googleApis`, a `googleCheck` that isn't a `GET` to an `https` host in both the sheet's `hosts` and that secret's `hosts`, a scope or API listed twice, and any other key in these fields.

## Examples

- Given the `tool-google-gmail` and `tool-google-drive` sheets from the integrations repo, when they are parsed, then they pass with no warnings and their Google fields as written.
- Given `googleScopes` entries that are scope URL strings, as older sheets had, when it is parsed, then it fails with `invalid_type` at each entry.
- Given `restricted: false` on a scope, when it is parsed, then it fails at `restricted`: a scope that isn't restricted leaves the key out.
- Given `googleCheck: { method: POST, url: ... }`, or a url with `http`, a port or a `#fragment`, when it is parsed, then it fails at that key.
- Given a `googleCheck` url to a host the sheet or the `google-account` secret leaves out, when it is parsed, then it fails with `google-check-host-not-declared`.
- Given a `googleApis` name such as `Cloud Pub/Sub API`, when it is parsed, then it passes; given a name with a `:`, a leading space or more than 80 characters, then it fails with `invalid_format` at that name.
- Given `googleScopes` without `googleApis`, when it is parsed, then it fails with `google-apis-missing`.
- Given `googleApis` on a sheet without the `google-account` secret, when it is parsed, then it fails with `google-field-without-sign-in`.
