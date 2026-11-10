# halonic-trust-store

The trust records the Studio shell keeps in the profile (HAL-2612). `FileTrustStore` keeps them exactly as `FileTrustStore` in `packages/adapters/fs-node` does, so the desktop app and the CLI share one folder of records: one JSON file per record, named by the SHA-256 of the location's UTF-16 code units (`sha2`, which the shell already builds), with the location as the first key. Plain Rust with no Tauri types; the shell's `trust_*` commands wrap it.

- `get`, `grant`, `revoke` and `list` keep the `TrustStore` contract: locations compared exactly as given, one record per location, listed in UTF-16 code-unit order as JavaScript sorts.
- Records are `serde_json::Value`s. The store only checks that a record is an object with a text `location`; `TrustService` in the page owns the rest. `serde_json` sorts the other keys when it writes a record. That is safe because the fingerprint is computed over canonical JSON, which sorts keys too.
- A record that can't be read is `TrustError::Unreadable`, naming its location, or its file when the location can't be read either. `revoke` still deletes it, so the person can recover.
- Writes go through a temporary file and a rename. The folder gets mode `700` and each file `600`.

The store doesn't decide which folders a grant may open. That is the shell's rule: it calls `OpenedFolders::open` only for a folder the person chose in the shell.

`tests/fixtures/written-by-fs-node` holds two records written by `fs-node`'s `FileTrustStore`, byte for byte; the tests read them and write the same record back. The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with `trust_files_`.
