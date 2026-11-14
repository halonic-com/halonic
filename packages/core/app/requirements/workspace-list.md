# app.workspace-list

- Status: active
- Since: 0.1.0
- Source: the Models pages list `providers/*.yaml` with unsaved changes applied (HAL-1292)

When a feature lists the files under a folder of an open workspace, the kernel shall give the paths the saved files and the unsaved changes make together: a new unsaved file is listed, an unsaved delete is left out. The paths shall be sorted and relative to the workspace, as `DefinitionSource.list` gives them.

## Examples

- Given `providers/a.yaml` saved and `providers/b.yaml` changed but not saved,
  when a feature lists `providers`,
  then both paths are listed, sorted.
- Given `providers/a.yaml` saved and deleted but not saved,
  when a feature lists `providers`,
  then the path is not listed.
- Given a file `models.yaml` changed but not saved,
  when a feature lists `providers`,
  then `models.yaml` is not listed.
