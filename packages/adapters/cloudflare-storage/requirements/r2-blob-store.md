# cloudflare-storage.r2-blob-store

- Status: active
- Since: 0.1.0
- Source: HAL-6792; `BlobStore` port v1; build plan (HAL-197) part 2

The R2 blob store shall keep each blob as one R2 object under `<prefix><hash>`, holding only the bytes, with the media type of the put that wrote it as the object's `Content-Type`. Storing bytes that are already stored shall write nothing. A hash that isn't 64 lowercase hex characters shall never become a key: `get` answers `null` without calling R2. The store shall keep the bytes as they were when `put` was called, even when the caller changes them while the put waits. `hashes` shall list the hash of every blob in the store, in byte order and across every page R2 answers, and leave out a key under the prefix that is not a blob hash.

## Examples

- Given `put` of `hello`,
  when the bucket is listed,
  then it holds one object, `blobs/2cf24dba…9824`, with the bytes `hello` and the type the put gave.
- Given `put` of `hello` twice,
  when the second put runs,
  then R2 is asked for the object's head and is not written to.
- Given another object in the same bucket,
  when `get("../other")` is called,
  then it answers `null` without calling R2.
- Given three blobs spread over several pages of the bucket's listing, and an object under the prefix that is not a hash,
  when `hashes` is called,
  then it answers the three hashes in byte order and not the other key.
