# workspace.routing-file

- Status: active
- Since: unreleased
- Source: HAL-18263 (plan HAL-17450 rev 5, "Step 2" and "Safety": the routing file is a trust root)

When a workspace has a `routing.yaml` at its root, the workspace loader shall read it as the `routing` kind, with the snapshot's `Routing` schema and `checkRouting`, and `snapshotInputOf` shall give its routing, so that `makeSnapshot` puts it in the snapshot. If the file names another role or has any other field, names an agent by anything but its url key (an email, a bot login, capitals or `_`), holds a key in a name, or names an area like an account or credential field, then the loader shall report an error on `routing.yaml` at that key, leave the file out and give no routing, so `halonic validate` fails and the plugin keeps its defaults. A workspace without `routing.yaml` shall give no routing.

## Examples

- Given `roles: { code-reviewer: liam, second-reviewer: julian }` and `areas: { engine-and-cli: priya }`, when the workspace is loaded, then there is no issue, and the snapshot input and the snapshot hold that routing.
- Given the code reviewer `liam@example.com`, a role `approver` or an area `github-login`, when the workspace is loaded, then `routing.yaml` has an error at `roles.code-reviewer`, `roles` or `areas.github-login`, and the snapshot input has no routing.
- Given no `routing.yaml`, when the snapshot input is made, then it has no routing.
