# deploy.worker-transfer

- Status: active
- Since: 0.1.0
- Source: HAL-6706; build plan 3c (HAL-198); multi-cloud ADR 5.6

The `exportFromWorker` and `importToWorker` functions shall move a deployment's runtime export between a folder and the Worker's `/admin/export` and `/admin/import` routes, sending the job's key only as `Authorization: Bearer`, only over HTTPS and never following a redirect. An export shall check every file against the manifest's size and SHA-256, write the manifest last, and write only into a folder that is empty or new. An import shall check every file of the folder against the manifest before it sends any, stage each file, post the manifest, and when the Worker says `files_missing` or `files_differ` stage those paths once more and post again. A refused export or import shall fail with `export-refused` or `import-refused`, naming paths and kinds and never data; any other failure shall be `transfer-failed`. No error shall hold the key.

Rationale: the folder is what a user keeps and what Node imports, so a half-written or altered one must never look complete, and the key opens the deployment's data.

## Examples

- Given a Worker that serves a manifest and its files, then the folder holds the files and the manifest.
- Given a file whose bytes differ from the manifest, then the export fails with `transfer-failed` and writes no manifest.
- Given the Worker answers 409 `secret_found`, then it fails with `export-refused` naming the path and shape.
- Given a folder with a changed file, then nothing is sent.
- Given `files_missing` once and then success, then the import returns the counts.
- Given `conflict`, then it fails with `import-refused` and does not retry.
- Given an `http:` address, then nothing is sent.
- Given any failure, then the key is not in its message.
