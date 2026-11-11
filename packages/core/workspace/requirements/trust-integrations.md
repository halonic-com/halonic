# workspace.trust-integrations

- Status: active
- Since: 0.1.0
- Source: HAL-3385; the design on HAL-1873, section 5 (the workspace row of an address from a setting, "the value is part of what the workspace trust check fingerprints"), approved by the board on HAL-1949; trust build plan item 3a on HAL-188 (HAL-2191), for HAL-983

The workspace package shall add each local integration to the trust content, sorted by id, with its folder relative to the workspace, every host its sheet declares with the class of address it may reach (`public` for a fixed host name, the declared class for a `{ fromSetting }` host), every secret by name only with the hosts it may go to and where it is sent, every tool with its risk, the hash of every file in its folder, and the URL the workspace's setting holds for each `{ fromSetting }` host, by setting name, normalised as connector URLs are, `null` while the setting isn't set, and only the reason for a URL that can't be trusted, never its password. A workspace without local integrations shall have the same content and fingerprint as before. The trust changes shall list integrations that are new, changed (with the fields that differ, `code` for a change to any file) and removed. The wording of a sheet and whether the runner is fenced shall not be in the content.

## Examples

- Given a local integration `home-station` in `integrations/home-station/` whose `url` setting holds `HTTP://192.168.1.20:8123`,
  then the content lists its folder, `api.example.com` as `public`, `‹setting url›` as `private`, `‹secret station-key›` with its hosts and header, `read-sensors` as `read`, the hash of its files and `{ url: "http://192.168.1.20:8123/" }`.
- Given its `url` setting isn't set, or is empty,
  then the content lists it with `{ url: null }`.
- Given its `url` setting holds `https://ops:pw@nas.example.com/`,
  then the content holds `‹refused: the URL has user info›` and not the password.
- Given a workspace without local integrations,
  then the content and fingerprint are the same as before integrations were in the content.
- Given a trusted workspace with `home-station`,
  when the `url` setting changes, is set for the first time or is cleared,
  then the fingerprint changes and the change lists `home-station` as changed in `addresses`.
- Given a trusted workspace with `home-station`,
  when one byte of one of its files changes,
  then the fingerprint changes and the change lists it as changed in `code` only.
- Given a trusted workspace with `home-station`,
  when a fixed address, the class of an address, a secret's name or hosts, a tool's risk or its folder changes,
  then the fingerprint changes and the change lists that field.
- Given a trusted workspace with `home-station`,
  when only a tool's description changes, or the setting is written with a capital scheme or the default port,
  then the fingerprint stays the same.
- Given a trusted workspace with `home-station`,
  when it is removed,
  then it is listed as removed and the change only removes things.
- Given a trust record from before integrations were in the content,
  when the workspace now has `home-station`,
  then it is listed as new.
