# plugin-build.plugin-id

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985; HAL-17986

The plugin builder shall build the plugin id as `halonic-ws.` and the workspace's name, and if that id doesn't match `^halonic-ws\.[a-z0-9][a-z0-9-]{0,62}$`, then it shall refuse the build with the id, without changing the name to make it fit.

## Examples

- Given the workspace name `acme`, then the plugin id is `halonic-ws.acme`.
- Given the workspace name `../acme`, then the build is refused.
- Given the workspace name `Acme`, then the build is refused.
