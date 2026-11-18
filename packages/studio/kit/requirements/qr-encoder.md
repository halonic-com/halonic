# kit.qr-encoder

- Status: active
- Since: unreleased
- Source: HAL-12239; HAL-12232 phase B build plan, decision 15

When a kit part encodes bytes as a QR Code, the kit shall use its vendored copy of Project Nayuki's QR Code generator, trimmed to byte mode, which shall give the same matrix, version, error correction level and mask as upstream's own code at the pinned commit, and whose output a separate decoder shall read back as the same bytes. If the bytes don't fit the versions allowed, or an argument is out of range, then the encoder shall throw a `RangeError` and give no matrix.

## Examples

- Given the 21 inputs in `src/qr/fixtures/upstream-matrices.json`,
  when the kit encodes each with the same options,
  then every matrix, version, error correction level and mask equals upstream's.
- Given a 150-byte pairing payload drawn with a 4-module quiet zone at 4 px per module,
  when `jsqr` decodes the image,
  then it reads back the same 150 bytes.
- Given 2,954 bytes at ECC level L,
  when the kit encodes them,
  then it throws "Data too long".
