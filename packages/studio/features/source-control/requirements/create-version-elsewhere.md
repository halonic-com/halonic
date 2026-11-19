# source-control.create-version-elsewhere

- Status: active
- Since: unreleased
- Source: HAL-13215 (follow-up of HAL-13205); flow-agents 3.1 and 3.3 (HAL-13178): the agent page's "Changes not live yet · Review and make live", and the run dialogs' "Make live first" and "Make live and run"

When another feature opens Create version for some items through `VersionDialogService`, the source control feature shall open Create version over whatever page is open, with only those items in it, and with "Who should versions be from?" first when the workspace has no name or email for versions (`source-control.identity`). It shall answer `made` once the version is created, and `cancelled` when the person closes either dialog without a version. It shall answer `cancelled` at once when the folder has no history, when the folder stops having history while the dialog is open (which closes it), when another Create version replaces this one, and when the workspace closes. The dialog shall be drawn once, also while the Changes page is open.

## Examples

- Given `agents/triage.agent.yaml` and `README.md` changed,
  when the agent page opens Create version for `agents/triage.agent.yaml`,
  then the dialog lists that item alone, and creating records only that file and answers `made`.
- Given the person presses Cancel in that dialog,
  then nothing is recorded and the answer is `cancelled`.
- Given the workspace has no name or email for versions,
  when a run dialog opens Create version,
  then "Who should versions be from?" opens first, and Create version follows once they are saved.
- Given the folder is not a git repository,
  when a feature opens Create version,
  then no dialog opens and the answer is `cancelled`.
- Given the Changes page is open,
  when a feature opens Create version,
  then one dialog opens, not two.
