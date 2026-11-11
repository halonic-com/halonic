# workspace.trust-integrations

- Status: active
- Since: 0.1.0
- Source: HAL-3385; the design on HAL-1873, section 5 (the workspace row of an address from a setting, "the value is part of what the workspace trust check fingerprints"), approved by the board on HAL-1949; trust build plan item 3a on HAL-188 (HAL-2191), for HAL-983

The workspace package shall add each local integration to the trust content, sorted by id, with its folder relative to the workspace without a trailing `/`, the hash of every file in its folder, `integration.yaml` included, and the URL the workspace's setting holds for each `{ fromSetting }` host, by setting name, normalised as connector URLs are, `null` while the setting isn't set, and only the reason for a URL that can't be trusted, never its password. So that a change can name them, it shall also list the sheet's fields that widen what the code may do: what it provides, every host with the class of address it may reach (`public` for a fixed host name, the declared class for a `{ fromSetting }` host), every secret by name only with the hosts it may go to and where it is sent, every Google scope without its reason, every tool with its risk and whether its result is marked as outside content, and what it needs beyond HTTP. It shall refuse a folder that is absolute, not inside the workspace or not a clean path by the rule for the code's paths, and two integrations with the same id. A workspace without local integrations shall have the same content and fingerprint as before. The trust changes shall list integrations that are new, changed (with the fields that differ) and removed. Since the sheet is one of the files, a change to one of those fields shall show as that field and `code`, and a change to the sheet's other fields or wording as `code` only. The other fields stay out on their own because they don't widen what the code may do: its id, version and kit version, its wording (descriptions, a tool's noun, a scope's reason, Google's API names), the Google APIs and check read, which only guide setup, the tokens the code keeps for itself, its request limits, which can only make a request stop sooner, and its recording rules, which only affect tests. Whether the runner is fenced shall not be in the content.

## Examples

- Given a local integration `home-station` in `integrations/home-station/` whose `url` setting holds `HTTP://192.168.1.20:8123`,
  then the content lists its folder `integrations/home-station`, that it provides `connector`, `api.example.com` as `public`, `‹setting url›` as `private`, `‹secret station-key›` with its hosts and header, no Google scopes, `read-sensors` as `read` and not outside content, no needs, the hash of its files and `{ url: "http://192.168.1.20:8123/" }`.
- Given its folder is `/srv/home-station`, `../home-station`, `.` or `integrations\home-station`,
  then it is refused.
- Given two local integrations with the id `home-station`,
  then they are refused.
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
  when a fixed address, the class of an address, a secret's name or hosts, a tool's risk or whether its result is outside content, what it provides, what it needs, a Google scope or its folder changes,
  then the fingerprint changes and the change lists that field, with `code` too when the edit was to `integration.yaml`.
- Given a trusted workspace with `home-station`,
  when only a tool's description or noun or a Google scope's reason changes in `integration.yaml`,
  then the change lists `code` only.
- Given a trusted workspace with `home-station`,
  when the setting is written with a capital scheme or the default port,
  then the fingerprint stays the same.
- Given a trusted workspace with `home-station`,
  when it is removed,
  then it is listed as removed and the change only removes things.
- Given a trust record from before integrations were in the content,
  when the workspace now has `home-station`,
  then it is listed as new.
