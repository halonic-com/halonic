# ports.trust-store

- Status: active
- Since: 0.1.0
- Source: HAL-65 requirements (`workspace.trust.stored-in-profile`), decided on HAL-181: the port only stores, `TrustService` decides

The ports package shall have a `TrustStore` port that gets, grants, revokes and lists trust records by location, where a record holds the location, the fingerprint, the normalised content it was computed from, the time, the app version, the connector pins and the origin. The port shall only store records: it shall have no method that computes a fingerprint or decides whether a source is trusted.

The port's documentation shall state that a record that can't be read makes `get` and `list` throw with its location, and that `revoke` still deletes it. It shall state that locations are compared exactly as given, without case folding or Unicode normalisation, and that `list` sorts by UTF-16 code unit.

## Examples

- Given the `TrustStore` port,
  when its methods are read,
  then they are exactly `get`, `grant`, `revoke` and `list`.
- Given `TrustStore.get`,
  when it is called with a location,
  then it returns a `TrustRecord` or `null`.
- Given a `TrustRecord` with a pin for the connector `mail`,
  when it is compiled,
  then it compiles; a record without a fingerprint or with the origin `agent` doesn't.
