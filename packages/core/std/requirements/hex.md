# std.hex

- Status: active
- Since: 0.1.0
- Source: new in the core std package

The hex writer shall write each byte as two lowercase hexadecimal characters, in order.

## Examples

- Given the bytes 0, 171 and 255, when they are written, then the text is `00abff`.
- Given no bytes, when they are written, then the text is empty.
