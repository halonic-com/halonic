# remote.pair-a-phone-narrow

- Status: active
- Since: unreleased
- Source: HAL-12241, HAL-14085; Sofia's C306 check of the Pair a phone dialog (PP3: the code step scrolled sideways at 320 px)

Where the Pair a phone dialog is too narrow for the QR code and the steps side by side, the steps shall go below the QR code at full width, and New code and "Can't scan? Type a code" shall wrap, so nothing but the QR code, which stays at least 232 px, is wider than the dialog.

## Examples

- Given the Studio window is 320 px wide,
  when the person opens Pair a phone,
  then the steps show below the QR code and the dialog doesn't scroll sideways.
