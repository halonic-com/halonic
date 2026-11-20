# workspace.default-hub

- Status: draft
- Since: unreleased
- Source: HAL-14119; board answer on HAL-12723 ("Can we not make a \"Default\" hub?"); HAL-14118

The workspace package shall give the one hub a workspace gets when it has none: the id `default`, the name "Default", the path `hubs/default/hub.yaml`, and its file's text, which loads as a hub with no issue. A new workspace's template and Studio's New agent and New workflow shall write this hub, so both ways end in the same folder.

## Examples

- `defaultHubId` is `default`, `defaultHubName` is `Default`, and `defaultHubPath` is `hubs/default/hub.yaml`, which `placeOf` reads as the hub `default`.
- `defaultHubText()` is `id: default` and `name: Default`, one per line.
- Given a workspace with that file and its `workspace.yaml`, then it loads with no issue and the file is a hub.
