# remote.pair-a-phone-problems

- Status: active
- Since: unreleased
- Source: HAL-12241; design "Tunnel phase B screens" (HAL-12206), decisions 10, 15, 19 and 28, the screens "Pair a phone: the code ran out", "Pair a phone: Tailscale isn't ready" and "Pairing was not allowed", and the tunnel reasons table

When a pairing ends without a phone, the Pair a phone dialog shall stay open and say what happened, with one button that starts a new pairing and takes focus: "The code ran out" when the code or the wait for Allow ran out, "Too many wrong tries" after 5 wrong tries, "Pair a phone is already open" when another pairing is open, and "Remote was turned off" when remote went off. When the tunnel is down, the dialog shall show the reason's title, line and actions from the tunnel reasons table, with Check again starting a new pairing, and "Nothing is shared until you press Allow. Remote stays off until a phone is paired." When the person presses Don't allow, the dialog shall show a new code at once under "Pairing was not allowed", which takes focus with its title scrolled into view (C306 PP2, HAL-14075). When the host can't open a pairing, the dialog shall say "Couldn't make a code" with Try again. When Allow or Don't allow fails, Check the code shall stay open with "Couldn't pair Pixel 8. Try again." or "Don't allow didn't go through. Try again: Pixel 8 isn't let in unless you press Allow." When the host fails to end the pairing as the dialog closes, the dialog shall still close, and Settings › Remote shall say and announce "Couldn't turn remote off. Try again."

## Examples

- Given the dialog shows a code,
  when 5 minutes pass without a phone,
  then it says "The code ran out" and Make a new code, which has focus and shows a new code.
- Given remote can't start because Tailscale isn't installed,
  when the person presses Pair a phone,
  then the dialog says "Tailscale isn't installed" with Open Tailscale setup and Check again.
- Given Pixel 8 used the code,
  when the person presses Don't allow,
  then no phone is paired and the dialog shows a new code under "Pairing was not allowed".
- Given Pixel 8 used the code and the host fails Allow,
  when the person presses Allow,
  then Check the code stays open with "Couldn't pair Pixel 8. Try again."
