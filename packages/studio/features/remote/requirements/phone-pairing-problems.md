# remote.phone-pairing-problems

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decisions 10, 18–20; strings table on HAL-12233, `p-m6` to `p-m10`, G12 and G13)

When a pairing stops, the phone shall show the problem screen for what it can tell. A typed code that doesn't match shall bring back the typed route with the tries left. A wrong code on the scanned route, a code that ran out or had its last try, and Allow not pressed in time shall show "This code no longer works", the last with the reason that Allow wasn't pressed. A code another phone used first shall show "This code was already used", and Don't allow on the computer shall show that the computer didn't allow this phone. A computer that doesn't answer, or a phone that is offline, shall show "Can't reach" the computer, with the same-Wi-Fi check when the computer was found on this Wi-Fi. The phone shall never read a timeout or a refused connection as Don't allow.

## Examples

- Given a typed code for a computer on this Wi-Fi,
  when the computer says the code doesn't match with 3 tries left,
  then the phone shows the typed route again with 3 tries left.
- Given a scanned code,
  when the computer says the code doesn't match,
  then the phone shows "This code no longer works".
- Given the phone waits for Allow,
  when 2 minutes pass without it,
  then the phone shows "This code no longer works" with the Allow reason.
- Given a typed code for a computer on this Wi-Fi,
  when the computer doesn't answer,
  then the phone shows "Can't reach" with the same-Wi-Fi check.
