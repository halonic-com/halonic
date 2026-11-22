# remote.phone-paired-computers

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decisions 7, 8, 15 and 24; strings table on HAL-12233, `d-m1` to `d-m3`, G16; microcopy 28 on HAL-751; the tile that dims, from visual check C662 on HAL-15979, HAL-16002)

The phone shall list its paired computers, each with a laptop icon, its name, how it is reached (Tailscale or this Wi-Fi) and the day it was paired, its state in words with a coloured dot (Connected, Reconnecting…, Can't reach, Phone offline, Removed, Can't confirm), and Forget. A removed computer and one the phone can't confirm shall say so whatever the connection reports, and only the laptop icon of a computer it can't reach shall be dimmed, while its name, its lines and Forget stay at full strength. Under the list the phone shall say that Forget only removes the computer from this phone and that Revoke in Settings › Remote on the computer cuts the phone off for good. Forget shall ask once, saying that the computer still lists this phone as paired unless that computer removed it, and shall change nothing on Cancel. A Forget that fails shall keep the question open with the reason. Once a computer is forgotten, the phone shall say so politely, once. A paired computer whose saved details the phone can't read shall be listed after the others, without a name, route, day or state, as a computer this phone can't read that is to be forgotten and paired again, with only its laptop icon dimmed; its Forget shall say it may still be listed on a computer. When the phone's key storage doesn't work, Forget shall keep the question open with that reason, and a list that can't be read shall say the key storage isn't working and offer Try again. With no computer paired, the phone shall say so and offer Pair with a computer.

## Examples

- Given the phone is paired with Tim's laptop through Tailscale on 14 Nov and connected,
  when the list shows,
  then its row reads "Tim's laptop", "Tailscale · Paired 14 Nov" and "Connected".
- Given the list shows Tim's laptop,
  when the person presses Forget,
  then the phone asks "Forget Tim's laptop?" and forgets it only after Forget is pressed again.
- Given no computer is paired,
  when the screen shows,
  then it says "No computers paired" and offers Pair with a computer.
- Given the phone can't read the saved details of one paired computer,
  when the list shows,
  then that row reads "A computer this phone can't read" after the others, and its Forget asks "Forget this computer?".
