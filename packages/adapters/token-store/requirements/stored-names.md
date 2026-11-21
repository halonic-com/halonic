# token-store.stored-names

- Status: active
- Since: unreleased
- Source: HAL-14850 (Liam's security review of halonic#4276: removing a plugin's trust signs out its sign-ins)

The token store's records shall give the names of every token they keep, in the stored form (lower case, with `_` for `-`), without reading the token key or opening any value, so that a host can find the tokens it has to remove when it no longer knows their names.

## Examples

- Given the tokens `Google-Refresh` and `s6_gitlab_work-account` set, and a third set and then removed,
  when the stored names are read,
  then they are `google_refresh` and `s6_gitlab_work_account`; the records alone are read, never the token key.
- Given records that hold no token,
  when the stored names are read,
  then there are none.
