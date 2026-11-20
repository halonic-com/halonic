# remote.pair-a-phone

- Status: active
- Since: unreleased
- Source: HAL-12241; design "Tunnel phase B screens" (HAL-12206), decisions 1, 5, 9, 10, 11 and 19, and the screens "Pair a phone: scan the code", "Pair a phone: type a code instead", "Check the code, then Allow" and "Paired"

When the person presses Pair a phone in Settings › Remote, the Studio window shall open the Pair a phone dialog, which opens a pairing on the host and so turns remote on. While the pairing waits for a phone, the dialog shall show the QR code with a text alternative, the three steps, the time left as text ("The code works once and ends in 4:32."), New code, "Can't scan? Type a code", which shows the 12-character code in groups of 4 with Copy and the computer's name, the safety line and the tunnel it is reached through. Where the dialog is too narrow for the QR code and the steps side by side, the steps shall go below the QR code at full width, so nothing but the QR code, which stays at least 232 px, is wider than the dialog (C306 PP3, HAL-14085). When a phone has used the code, the dialog shall become Check the code: the phone's name and platform with the 6-character check code, which takes focus, and Allow and Don't allow, neither of which Enter presses from the code. Only Allow shall pair the phone; the dialog shall then say "Pixel 8 is paired" and what it can do, with Done. When the dialog closes before a phone is paired, it shall end the pairing, and the host turns remote off again if the pairing turned it on.

## Examples

- Given remote off and no phone paired,
  when the person presses Pair a phone,
  then remote turns on and the dialog shows the code, the steps and "The code works once and ends in 5:00."
- Given the dialog shows a code,
  when the person presses "Can't scan? Type a code",
  then it shows "On your phone, tap Type a code instead, choose Test laptop and enter" and the code in groups of 4.
- Given a phone named Pixel 8 used the code,
  when the dialog shows Check the code,
  then focus is on the check code, and pressing Allow pairs Pixel 8 and shows "Pixel 8 is paired".
- Given the dialog shows a code and no phone is paired,
  when the person closes it,
  then the pairing ends and remote is off again.
