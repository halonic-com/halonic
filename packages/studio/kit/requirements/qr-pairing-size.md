# kit.qr-pairing-size

- Status: active
- Since: unreleased
- Source: HAL-12239; HAL-12232 phase B build plan, decision 14

When the kit encodes a payload of at most 150 bytes at ECC level M, the QR Code shall be version 8 or lower (at most 49 modules wide), so the pairing QR fits its 228 px tile.

## Examples

- Given a 150-byte pairing payload starting with `halonic-pair:`,
  when the kit encodes it at ECC level M,
  then its version is at most 8.
- Given 153 bytes, one more than version 8 holds at ECC level M,
  when the kit encodes them at ECC level M with version 8 as the limit,
  then it throws "Data too long".
