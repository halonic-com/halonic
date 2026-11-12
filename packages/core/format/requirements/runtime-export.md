# format.runtime-export

- Status: active
- Since: 0.1.0
- Source: HAL-6700 (HAL-198 step 1b); multi-cloud ADR on HAL-35, rule 3 and 5.6; plan 4.4; review changes on HAL-6707

The `@halonicjs/format/runtime-export` entry point shall offer `runtimeExportManifestSchema`, `RuntimeExportManifest`, `RUNTIME_EXPORT_FORMAT_VERSION` and `RUNTIME_EXPORT_MANIFEST`, the format of `halonic deploy export` and `import`: one deployment's runtime data in a folder that holds the manifest `halonic-export.json` and the files it lists, in the layout `halonic serve` keeps in the profile. It shall import only schema-kit and ports (never `yaml`) and not be re-exported from `@halonicjs/format`, so a Worker can write an export without the YAML parser.

A file shall have one of three paths: `runs/<run id>.jsonl` (a run's event log; Inbox items are run events), `records/<SHA-256 of the collection name in UTF-16>.jsonl` (a collection's record changes, agent memory included) or `blobs/<first two hex characters>/<SHA-256>` (a file's bytes, named by their hash). The run id follows the run store's rule. The manifest and each file entry shall refuse any key they don't list, so a secret, sign-in token, session, harness sign-in or encryption key has no place in an export: this is how the no-secrets rule is enforced, since a schema can't recognise a secret by its value. Run snapshots and run lists are caches and are left out; an import rebuilds them from the logs.

The manifest shall hold `formatVersion` (now 1), the source `deployment` id, `exportedAt` in UTC and `files`, each with its `path`, `bytes` and `sha256`. A newer `formatVersion` shall fail with a message that says to update Halonic. Two paths that open one file on a case-insensitive system, and a blob whose path isn't made of its own hash, shall fail. The JSON Schema shall equal the committed `spec/runtime-export.schema.json`, whose `$id` names the format version.

## Examples

- Given the example export, when its manifest is parsed, then it passes, it lists every file in the folder once with its size and SHA-256, its run log reads as run events and its records log is named as `FileRecordStore` names it.
- Given every file of the example export, when the secret check (`findSecretShape`) reads it, then it finds nothing.
- Given a manifest with an extra key `tokens`, or a file entry with an extra key `secret`, then it fails with an unrecognised key.
- Given a file at `harness-settings/clerk/claude-code/auth.json`, `tokens/google.json`, `runs/r-invoice.snapshot.json`, `runs/r-invoice.lock`, `runs/../../x.jsonl`, `runs/NUL.jsonl` or `records/leads.jsonl`, then it fails at that file's `path`.
- Given `formatVersion: 2`, then it fails at `formatVersion` with "This export is in format 2, and this Halonic reads format 1. Update Halonic to import it."
- Given a blob listed at `blobs/00/<its hash>` where the hash doesn't start with `00`, then it fails at that file's `sha256`.
- Given `runs/r-invoice.jsonl` and `runs/R-Invoice.jsonl`, then the second fails with "Another file has this path".
- Given the imports of `src/runtime-export/index.ts`, followed through every relative file, then the only packages are `@halonicjs/ports` and `@halonicjs/schema-kit`.
