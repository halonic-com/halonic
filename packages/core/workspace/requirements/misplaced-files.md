# workspace.misplaced-files

- Status: active
- Since: unreleased
- Source: HAL-12595, from the C44 docs check on HAL-12580 (point P5): `halonic validate` said "No problems" for a file it never read; HAL-14297, from the C340 check on HAL-14271 (C23–C25)

When `loadWorkspace` skips a file that no kind places but that is plainly meant as a kind's file, the workspace package shall list it as ignored and add a warning on that file with code `misplaced-file` at line 1, column 1, that names where such a file is read or what to rename it to. A file is plainly meant as a kind's file when it would be placed if it ended in `.yaml` rather than `.yml`; or it would be placed at the workspace root but sits in a hub, or would be placed in a hub but sits at the root; or it is named as one kind's, `hub.yaml` or `<id>` followed by a kind's own suffix such as `.agent.yaml` (or the same with `.yml`), in a folder that kind isn't read from; or it is a YAML file directly in a kind's folder, in a scope the kind allows, whose name no kind there takes. A suggested name never repeats a kind's suffix the file already has. Any other file a kind doesn't place, such as a README or a file in an older layout, shall get no warning. Because the loader gives the warning, `halonic validate`, `halonic run` and Studio report it alike, and `halonic validate` passes with it. When `halonic run` finds no workflow by the name it was given, and none close to it, while the loader skipped such files, it shall say how many it skipped and point at `halonic validate`, since the workflow may be among them.

## Examples

- Given `hubs/billing/library/collections/invoices.collection.yaml`, when the workspace is loaded, then it is ignored with the warning "Halonic reads this file only at the workspace root, as library/collections/invoices.collection.yaml".
- Given `hubs/billing/providers/openai.yaml`, when the workspace is loaded, then the warning says the file is read only at the workspace root, as `providers/openai.yaml`.
- Given `hub.yaml` at the workspace root, when the workspace is loaded, then the warning says "Halonic reads this file only inside a hub, as hubs/<hub>/hub.yaml".
- Given `agents/clerk.yaml`, when the workspace is loaded, then the warning says "Halonic reads files in agents/ only when they're named <id>.agent.yaml: rename it to clerk.agent.yaml".
- Given `hubs/billing/workflows/invoice.yml`, when the workspace is loaded, then the warning names both names the `workflows/` folder takes, `<id>.workflow.yaml` or `<id>.test.yaml`, and suggests `invoice.workflow.yaml` or `invoice.test.yaml`.
- Given `models.yml`, `workspace.yml` or `providers/mock.yml`, when the workspace is loaded, then the warning says "Halonic reads models.yaml, not models.yml: rename it", and the same for the others.
- Given `hubs/notes/agents/announcer.agent.yml`, when the workspace is loaded, then the warning says "Halonic reads announcer.agent.yaml, not announcer.agent.yml: rename it", not `announcer.agent.agent.yaml`.
- Given `notes/hub.yaml` and `notes/agents/announcer.agent.yaml`, when the workspace is loaded, then the hub's warning says "Halonic reads hub.yaml only in hubs/<id>/: move notes/ to hubs/notes/" and the agent's says it goes to `hubs/notes/agents/announcer.agent.yaml`.
- Given `hubs/notes/routines/friday-digest.routine.yaml`, when the workspace is loaded, then the warning says "Halonic reads <id>.routine.yaml files only in workflows/routines/: move it to hubs/notes/workflows/routines/friday-digest.routine.yaml". An agent in `hubs/notes/agent/` and a workflow in the hub's own folder get the same kind of warning, with `agents/` and `workflows/`.
- Given `notes/README.md`, `agents/README.md` or `hubs/billing/flows/archive.flow.yaml`, when the workspace is loaded, then each is ignored without a warning.
- Given a workspace with `agents/clerk.yaml` and no other problem, when `halonic validate` runs, then it lists the warning with a `!` under `agents/clerk.yaml` and exits with 0.
- Given the Acme example with its `support` hub moved out of `hubs/`, when `halonic run support-reply` runs, then it exits with 4 and says "There's no workflow called "support-reply" in Acme." and "Halonic skipped 5 files in Acme for their folder or name. See them with: halonic validate".
