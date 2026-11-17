# files.tree.reveal-active-file

- Status: active
- Since: unreleased
- Source: HAL-329 files flow 3.3 (new); req-files (HAL-110); HAL-1293

When the user switches to a file tab while the file tree is shown, the file tree shall open the folders down to that file and select its row.

## Examples

- Given "Files" is shown with all folders closed, when the user switches to the tab of `hubs/p/agents/a.agent.yaml`, then "hubs", "p" and "agents" are open and "a.agent.yaml" is selected.
