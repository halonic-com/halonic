# workspace.extract

- Status: active
- Since: 0.1.0
- Source: HAL-4845 (HAL-187 item 8): the old `studio extract` at `784f78d` (`planExtract` in `core/config`, `extractHub` in the CLI) and its two tests, carried over in meaning; hub `uses` keeps a hub self-contained "so it can later move to a workspace of its own"; writing through `copyWorkspace` (`workspace.copy`)

When `planHubExtract` is given a loaded workspace and one of its hubs, the workspace package shall return as data the files of a new workspace that holds that hub alone: every file in the hub's folder; `models.yaml`, the providers and the runtimes; the shared items the hub lists in `uses` and those its agents name and its routines watch for mail that it has no own copy of, with a skill's whole folder, a `files` knowledge source's documents under its `config.path` and the collections a taken collection refers to; the workspace-level routines that run in the hub; the `.gitignore`; and the hub's id, name and description for `workspace.yaml`. It shall leave `deployments.yaml`, the other hubs and the root's other files behind. If the hub isn't one of the workspace's hubs, then it shall say so and name the hubs there are. If the workspace has errors, then it shall say how many and plan nothing. When `extractHub` writes the plan into an empty `DefinitionStore`, it shall write it with `copyWorkspace`, with the original `workspace.yaml` given the hub's id, name and description, its description removed when the hub has none, and its comments and other settings kept, and shall not change the original workspace. On a dry run, it shall write nothing and give the files it would write. If the target lists any file, then it shall write nothing and say that the target isn't empty.

## Examples

- Given a workspace with hubs `family` and `investing`, where `family` has no `uses` and its agent names the shared skill `tone`, knowledge source `notes` and collection `chores`, and a workspace-level routine runs in `family` on mail from the shared connector `mailbox`, when `family` is planned, then the plan holds the hub's files, `tone`'s folder, `notes` and its documents, `chores` and the `people` collection it refers to, `mailbox`, the routine, `models.yaml`, the provider, the runtime and the `.gitignore`, and nothing of `investing`, `deployments.yaml` or the unused skill.
- Given the hub `investing` with `uses: { connectors: [bank] }`, when it is planned, then the only shared item taken is `bank`.
- Given `famly`, when it is planned, then the answer is that there's no such hub, with `family` and `investing` as the hubs there are.
- Given a workspace whose agent names a skill that doesn't exist, when a hub is planned, then the answer is that the workspace has one error.
- Given an empty target, when `family` is written, then the new workspace loads with no errors and exactly one hub, and its `workspace.yaml` keeps its comment and `privacy.localOnly: true` with `id: family` and `name: Family affairs`.
- Given a target with a `notes.txt`, when `family` is written, then nothing is written and the answer is that the target isn't empty.
