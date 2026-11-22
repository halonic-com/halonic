# remote.phone-pairing-problems

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decisions 10, 17–20, 28; port shape agreed on HAL-15166; strings table on HAL-12233, `p-m6` to `p-m10`, G12, G13, G25 and G26; microcopy on HAL-751, section 28; C599 on HAL-15599)

When a pairing stops, the phone shall show the problem screen for what it can tell. A typed code that doesn't match shall bring back the typed route with the tries left. A wrong code on the scanned route, a code that ran out or had its last try, and Allow not pressed in time shall show "This code no longer works", the last with the reason that Allow wasn't pressed, and send the person to Make a new code, the button the computer shows then. A computer that had too many tries in the last minute shall show "Too many tries" on that computer, with Try again sending the same code, because the code may still work and the tries may not have been this person's. A computer that isn't the one in the scanned code shall show "Can't confirm it's" that computer, say that nothing was shared, and ask to check the phone is on the same network before scanning again; it shall never read as a code that no longer works. An answer from the computer the phone can't read shall say so and that nothing was shared. A code or key from the page that isn't one is a bug, not the person's doing: the phone shall log it and show the generic problem screen. A code another phone used first shall show "This code was already used", and Don't allow on the computer shall show that the computer didn't allow this phone. A computer that doesn't answer shall show "Can't reach" the computer, with the same-Wi-Fi check when the computer was found on this Wi-Fi. When the phone's own network is down, the phone shall say that it is offline and ask to turn on Wi-Fi or mobile data, or to connect to the computer's Wi-Fi when the computer was found on this Wi-Fi, never to check the computer. The phone shall never read a timeout or a refused connection as Don't allow.

## Examples

- Given a typed code for a computer on this Wi-Fi,
  when the computer says the code doesn't match with 3 tries left,
  then the phone shows the typed route again with 3 tries left.
- Given a scanned code,
  when the computer says the code doesn't match,
  then the phone shows "This code no longer works".
- Given the phone waits for Allow,
  when 2 minutes pass without it,
  then the phone shows "This code no longer works" with the Allow reason, and says to choose Make a new code on the computer.
- Given a typed code for "Tim's laptop",
  when the computer says too many codes were tried in the last minute,
  then the phone shows "Too many tries on Tim's laptop" with Try again and Cancel.
- Given a scanned code for "Tim's laptop",
  when the computer that answers isn't the one in the code,
  then the phone shows "Can't confirm it's Tim's laptop" with Scan again and Cancel.
- Given a scanned code for "Tim's laptop",
  when the phone can't read the computer's answer,
  then the phone shows "Couldn't read Tim's laptop's answer" and that nothing was shared.
- Given a typed code for a computer on this Wi-Fi,
  when the computer doesn't answer,
  then the phone shows "Can't reach" with the same-Wi-Fi check.
- Given a scanned code for "Tim's laptop",
  when the phone's own network is down,
  then the phone shows "Your phone is offline" and asks to turn on Wi-Fi or mobile data.
