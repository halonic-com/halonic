# app.connector-trouble

- Status: active
- Since: unreleased
- Source: HAL-19175 (I7 PR 4b, HAL-18391 plan section 2.4, Liam's condition that a failure note's `detail` is untrusted)

The app shall read the trouble of a local integration's last call from its request log alone, never from the service's reply. There shall be a trouble only when the log ends with a failure note. A note with field names shall be the trouble `reply-changed`; otherwise the status of the last request before the note shall give it: 401 `not-accepted`, 403 `not-allowed`, 404 `not-found` and 429 `slow-down`, and any other status, or none, no trouble. The trouble shall name the host of that last request only when it is a plain host name with an optional port, and otherwise no host. It shall keep at most 8 field names, and show a field name only when it holds nothing but the path characters `A`–`Z`, `a`–`z`, `0`–`9`, `_`, `.`, `[`, `]` and `-`, else as `{…}`, and cut a name longer than 60 characters to 59 and `…`.

## Examples

- Given a log whose last request got 404 and that ends with a failure note,
  when its trouble is read,
  then it is `not-found`.
- Given a log whose last request got 500 and that ends with a failure note,
  when its trouble is read,
  then there is none.
- Given a failure note that names the field `<b>x</b>`,
  when its trouble is read,
  then the field shows as `{…}`.
- Given a failed call followed by a call that worked,
  when the trouble is read,
  then there is none.
