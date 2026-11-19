# kit.code-display-copy

- Status: active
- Since: unreleased
- Source: HAL-12240; Liam's note on HAL-12240 after Julian's review of #3571 (HAL-12353): the pairing-code reader refuses any character outside ASCII

The text of the kit's `CodeDisplay` shall be the code's characters alone, with the gaps and dots between its groups drawn by styling, never by a space, a no-break, thin or zero-width space, or another character, so that a code a person copies from it reads back as the same code.

## Examples

- Given the pairing code `7KQ2M4XD9TH6` in groups of 4,
  when it renders and its text is copied,
  then the text is `7KQ2M4XD9TH6` and `readPairingCode` reads back the same code.
- Given the check code `4F72KQ` in groups of 3,
  when it renders and its text is copied,
  then the text is `4F72KQ` and `readCheckCode` reads back the same code.
