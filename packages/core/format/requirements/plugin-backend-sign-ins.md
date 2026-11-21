# format.plugin-backend-sign-ins

- Status: active
- Since: unreleased
- Source: HAL-984 design (`HAL-984#document-design`, section 6: the trust check names each sign-in), HAL-7889 (pull request 1), HAL-8613 (the trust check shows a backend's sign-ins since #4066, so the refusal goes)

The plugin check shall accept a backend, or an `integration.yaml` read as a plugin, that declares `signIns`, and check them as an integration sheet's, with each problem at its place under `backend`. A backend's sign-ins need `sdk: 2` or higher: the sheet's `sign-ins-need-kit-2` shall be said at `sdk`, in the plugin's words, as a plugin has no `kit`. The trust check names each sign-in's hosts, so the user approves them with the plugin.

## Examples

- Given a plugin whose backend declares the sign-in `example-account` and `sdk: 2`, when it is checked, then it passes.
- Given that plugin with `sdk: 1` and a `revokeUrl` on a host that is neither its token host nor its sign-in host, when it is checked, then it fails with `sign-ins-need-kit-2` at `sdk` ("signIns need sdk: 2 or higher, and this plugin says sdk: 1. Set sdk: 2") and `sign-in-revoke-host` at `backend.signIns.example-account.revokeUrl`.
- Given a plugin whose backend has no `signIns`, when it is checked, then it passes as before.
