# studio.src-tauri.crates.tunnel.phone-pairing

- Status: draft
- Since: unreleased
- Source: HAL-15157 (D6); ADR "Pairing and the end-to-end session", pairing rules

When the person pairs with a computer, the phone shall open one connection to the computer's endpoint, make a new key pair for that computer, run pairing messages 1 to 3 on it and give the computer's name and the check code; it shall never reconnect a pairing, and it shall end the pairing when the connection drops. It shall then wait for the computer's encrypted answer for at most 130 seconds, the computer's 2 minutes for Allow and a margin, and give the pinned host key and the new key pair only when the answer is `paired`. It shall say why a pairing stopped: the computer couldn't be reached (with the reason, a computer that doesn't answer message 1 within 10 seconds included), the computer refused the code in cleartext (wrong code with the tries left, code ended, code used, too many tries), the QR code's key isn't the computer's (no message 3 is sent), the computer said no, or no answer came in time; any other answer shall be unreadable.

## Examples

- Given a computer that presses Allow,
  when the phone pairs,
  then it gives the same check code as the computer, the computer's key and the phone's new key.
- Given a typed code the computer doesn't have,
  when the phone pairs,
  then it shows the check code, and then the computer's refusal says the code is wrong with 4 tries left.
- Given a QR code from another computer,
  when the phone pairs,
  then it stops after message 2 and sends no message 3.
- Given a computer that never answers after message 3,
  when the time limit passes,
  then the pairing has timed out.
- Given a computer that drops the connection,
  when the phone waits for its answer,
  then the computer can't be reached.
