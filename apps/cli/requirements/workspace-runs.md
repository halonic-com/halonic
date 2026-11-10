# cli.workspace-runs

- Status: active
- Since: 0.1.0
- Source: HAL-2742; runs in the profile folder (C53, HAL-2022 G4, HAL-2077)

The CLI shall open a workspace's runs in the person's profile folder, in the runs folder that `workspaceFolders` names after the workspace's real path, and never in the workspace itself. Two spellings of one workspace folder shall open the same runs. Opening the runs shall create nothing, and a workspace with no runs yet shall list none.

## Examples

- Given `HALONIC_HOME` set to a profile folder and a run stored for the workspace `acme`,
  when the CLI opens the runs of `acme`,
  then it lists that run, and nothing was written inside `acme`.
- Given a link `acme-link` to the workspace `acme`,
  when the CLI opens the runs of `acme-link`,
  then it lists the runs of `acme`.
- Given a workspace with no runs,
  when the CLI opens its runs,
  then it lists none, and the profile folder is still empty.
- Given a folder that doesn't exist,
  when the CLI opens its runs,
  then it fails and creates nothing.
