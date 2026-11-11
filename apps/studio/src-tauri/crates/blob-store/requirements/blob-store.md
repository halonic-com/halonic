# studio.src-tauri.crates.blob-store.blob-store

- Status: draft
- Since: 0.1.0
- Source: HAL-6175; `FolderBlobStore` in `fs-node` and `fs-node.blob-store-files`; `fs-tauri.runs-and-blobs-on-disk`

The shell shall keep each blob as `fs-node` keeps it: the file `<first two characters of the hash>/<hash>` in the blob folder, holding only the bytes, with folders created with mode `700` and files with mode `600`. It shall hash the bytes itself, write a blob to a temporary file in the blob's own folder and rename it into place, and write nothing for bytes already stored in a plain file with one name. A missing blob or blob folder shall read as none. A hash that isn't 64 lowercase hex characters shall be refused before any path is built. A blob file that is a symbolic link, a hard link or not a plain file shall be refused on read and replaced on put, without writing through it, and a blob's two-character folder that is a link or not a folder shall be refused on both. Bytes shall cross to the page as strict base64url, with the rules of `@halonicjs/std`.

## Examples

- Given a put of `hello`,
  when the folder is read,
  then it holds `2c/2cf24dba…9824` with the bytes `hello`, and no temporary file.
- Given `hello` stored by the CLI,
  when it is read by its hash,
  then it gives the bytes `hello`.
- Given the file for `hello`'s hash is a link to a file outside the folder,
  when it is read, then it is refused;
  when `hello` is put, then the link is replaced and the file it pointed to is unchanged.
- Given `get("../secret")`,
  when it is called,
  then it is refused and no file is read.
