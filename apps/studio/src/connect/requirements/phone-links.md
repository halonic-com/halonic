# studio.connect.phone-links

- Status: draft
- Since: unreleased
- Source: HAL-19050 (the phone's Messenger tab, HAL-18900; desktop opener in `tauri-bridge.ts`)

When the phone app asks the Android app's own page to open a message's link, the page shall check it again with `isAllowedWebLink` and no connection origin, and only for a link that passes shall it call the shell's `plugin:opener|open_url` with that link, unchanged. For any other link it shall call nothing. If the shell refuses, the page shall stay as it is and log it. The shell shall let only the app's own page on Android open a GitHub pull request page this way, and nothing else.

## Examples

- Given a link to `https://github.com/acme/app/pull/12`,
  when the phone app asks to open it,
  then the page calls `plugin:opener|open_url` with that URL once.
- Given a link to `https://github.com.evil.io/acme/app/pull/12`,
  when the phone app asks to open it,
  then the page calls nothing and logs the refusal.
