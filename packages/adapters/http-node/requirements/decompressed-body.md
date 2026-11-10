# http-node.decompressed-body

- Status: active
- Since: 0.1.0
- Source: HAL-983 (I5 design, HAL-958 section 3.6)

When a response has a `content-encoding`, the Node transport shall decode the body itself and remove the `content-encoding` and `content-length` headers, and shall fail the body for an encoding it can't decode, so that the kit's secret filter and size limit see the real bytes.

## Examples

- Given a gzip, deflate or brotli response,
  when the body is read,
  then it is the decoded text and neither header is left.
- Given a response with an unknown encoding,
  when the request is sent,
  then it fails instead of passing on bytes nobody checked.
