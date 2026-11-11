# fs-tauri.runs-and-blobs-on-disk

- Status: draft
- Since: 0.1.0
- Source: HAL-110 stub (HAL-10 migration checklist P5); HAL-6175; where the files go: HAL-119 (the CLI's rule, one shared function) and HAL-2022 G4 (nothing of a workspace's data in the workspace); `FolderBlobStore` in `fs-node`; `ports.blob-store-checks`; `BlobStore` port v1

The desktop stores shall keep a workspace's runs and blobs where the CLI keeps them, in the same format, so `halonic` and the desktop app read each other's runs and blobs: runs as `fs-tauri.run-store` says, and blobs in `<profile>/workspaces/<key>/blobs/<first two hex characters>/<hash>`, the folder `blobsFolder` in `@halonicjs/profile` names, each file holding only the bytes, as `FolderBlobStore` keeps them. (The stub said `.studio/blobs` inside the workspace; HAL-119 and HAL-2022 G4 moved a workspace's data into the profile.)

The Tauri blob store shall implement `BlobStore` and pass its contract suite by calling the shell's `blob_put` and `blob_get` commands, naming the blob folder only by the workspace it was made for, never by a path, and sending and reading the bytes as strict base64url. It shall check media types and hashes with the port's rules before it calls the shell, so a refused media type rejects with a `RangeError` and a hash that isn't one answers `null`, without a call. The shell shall work out a blob's hash itself. When the shell refuses a workspace that isn't open in it, the call shall reject with a `denied` error; a blob file or folder that is a link with an `Error` holding the shell's message; a hash or data the page should have checked with an `internal` error; an `io` refusal with an `unavailable` error that keeps the shell's message. A rejection that isn't the shell's refusal shape, or an answer that isn't the command's, shall reject with an `unavailable` error that doesn't repeat its text.

## Examples

- Given a run "r1" started on desktop,
  when the `halonic` CLI later lists runs of the same folder,
  then "r1" is listed with the same summary.
- Given a store for `/workspaces/acme`,
  when it puts `hello`,
  then the shell receives `blob_put` with the workspace and `aGVsbG8`, and answers the hash `2cf24dba…9824`.
- Given `hello` put by `halonic run` in the same folder,
  when the desktop store gets `2cf24dba…9824`,
  then it gives the bytes `hello`.
- Given `get("../secret")`,
  when it is called,
  then it answers `null` and the shell receives nothing.
- Given the served Studio, which has no capability for the blob commands,
  when any method is called,
  then it rejects with an `unavailable` error that doesn't hold the shell's text.
