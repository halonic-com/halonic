# app.trust-service-read-only

- Status: active
- Since: unreleased
- Source: HAL-16381 (Liam's decision 1): a check of files read earlier must never write the trust record, so it can't undo trust a person gave since

When a caller asks for a read-only check of a workspace, the app shall answer exactly as `app.trust-service` does, a change that only removes included, but it shall never write the trust record: a record shrinks only through a check that isn't read-only. A read-only check shall never count as trusted content the record doesn't hold. When a read-only check says trusted, the grant it gives shall be the stored record's (its location and fingerprint), so that a check of that grant against the trust store, as the agent host does before it starts a connector, still passes.

## Examples

- Given a person trusted the connectors "files" and "mail",
  when a read-only check is asked of files with only "files",
  then it says trusted and that "mail" was removed, its grant has the record's fingerprint, and the record still holds "files" and "mail".
- Given a person trusted only "files",
  when a read-only check is asked of files with "files" and "mail",
  then it says changed, and the record still holds only "files".
