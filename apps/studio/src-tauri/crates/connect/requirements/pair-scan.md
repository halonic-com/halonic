# studio.src-tauri.crates.connect.pair-scan

- Status: draft
- Since: 0.1.0
- Source: HAL-12246 (tunnel phase B build plan on HAL-12232, decisions 14 and 16); HAL-12577 (early cancels)

When the connect page opens the pairing scanner, the shell shall open the back camera for QR codes only, and only once Android has granted the camera; if the camera is turned down, then the shell shall answer "no camera" with whether Android will ask again, and open nothing. The shell shall hand the page a scanned value only when it is a QR code whose text starts with `halonic-pair:` and is at most 150 bytes long; anything else shall be "not a pairing code". The shell shall never open, call or look up anything from a scanned value. The camera shall be on only while the scanner is open: it shall close once a code is read, when the page cancels, and when the window starts loading a page or closes. A cancel shall hold however early it comes: one during the camera permission question shall keep the camera from opening, and one that reaches the plugin before the camera is on shall still turn it off. Only the phone's own page shall reach the scanner, never the served Studio, and no page shall reach the barcode-scanner plugin's own commands.

## Examples

- Given a QR code with the text `halonic-pair:AQ`,
  when the scanner reads it,
  then the page gets `{"kind":"scanned","text":"halonic-pair:AQ"}`.
- Given a QR code with `https://example.com/halonic-pair:AQ`, an EAN-13 barcode, or a pairing text over 150 bytes,
  when the scanner reads it,
  then the page gets `{"kind":"notAPairingCode"}`.
- Given the camera was turned down once,
  when the scanner opens,
  then the page gets `{"kind":"noCamera","askAgain":true}`, and `askAgain` is `false` once Android won't ask again.
- Given an open scanner,
  when the window starts loading another page,
  then the camera closes and the scan answers `{"kind":"closed"}`.
- Given the scanner is waiting for the camera permission answer,
  when the page cancels or the window starts loading another page,
  then the scan answers `{"kind":"closed"}` and the camera never opens.
- Given the scanner was just asked to open and the camera isn't on yet,
  when the page cancels,
  then the scan answers `{"kind":"closed"}` and the camera is off once it would have started.
