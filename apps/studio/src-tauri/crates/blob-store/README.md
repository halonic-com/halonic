# halonic-blob-store

The blob folders the Studio shell writes (HAL-6175), in the same files as `FolderBlobStore` in `fs-node`, so a blob the desktop app stored is there for the CLI, and the other way round. Plain Rust with no Tauri types; the shell's `blob_*` commands wrap it, and `TauriBlobStore` in `packages/adapters/fs-tauri` calls them.

- Each blob is the file `<first two hex characters>/<hash>` in the blob folder, `<profile>/workspaces/<key>/blobs`, holding only the bytes. The media type isn't kept, as the `BlobStore` port allows.
- A put hashes the bytes itself, writes them to a temporary file in the blob's own folder, flushes it and renames it into place. Bytes already stored, in a plain file with one name, are not written again.
- Folders are created with mode `700` and files with mode `600`.
- A hash that isn't 64 lowercase hex characters never reaches a path (`invalid_hash`).
- A blob file that is a link, a hard link or not a plain file can't be read, and a put replaces it rather than writing through it. A blob's two-character folder that is a link or not a folder is refused by both (`linked_blob`). Windows' count of a file's names isn't in Rust's standard library, so there hard links aren't refused; on Unix the open file is checked again, in case it was swapped in between.

## API

- `BlobFolder::new(root)`: one blob folder. The shell works the path out; the page never names one.
- `put(bytes)`: stores the bytes and gives their hash.
- `get(hash)`: the bytes, or `None` when there is no blob.
- `base64url::encode` and `base64url::decode`: the rules of `encodeBase64url` and `decodeBase64url` in `@halonicjs/std`, since blobs cross the IPC as text.

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves: `blob_store_`.
