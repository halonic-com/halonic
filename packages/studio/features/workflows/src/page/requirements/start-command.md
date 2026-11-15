# workflows.page.start-command

- Status: draft
- Since: 0.1.0
- Source: HAL-10129; first-run walk G1b

When a workflow can run, the workflows feature shall show under the page's title row, on both the Flow and Configuration tabs, the line "Start it from a terminal:" with `halonic run` and the workflow's id, and a **Copy command** button that copies it; when the workflow has errors in its Problems, it shall show no command.

## Examples

- Given the workflow `reply` has no errors, then both tabs show `halonic run reply` and **Copy command**.
- Given the workflow has an error, then neither tab shows the command.
