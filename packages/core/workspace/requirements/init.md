# workspace.init

- Status: active
- Since: 0.1.0
- Source: HAL-1892 (HAL-187 work plan, item 5; plan section 9: "`halonic init` puts `.env` in `.gitignore`")

When `initWorkspace` lays out a new workspace through a `DefinitionStore`, the workspace package shall write a `workspace.yaml` with the given name and the given id, or an id made from the name, and a `.gitignore` that lists `.env` and `.env.*`, keeping the lines of a `.gitignore` already there, and return the files it wrote as data. If the store already has a `workspace.yaml`, or the settings fail the workspace kind's checks, then it shall write nothing and say why.

## Examples

- Given an empty store, when a workspace named `Acme Billing` is laid out, then `.gitignore` and `workspace.yaml` are created, the id is `acme-billing`, and loading the store gives no issue.
- Given a store with a `.gitignore` that lists `node_modules/` and no newline at its end, when a workspace is laid out, then `.gitignore` keeps `node_modules/` on its own line, gains `.env` and `.env.*`, and is reported as updated.
- Given a store whose `.gitignore` already lists `.env` and `.env.*`, when a workspace is laid out, then `.gitignore` is not written.
- Given a store with a `workspace.yaml`, when a workspace is laid out, then nothing is written and the answer is that it is already a workspace.
- Given the id `Acme`, when a workspace is laid out, then nothing is written and the problem names the key path `["id"]`.
- Given a store where writing `workspace.yaml` fails, when a workspace is laid out, then the error is thrown, and laying it out again afterwards works.
