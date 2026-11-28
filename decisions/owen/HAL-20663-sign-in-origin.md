# Decision: the sign-in window's size and place follow the display's scaling

- Approval: Paperclip task HAL-20663 (Liam's follow-up of 28 Nov to #6814); Liam approves this note in review
- Kind: user-visible

On a display scaled above 100 % the sign-in window started half again as big as meant and away from Halonic: the shell put physical pixels on the browser's command line, and Chromium reads `--window-size` and `--window-position` as device-independent pixels.

- The requirement now says the command line holds device-independent pixels, the physical ones divided by the monitor's scale factor, and gains an example at 150 %.
- The size, the centring and the move of a window that shows elsewhere don't change: those stay in physical pixels.
- The existing command-line test passes a scale of 1, so what it checks is unchanged.

## Covers

- studio.src-tauri.crates.sign-in-window.sign-in-window
