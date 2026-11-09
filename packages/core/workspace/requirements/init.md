# workspace.init

- Status: active
- Since: 0.1.0
- Source: HAL-1892 (HAL-187 work plan, item 5; plan section 9: "`halonic init` puts `.env` in `.gitignore`"; cli-output 3.1, approved on HAL-2123: "the folder isn't empty")

When `initWorkspace` lays out a new workspace through an empty `DefinitionStore`, the workspace package shall write a `.gitignore` that lists `.env` and `.env.*` and a `workspace.yaml` with the given name and the given id, or an id made from the name, and return the files it wrote as data. If the store lists any file, or the settings fail the workspace kind's checks, then it shall write nothing and say why. If writing `workspace.yaml` fails, then it shall remove the `.gitignore` it wrote and throw the write's error.

## Examples

- Given an empty store, when a workspace named `Acme Billing` is laid out, then `.gitignore` and `workspace.yaml` are created, the id is `acme-billing`, and loading the store gives no issue.
- Given a store with a `workspace.yaml`, when a workspace is laid out, then nothing is written and the answer is that the store isn't empty.
- Given a store with only a `.gitignore`, when a workspace is laid out, then nothing is written and the `.gitignore` is unchanged.
- Given the id `Acme`, when a workspace is laid out, then nothing is written and the problem names the key path `["id"]`.
- Given a store where writing `workspace.yaml` fails, when a workspace is laid out, then the error is thrown, the store is empty again, and laying it out again afterwards works.
