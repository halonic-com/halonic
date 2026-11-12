# format.plugin-backend-sign-ins

- Status: active
- Since: 0.2.0
- Source: HAL-984 design (`HAL-984#document-design`, section 6: the trust check names each sign-in), HAL-7889 (pull request 1)

The plugin check shall refuse a backend, or an `integration.yaml` read as a plugin, that declares `signIns`, with `backend-sign-in` at `backend.signIns.<name>`, until the trust check and the trust content show a sign-in. Without this the user would approve a plugin whose sign-in they were never shown.

## Examples

- Given a plugin whose backend declares the sign-in `example-account` and `sdk: 2`, when it is checked, then it fails with `backend-sign-in` at `backend.signIns.example-account`.
- Given a plugin whose backend has no `signIns`, when it is checked, then it passes as before.
