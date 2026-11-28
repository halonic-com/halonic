# Decision: the sign-in window opens only the named service's pages, at the size meant on scaled displays

- Approval: Paperclip task HAL-20663, with Liam's choice of option A on HAL-20893; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:Pxb335BraILZTzrc9WPkRtA211MR/PVRUs039hJA5EFt5TVpanh+P6x0BfYdfzJPT6OIv81GJ4fvO+pTnhcqAg==

Two follow-ups to the sign-in window of #6814.

**The origin.** `open_sign_in` accepted a page on any `https` host. Now every feature that opens a sign-in page names the origin of the service it signs in to, and the shell opens the page only when its scheme, host and port are exactly that origin's. That catches a feature that hands over the wrong page, at little cost. The shell doesn't keep its own list of hosts, because that would duplicate state the features already hold.

- `kit.open-sign-in`: `useOpenSignIn()` takes the origin. Without the shell's opener, the page opens as before and the origin is ignored.
- `studio.desktop-sign-in-window`: the app passes the origin to `open_sign_in`. A refusal still opens the page in the default browser, as before.
- `studio.src-tauri.crates.sign-in-window.sign-in-window`: an origin mismatch, or an origin that isn't an `https` address (or plain `http` to this computer), is refused as `invalid`.

**Scaled displays.** On a display scaled above 100 % the window started half again as big as meant and away from Halonic. The shell gave the browser physical pixels, but Chromium reads `--window-size` and `--window-position` as device-independent pixels. The requirement now says the command line holds device-independent pixels, and it gains an example at 150 %. The size, the centring and the move of a window that shows elsewhere stay in physical pixels.

Existing tests keep what they check: the address-only tests pass each address as its own origin, and the command-line test passes a scale of 1.

## Covers

- kit.open-sign-in
- studio.desktop-sign-in-window
- studio.src-tauri.crates.sign-in-window.sign-in-window
