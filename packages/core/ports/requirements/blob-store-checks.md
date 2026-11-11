# ports.blob-store-checks

- Status: active
- Since: 0.1.0
- Source: HAL-6175 (the desktop app's blob store is the third adapter to check media types and hashes); `BlobStore` port v1

The ports package shall export the `BlobStore` port's input rules, so every blob store refuses the same media types and hashes. `checkBlobMediaType` shall throw a `RangeError` naming the media type for anything but `type/subtype` with each half made of HTTP token characters (RFC 9110). `isBlobHash` shall be true only for 64 lowercase hex characters.

## Examples

- Given `text/plain` or `application/vnd.acme+json`,
  when `checkBlobMediaType` is called,
  then it returns; for `text/plain; charset=utf-8`, `text` or `tëxt/plain` it throws a `RangeError`.
- Given the SHA-256 of `hello` in lowercase hex,
  when `isBlobHash` is called,
  then it is true; in upper case, one character short or with `../` in front, it is false.
