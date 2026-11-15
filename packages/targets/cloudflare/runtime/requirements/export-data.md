# runtime.export-data

- Status: active
- Since: 0.1.0
- Source: HAL-9486 (part 9b of HAL-197); multi-cloud ADR on HAL-35, 5.6; format `format.runtime-export`; decided on HAL-9480

With the admin key, `GET /admin/export` shall answer the manifest of `@halonicjs/format/runtime-export` for the deployment named by `HALONIC_DEPLOYMENT_ID`, and `GET /admin/export/files/<path>` shall answer the bytes of one file the manifest lists. The files are the run logs (`runs/<run id>.jsonl`, for every run whose id can be a file name), the record logs of every collection except the sign-in tokens' (`records/<SHA-256 of the name in UTF-16LE>.jsonl`) and every blob (`blobs/<xx>/<sha256>`). Each entry's `bytes` and `sha256` shall be those of the bytes the file route answers, and the entries shall be in byte order of `path`. No secret store, token collection, run snapshot or run list shall be in an export.

A run log or record log that holds something shaped like a secret (`findSecretShape`) shall stop the export: the manifest and that file answer 409 `secret_found` with the file's path and the kind, never the text. A path the manifest doesn't list shall answer 404; a deployment that isn't fully configured shall answer 503 and name nothing. The Worker shall read one file at a time, so it never holds the whole export in memory.

## Examples

- Given a run, a collection and a blob, then the manifest lists three files in path order, and each file's size and SHA-256 match what its route answers.
- Given the sign-in tokens' collection, then no file of the manifest holds it and its path answers 404.
- Given a run log with a key-shaped value, then the manifest answers 409 `secret_found` naming `runs/<run id>.jsonl` and `ai-provider-key`, without the value.
- Given `GET /admin/export/files/runs/nothing.jsonl`, then it answers 404.
