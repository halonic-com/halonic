# kit.qr-tile

- Status: active
- Since: unreleased
- Source: HAL-12240; phase B build plan decisions 14 and 18 (HAL-12232); tunnel phase B screens, "Accessibility and motion" and the QR size note (HAL-12206)

The kit's `QrTile` shall draw its `value` (text as UTF-8, or bytes) as a QR Code at ECC level M with the kit's QR encoder, in `qr-dark` modules on `qr-light`, which are black and white in both themes, at 4px a module with a 4-module light quiet zone drawn into the image, on a tile at least 232px a side (`qr-tile`) that keeps its colours in forced-colours mode. It shall be one image to screen readers, named by its `label`. If the value is too long for any QR Code, then it shall throw a `RangeError` and draw nothing.

## Examples

- Given a 150-byte pairing payload,
  when the tile renders,
  then the image is 57 modules (228px) wide and `jsqr` reads back the same 150 bytes.
- Given any value,
  when the tile renders,
  then no dark module lies within 4 modules of the image's edge.
- Given the label "QR code to pair your phone. Can't scan it? Type the pairing code below.",
  when the tile renders,
  then a screen reader finds one image with that name.
