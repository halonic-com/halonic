# contracts.blob-store

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `BlobStore` port v1; old `784f78d:packages/testing/port-contracts` `blobStoreContract`

Where an adapter implements `BlobStore`, it shall store bytes under the lowercase hex SHA-256 of the bytes, return their size and this call's media type, keep its own copy of the bytes, and give `null` for an unknown hash. When a hash isn't 64 lowercase hex characters, `get` shall give `null`. When a media type isn't `type/subtype` of HTTP token characters, `put` shall reject with a `RangeError` and store nothing.

## Examples

- Given an empty store,
  when `hello` is put twice,
  then both references have hash `2cf24dba…9824` and size 5, and `get` gives `hello`.
- Given a store holding `hello`,
  when `get` is called with that hash in upper case, or with `../etc/passwd`,
  then it gives `null`.
- Given any store,
  when `put` is called with `text/plain; charset=utf-8` or a type with a line break,
  then it rejects with a `RangeError`.
- Given a store holding `hello`,
  when the caller changes the array it put or the array it got,
  then `get` still gives `hello`.
