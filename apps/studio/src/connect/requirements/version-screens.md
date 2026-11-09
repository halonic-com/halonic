# studio.connect.version-screens

- Status: active
- Since: 0.1.0
- Source: HAL-1140 (flow-install-update 5.4 and 7.3, microcopy 20.4)

If the shell answers that the app is too old for the computer, then the connect page shall show "This app is too old for Halonic on your computer (_version_). Install the new app to continue." with the computer's version, Open release page and Change address. If the shell answers that the computer is too old for the app, then the page shall show "Halonic on your computer (_version_) is too old for this app. Update Halonic on your computer, then try again." with Try again and Change address. When either screen replaces another, the focus shall go to the message first; when Try again ends on the same screen, the focus shall stay on Try again. When the user presses Open release page, the page shall ask the shell to open the release page.

## Examples

- Given the shell answers "app too old" with the computer at `0.2.0`,
  when the answer arrives,
  then the page shows the app-too-old message with `0.2.0` and the focus is on the message.
- Given the computer-too-old screen with the computer at `0.1.0`,
  when the user presses Try again and the computer now fits,
  then the page opens the confirmed address.
