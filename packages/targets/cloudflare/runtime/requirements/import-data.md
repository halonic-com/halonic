# runtime.import-data

- Status: active
- Since: unreleased
- Source: HAL-9486 (part 9b of HAL-197); multi-cloud ADR on HAL-35, 5.6; format `format.runtime-export`; decided on HAL-9480

The Worker shall, with the admin key, answer `PUT /admin/import/files/<path>` by staging the request body under a path of the export layout (`runs/<run id>.jsonl`, `records/<sha256>.jsonl` or `blobs/<xx>/<sha256>`) and answering 204, and `POST /admin/import` with a manifest of `@halonicjs/format/runtime-export` by applying the staged files only when every file the manifest lists is staged with exactly the manifest's size and SHA-256. A path outside the layout shall answer 400, a body over 50 MiB (a manifest over 16 MiB) 413 and a body that isn't a manifest 400.

When a file is missing or differs, the answer shall be 409 `files_missing` or `files_differ` with the paths, and nothing shall be applied. Before it writes anything the Worker shall also check every file and refuse the import with 409 `files_refused` when a file isn't a run log of its run id, a record log whose lines all belong to the collection its name hashes, or a blob; when the file is the sign-in tokens' collection; and with 409 `conflict` when the deployment already holds different events under a run id or different changes in a collection. A file the deployment holds exactly already shall be skipped, so an import that stopped can be sent again. After a full success the answer shall be 200 `{"imported":{"runs":n,"records":n,"blobs":n}}` and the staged files shall be removed. No answer shall hold the text of a file.

## Examples

- Given a run, a collection and a blob staged with the manifest's hashes, then `POST /admin/import` stores them and answers the three counts.
- Given a staged file one byte longer than its entry says, then the answer is 409 `files_differ` and no other file was written.
- Given a record file whose name isn't the hash of its collection, or the sign-in tokens' file, then the answer is 409 `files_refused`.
- Given the same import sent twice, then the second answers 200 and writes nothing.
