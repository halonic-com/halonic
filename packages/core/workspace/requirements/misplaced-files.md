# workspace.misplaced-files

- Status: active
- Since: unreleased
- Source: HAL-12595, from the C44 docs check on HAL-12580 (point P5): `halonic validate` said "No problems" for a file it never read

When `loadWorkspace` skips a file that no kind places but that is plainly meant as a kind's file, the workspace package shall list it as ignored and add a warning on that file with code `misplaced-file` at line 1, column 1, that names where such a file is read. A file is plainly meant as a kind's file when it would be placed at the workspace root but sits in a hub, or would be placed in a hub but sits at the root, or when it is a YAML file directly in a kind's folder, in a scope the kind allows, whose name no kind there takes. Any other file a kind doesn't place, such as a README or a file in an older layout, shall get no warning. Because the loader gives the warning, `halonic validate`, `halonic run` and Studio report it alike, and `halonic validate` passes with it.

## Examples

- Given `hubs/billing/library/collections/invoices.collection.yaml`, when the workspace is loaded, then it is ignored with the warning "Halonic reads this file only at the workspace root, as library/collections/invoices.collection.yaml".
- Given `hubs/billing/providers/openai.yaml`, when the workspace is loaded, then the warning says the file is read only at the workspace root, as `providers/openai.yaml`.
- Given `hub.yaml` at the workspace root, when the workspace is loaded, then the warning says "Halonic reads this file only inside a hub, as hubs/<hub>/hub.yaml".
- Given `agents/clerk.yaml`, when the workspace is loaded, then the warning says "Halonic reads files in agents/ only when they're named <id>.agent.yaml: rename it to clerk.agent.yaml".
- Given `hubs/billing/workflows/invoice.yml`, when the workspace is loaded, then the warning names both names the `workflows/` folder takes, `<id>.workflow.yaml` or `<id>.test.yaml`, and suggests `invoice.workflow.yaml` or `invoice.test.yaml`.
- Given `notes/README.md`, `agents/README.md` or `hubs/billing/flows/archive.flow.yaml`, when the workspace is loaded, then each is ignored without a warning.
- Given a workspace with `agents/clerk.yaml` and no other problem, when `halonic validate` runs, then it lists the warning with a `!` under `agents/clerk.yaml` and exits with 0.
