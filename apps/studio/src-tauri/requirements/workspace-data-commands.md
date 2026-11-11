# studio.src-tauri.workspace-data-commands

- Status: draft
- Since: 0.1.0
- Source: HAL-6175; `blobsFolder` and `recordsFolder` in `@halonicjs/profile`; `blobCommands` and `recordCommands` in `packages/adapters/fs-tauri`; `studio.src-tauri.crates.blob-store.blob-store`, `studio.src-tauri.crates.record-store.record-store`

When the page calls a `blob_*` or `record_*` command for a workspace, the shell shall keep the blobs in the folder `blobsFolder` names and the records in the folder `recordsFolder` names, in `@halonicjs/profile`, for the workspace's real path in the CLI's profile, and never in a folder the page names. If the workspace is not a folder the person opened in the shell, nor inside one, then the shell shall refuse the call as `folder_not_open` without reading or writing anything. It shall take a blob's bytes only as strict base64url, refusing other text as `invalid_data`, and answer them the same way. It shall refuse with the store's own kind and words otherwise. When a record write has stored its lines, the shell shall answer that it did, also when the release of the write lock failed afterwards, and log that error.

## Examples

- Given the opened folder `acme`,
  when the page calls `blob_get` for `acme/sub/..`,
  then the shell reads `<profile>/workspaces/<key of acme>/blobs`.
- Given no opened folder,
  when the page calls `record_append` for `acme`,
  then it is refused as `folder_not_open`.
- Given `blob_put` with the data `aGVsbG8=`,
  when the shell reads it,
  then it is refused as `invalid_data`.
- Given a replace that wrote the new log but couldn't release the write lock,
  when the shell answers,
  then the answer is `{ "status": "replaced" }`, and the lock's error is logged.
