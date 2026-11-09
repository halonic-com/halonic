# cli.commands.init.new-workspace

- Status: active
- Since: 0.1.0
- Source: HAL-1892 (HAL-187 work plan, item 5; plan section 9: "`halonic init` puts `.env` in `.gitignore`")

The `halonic init <dir>` command shall lay out a new workspace in `dir` with `initWorkspace`, creating the folder when it is missing, named by `--name` or else by the folder's name, with the id from `--id` or else made from the name. It shall print each file it created or updated and that the workspace is ready, and exit with 0. It shall exit with 1 and write nothing when `dir` is already a workspace, and with 2 when the name or id fails the workspace kind's checks.

## Examples

- Given an empty folder, when `halonic init acme-billing` runs in it, then `acme-billing/workspace.yaml` holds `id: acme-billing` and `name: acme-billing`, `acme-billing/.gitignore` lists `.env`, `halonic validate acme-billing` then exits with 0, and `init` exits with 0.
- Given a folder with a `.gitignore`, when `halonic init` runs on it with `--name "Acme Billing"`, then the `.gitignore` is updated and the id is `acme-billing`.
- Given a folder that has a `workspace.yaml`, when `halonic init` runs on it, then it exits with 1 and the file is unchanged.
- Given `--id Acme`, when `halonic init` runs, then it exits with 2 and writes nothing.
