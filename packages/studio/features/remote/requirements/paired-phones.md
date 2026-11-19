# remote.paired-phones

- Status: active
- Since: unreleased
- Source: HAL-12241; design "Tunnel phase B screens" (HAL-12206), decisions 12, 13, 21, 22, 24 and 25, and the screens "Remote on, two phones", "Remote off, phones still paired", "Revoke one phone" and "Revoke all"

With one or more phones paired, Settings › Remote shall list them under "Paired phones · N", oldest pairing first. Each row shall show the phone's name, its platform and the day it paired ("Android · Paired 14 Nov"), what it can do ("Can: view agents, approve, send prompts"), whether it is connected ("Connected now", "Last seen 2 days ago", or "Not connected yet" before its first session has ended), and Revoke. While remote is off, every row shall say "Remote is off" instead, and Revoke shall still work. Revoke shall ask once, in a dialog titled "Revoke Pixel 8?" that says the phone is cut off now, its agents keep running and waiting answers wait here, and that it must be paired again; only after the confirming "Revoke" shall the host revoke it. From two phones on, Revoke all shall sit at the foot of the list and ask once the same way ("Revoke all 2 phones?"). After a revoke, the section shall announce it; when a revoke fails, the dialog shall stay open and say so.

## Examples

- Given remote on, Pixel 8 connected and Tim's Galaxy S22 last seen two days ago,
  when the section shows,
  then the list is "Paired phones · 2", the rows say "Connected now" and "Last seen 2 days ago", and Revoke all shows.
- Given the same phones and remote off,
  when the section shows,
  then both rows say "Remote is off" and each still has Revoke.
- Given one phone paired,
  when the section shows,
  then Revoke all doesn't show.
- Given Pixel 8 paired,
  when the person presses Revoke on its row and then "Revoke" in the dialog,
  then the host revokes Pixel 8, the section announces "Pixel 8 revoked." and shows "No phones paired".
- Given the host fails to revoke,
  when the person confirms,
  then the dialog stays open and says "Couldn't revoke Pixel 8. Try again."
