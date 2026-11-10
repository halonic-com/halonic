# fs-node.blob-store-files

- Status: active
- Since: 0.1.0
- Source: HAL-3814 (plan for `halonic run`, PR A); `BlobStore` port v1

The folder blob store shall keep each blob as one file in the folder it is given, at `<first two characters of the hash>/<hash>`, holding only the bytes. It shall create the folders with mode `700` and each file with mode `600`, and write a blob to a temporary file in the blob's own folder and rename it into place, so a reader gets the whole blob or none and the rename stays on one disk. Storing bytes that are already stored shall write nothing. A folder that doesn't exist yet shall read as empty. A hash that isn't 64 lowercase hex characters shall never reach a path, and the store shall refuse to build a path outside its folder. A blob file that is a symbolic link, a hard link or not a plain file can't be read, so `get` shall throw for it; a put shall replace it, not write through it. A put shall refuse a blob's two-character folder that is a symbolic link or not a folder. The store shall keep the bytes as they were when `put` was called, even when the caller changes them while the put waits.

## Examples

- Given `put` of `hello`,
  when the folder is read,
  then it holds `2c/2cf24dba…9824` with the bytes `hello`, and no temporary file.
- Given a file `secret` next to the store's folder,
  when `get("../secret")` is called,
  then it answers `null` without reading the file.
- Given the file for `hello`'s hash is a link to a file outside the folder,
  when `get` is called, then it throws;
  when `hello` is put, then the link is replaced and the file it pointed to is unchanged.
