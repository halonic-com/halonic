# remote.phone-paired-computers

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decisions 7, 8, 15 and 24; strings table on HAL-12233, `d-m1` to `d-m3`, G16)

The phone shall list its paired computers, each with its name, how it is reached (Tailscale or this Wi-Fi) and the day it was paired, its state in words with a coloured dot (Connected, Reconnecting…, Can't reach, Phone offline, Removed, Can't confirm), and Forget. A removed computer and one the phone can't confirm shall say so whatever the connection reports, and only a computer it can't reach shall be dimmed. Under the list the phone shall say that Forget only removes the computer from this phone and that revoking it on the computer cuts the phone off for good. Forget shall ask once, saying that the computer still lists this phone as paired, and shall change nothing on Cancel. A Forget that fails shall keep the question open with the reason. With no computer paired, the phone shall say so and offer Pair with a computer.

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
