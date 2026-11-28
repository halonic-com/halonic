# studio.desktop-sign-in-window

- Status: active
- Since: unreleased
- Source: HAL-20515, HAL-20663 (the origin); the board's request on HAL-10 (sign-in links open in a small browser window on top of the Halonic window); the shell's side in `studio.src-tauri.crates.sign-in-window.sign-in-window`

When a feature in the desktop app's Studio window opens a sign-in page (`kit.open-sign-in`), the app shall ask the shell's `open_sign_in` to open it, with the origin the feature gave, as a small window of the user's own browser over Studio. When the shell answers anything but `opened`, or refuses, the app shall open the page as it opens every other link, in the default browser, and report a refusal in the console. Pages that aren't sign-ins, such as a Paperclip task, shall keep opening in the default browser.

## Examples

- Given the shell answers `opened`,
  when the Paperclip sign-in opens its approval page,
  then the app asks `open_sign_in` for it with the origin `https://paperclip.acme.test` and opens nothing else.
- Given Firefox as the default browser, so the shell answers `fallback`,
  when the Paperclip sign-in opens its approval page,
  then the page opens in Firefox as before.
- Given the shell refuses the address,
  when the sign-in opens it,
  then the refusal is reported and the page opens in the default browser.
