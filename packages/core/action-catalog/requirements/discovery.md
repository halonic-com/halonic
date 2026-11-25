# action-catalog.discovery

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 4.1 and 4.2; task HAL-17561

When a definition file is added under `src/<service>/` in the action-catalog package, the shipped catalog shall offer it by its id and version, with the SHA-256 of its source, from the file `pnpm discover --fix` writes, without a hand-edited list, and every definition's id shall be `<service>.<file name>` and its service the folder's name.

## Examples

- Given `src/github/upload-social-preview.ts`,
  when the catalog is asked for `github.upload-social-preview` version 1,
  then it returns that definition, and its source hash is the SHA-256 of the file.
- Given the same catalog,
  when it is asked for `github.upload-social-preview` version 2 or for `github.unknown`,
  then it has none.
