# workspace.trust-integrations

- Status: active
- Since: 0.1.0
- Source: HAL-3385; the design on HAL-1873, section 5 (the workspace row of an address from a setting, "the value is part of what the workspace trust check fingerprints"), approved by the board on HAL-1949

The workspace package shall add each local integration with a `{ fromSetting }` host to the trust content, sorted by id, with the URL the workspace's setting holds for each such host, by setting name, normalised as connector URLs are, `null` while the setting isn't set, and only the reason for a URL that can't be trusted, never its password. Integrations without a `{ fromSetting }` host add nothing, and a workspace without such integrations shall have the same content and fingerprint as before. The trust changes shall list such integrations that are new, changed (with the fields that differ) and removed.

## Examples

- Given a local integration `home-station` whose `url` setting holds `HTTP://192.168.1.20:8123`,
  then the content lists it with `{ url: "http://192.168.1.20:8123/" }`.
- Given its `url` setting isn't set, or is empty,
  then the content lists it with `{ url: null }`.
- Given its `url` setting holds `https://ops:pw@nas.example.com/`,
  then the content holds `‹refused: the URL has user info›` and not the password.
- Given only integrations with fixed hosts,
  then the content and fingerprint are the same as a workspace's without integrations.
- Given a trusted workspace with `home-station`,
  when the `url` setting changes, is set for the first time or is cleared,
  then the fingerprint changes and the change lists `home-station` as changed in `addresses`.
- Given a trusted workspace with `home-station`,
  when the setting is written with a capital scheme or the default port,
  then the fingerprint stays the same.
- Given a trusted workspace with `home-station`,
  when it is removed,
  then it is listed as removed and the change only removes things.
- Given a trust record from before integrations were in the content,
  when the workspace now has `home-station`,
  then it is listed as new.
