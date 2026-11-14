# studio.src-tauri.tool-approval-folder

- Status: draft
- Since: 0.1.0
- Source: HAL-8868, plan approved by Liam on HAL-8904; `toolApprovalFolder` in `@halonicjs/profile`; `FileToolApprovalStore` in `fs-node`, which it matches; `fileCommands` in `packages/adapters/fs-tauri`

When the page calls an `fs_*` command with the folder `"tool-approvals"` and a source, the shell shall work in the folder `FileToolApprovalStore` names for the source in the workspace's real path, `tool-approvals/<SHA-256 of [location, source] as JSON>` in the CLI's profile, and never in a folder the page names. If the workspace is not a folder the person opened in the shell, nor inside one, then the shell shall refuse the call as `folder_not_open`, and without a source as `unsafe_path`, without reading or writing anything. It shall refuse the folder as `private_path` when it is inside the workspace. It shall work only on the store's own files, an approval's SHA-256 and `.json`, or `waiting.json`, and list only the whole folder, refusing any other name as `unsafe_path`. A write shall make the folder private to the user and write the file private to the user, and a write or a remove shall hold the folder's `lock` file for as long as it works, as the CLI does.

## Examples

- Given the opened folder `acme` and the source `notes`,
  when the page lists the `"tool-approvals"` folder,
  then the shell lists `<profile>/tool-approvals/<hash of ["<real path of acme>", "notes"]>`.
- Given the opened folder `acme` and no source,
  when the page lists the `"tool-approvals"` folder,
  then it is refused as `unsafe_path`.
- Given the profile inside the opened folder `acme`,
  when the page reads an approval,
  then it is refused as `private_path`.
- Given the file name `lock`,
  when the page writes it in the `"tool-approvals"` folder,
  then it is refused as `unsafe_path`.
- Given a source with no folder yet and a POSIX system,
  when the page writes an approval,
  then the folder is made `700`, the file is written `600`, and the `lock` file is gone again once the write ends.
