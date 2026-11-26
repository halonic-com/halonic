# studio.src-tauri.crates.device-keys.saved-text

- Status: draft
- Since: unreleased
- Source: HAL-19026 (phase 2 G3b, architecture note on HAL-17511, section 2.4)

The phone shall keep the text the page saved of each paired computer's Inbox and Messenger only sealed by the key that seals the device keys (on Android an AES-256-GCM key in the Android Keystore), under its own context, in one file per computer in the app's private data, bound to that computer, so that none of it is in the clear at rest. When the page writes a computer's text, then the phone shall replace it whole. If the text is over 20 MB in UTF-8, then the phone shall refuse the write and keep the text it had. When the person forgets a computer, or the computer says after proving who it is that the phone isn't paired (Removed), then the phone shall delete that computer's saved text and no other. If saved text doesn't open, because its file was changed or copied from another computer's or the platform key is gone, then the phone shall delete it and answer that nothing is saved. Only the app's own page shall be granted the commands that read, write and clear it, on Android only.

## Examples

- Given text holding a canary message saved for `office`,
  when its file is read,
  then it starts with `HST1` and doesn't hold the canary in the clear.
- Given text saved for `office` and `laptop`,
  when the person forgets `office`,
  then nothing is saved for `office` and `laptop` still reads its own.
- Given text saved for `office`,
  when the page writes 20 MB and one byte for it,
  then the write is refused and the old text still reads.
- Given text saved for `office`,
  when its file is copied to `laptop.saved` and the page reads `laptop`,
  then nothing is saved for `laptop` and the copy is deleted.
