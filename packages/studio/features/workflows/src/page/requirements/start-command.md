# workflows.page.start-command

- Status: draft
- Since: unreleased
- Source: HAL-10129; first-run walk G1b; HAL-12647

When a workflow can run and the page has no **Run** button, the workflows feature shall show under the page's title row, on both the Flow and Configuration tabs, the line "Start it from a terminal:" with `halonic run` and the workflow's id (as `hub/id` when another hub has a workflow with the same id, because `halonic run` then asks for the hub), and a **Copy command** button that copies it; when the workflow has errors in its Problems, it shall show no command.

## Examples

- Given the workflow `reply` has no errors, then both tabs show `halonic run reply` and **Copy command**.
- Given the workflow has an error, then neither tab shows the command.
- Given the page has a **Run** button, then neither tab shows the command.
- Given the hubs `acme` and `beta` both have a workflow `reply`, then the page of `acme`'s `reply` shows `halonic run acme/reply`.
