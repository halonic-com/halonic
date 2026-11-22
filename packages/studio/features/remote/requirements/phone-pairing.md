# remote.phone-pairing

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decisions 14, 17 and 18; port shape agreed on HAL-15166; strings table on HAL-12233, `p-m1` to `p-m5`, G7 to G9; scanner notes from Priya on HAL-12246 and HAL-12577)

The phone shall pair with a computer by scanning its code or by typing the code with the computer picked from a list, and both routes shall end on Check the code. While the phone waits, it shall say it is connecting, and once the computer answers it shall show the check code and wait for Allow on the computer. A scanned code that isn't a Halonic pairing code shall say so in place of the hint while the scanner keeps looking, and the hint shall come back 3 seconds after the last such read. Closing the scanner shall always close the camera. A phone without camera access shall offer settings and the typed route, and a build without a scanner shall offer only the typed route. Cancel on Check the code shall end the pairing on both sides, and an answer that arrives after Cancel shall change nothing on the phone. Try again shall send the same code to the same computer.

## Examples

- Given the phone scanned a pairing code,
  when the computer answers with the check code,
  then the phone shows Check the code and waits for Allow.
- Given the scanner is open,
  when it reads a code that isn't Halonic's,
  then the hint becomes "This isn't a Halonic pairing code." and the scanner keeps looking.
- Given the phone shows Check the code,
  when the person presses Cancel,
  then the pairing ends on the computer too, and a late Allow doesn't show Paired.
