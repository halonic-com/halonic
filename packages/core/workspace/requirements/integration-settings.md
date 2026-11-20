# workspace.integration-settings

- Status: active
- Since: unreleased
- Source: HAL-14092 (a local integration's settings and secret picks come from its connector file)

When `loadWorkspace` has parsed a workspace's files and two connector files, of the root or of any hub, name the same local integration folder with different `settings`, the workspace package shall report an error at the `settings` of each such file after the first by path, naming the folder and the first file. A file without `settings` gives the integration none. Settings with the same keys and values in another order are the same.

## Examples

- Given two connector files for `integrations/issues` with `{ url: 'http://a.test', limit: 2 }` and `{ limit: 2, url: 'http://a.test' }`, when it is loaded, then there is no issue.
- Given two connector files for `integrations/issues` with different `url` values, when it is loaded, then the second gets the error `integration-settings-differ` at `transport.integration.settings`.
- Given one connector file with settings and another without, when it is loaded, then the second gets the error.
