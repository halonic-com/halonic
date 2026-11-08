# std.base64url

- Status: active
- Since: 0.1.0
- Source: `base64url.ts` in `packages/adapters/token-store` and `packages/host/google-sign-in` (HAL-771)

The base64url encoder shall write bytes as base64url without padding (RFC 4648, section 5), and give the same text as Node's `Buffer` with the `base64url` encoding.

If the text to decode has padding, a character outside the base64url alphabet, a length that leaves one character over, or stray bits after the last byte, then the decoder shall return nothing instead of bytes.

## Examples

- Given the text "foobar", when its UTF-8 bytes are encoded, then the text is `Zm9vYmFy`.
- Given the bytes `fb ff`, when they are encoded, then the text is `-_8`, and decoding `-_8` gives the bytes back.
- Given `Zg==`, `Zm+v`, `Zm9vZ` or `Zh`, when it is decoded, then there are no bytes.
