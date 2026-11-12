# format.runtime-export

- Status: active
- Since: 0.1.0
- Source: HAL-6700 (HAL-198 step 1b); multi-cloud ADR on HAL-35, rule 3 and 5.6; plan 4.4; review changes on HAL-6707; review follow-ups on HAL-7352

The `@halonicjs/format/runtime-export` entry point shall offer `runtimeExportManifestSchema`, `RuntimeExportManifest`, `RUNTIME_EXPORT_FORMAT_VERSION` and `RUNTIME_EXPORT_MANIFEST`, the format of `halonic deploy export` and `import`: one deployment's runtime data in a folder that holds the manifest `halonic-export.json` and the files it lists, in the layout `halonic serve` will keep in the profile (it isn't built yet). Runs are kept per deployment, but records and blobs are kept per workspace, so the export step decides which records and blobs an export carries. It shall import only schema-kit and ports (never `yaml`) and not be re-exported from `@halonicjs/format`, so a Worker can write an export without the YAML parser.

A file shall have one of three paths: `runs/<run id>.jsonl` (a run's event log; Inbox items are run events), `records/<SHA-256 of the collection name in UTF-16LE>.jsonl` (a collection's record changes, agent memory included) or `blobs/<first two hex characters>/<SHA-256>` (a file's bytes, named by their hash). The run id follows the run store's rule. The manifest and each file entry shall refuse any key they don't list, so the stores of secrets, sign-in tokens, sessions, harness sign-ins and encryption keys have no place in an export: this is how the no-secrets rule is enforced for those stores. A schema can't see inside a file, so a secret a run handled can still be in its log; the export step scans the contents (HAL-7193). Tool approvals, trust and settings are left out on purpose. Run snapshots and run lists are caches and are left out too; an import rebuilds them from the logs.

The manifest shall hold `formatVersion` (now 1), the source `deployment` id, `exportedAt` in UTC, a date and time that exist, and `files`, each with its `path`, `bytes` and `sha256`, in byte order of `path`, so two exports of the same data list their files the same way. A newer `formatVersion` shall fail with a message that says to update Halonic. Two paths that open one file on a case-insensitive system, and a blob whose path isn't made of its own hash, shall fail. The JSON Schema shall equal the committed `spec/runtime-export.schema.json`, whose `$id` names the format version.

## Examples

- Given the example export, when its manifest is parsed, then it passes, it lists every file in the folder once with its size and SHA-256, its run log reads as run events and its records log is named as `FileRecordStore` names it.
- Given every file of the example export, when the secret check (`findSecretShape`) reads it, then it finds nothing.
- Given a manifest with an extra key `tokens`, or a file entry with an extra key `secret`, then it fails with an unrecognised key.
- Given a file at `harness-settings/clerk/claude-code/auth.json`, `tokens/google.json`, `runs/r-invoice.snapshot.json`, `runs/r-invoice.lock`, `runs/../../x.jsonl`, `runs/NUL.jsonl` or `records/leads.jsonl`, then it fails at that file's `path`.
- Given `formatVersion: 2`, then it fails at `formatVersion` with "This export is in format 2, and this Halonic reads format 1. Update Halonic to import it."
- Given a blob listed at `blobs/00/<its hash>` where the hash doesn't start with `00`, then it fails at that file's `sha256`.
- Given `runs/r-invoice.jsonl` and `runs/R-Invoice.jsonl`, then the second fails with "Another file has this path".
- Given the example's files with the records log before the blob, then the blob fails at its `path` with "List the files in order of their path".
- Given `exportedAt` in month 13, on 30 February or at hour 24, then it fails at `exportedAt`; given 29 February 2028 without milliseconds, then it passes.
- Given the imports of `src/runtime-export/index.ts` (`from`, `import`, `import()` and `require`), followed through every relative file, then the only packages are `@halonicjs/ports` and `@halonicjs/schema-kit`.
