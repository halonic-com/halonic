# cloudflare-storage.r2-blob-store-hashes

- Status: active
- Since: 0.1.0
- Source: HAL-9486; the export of a deployment's data (HAL-197 Cloud part 9)

The R2 blob store's `hashes` shall list the hash of every blob in the store, in byte order and across every page R2 answers, and leave out a key under the prefix that is not a blob hash.

## Examples

- Given three blobs spread over several pages of the bucket's listing, and an object under the prefix that is not a hash,
  when `hashes` is called,
  then it answers the three hashes in byte order and not the other key.
- Given an empty bucket,
  when `hashes` is called,
  then it answers an empty list.
