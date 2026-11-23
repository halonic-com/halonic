# remote.phone-app

- Status: draft
- Since: unreleased
- Source: HAL-15985 (flow check C661 on HAL-15978, finding 1; tunnel design on HAL-12206, decision 14 and sections 1 to 3)

When the phone app starts with no readable paired computer, it shall show Pair with a computer. When it starts with one or more, it shall show the one connected last (else paired last), with its header status label, and connect to it. Tapping the label shall open the status sheet for its state, and the Connected sheet's Paired computers row shall open Paired computers, whose Pair button opens Pair with a computer. While the phone can't reach a computer it has reached since it opened it, its screen shall show the stale banner; before the first answer it shows the first reach (`remote.phone-first-reach`). When the computer says this phone is removed, the app shall drop what it held from that computer before any screen shows Removed; Can't confirm shall clear nothing. After a computer is forgotten on its own screen, the app shall show the next computer, else Pair with a computer. Back shall close an open sheet, else go back one screen, and shall say when there's nowhere to go back to. The typed route shall offer "Not listed? Enter its address", which opens the 0.1 connect screen.

## Examples

- Given no paired computer,
  when the app starts,
  then it shows Pair with a computer and Back has nowhere to go.
- Given Tim's laptop is paired and connected,
  when the label is tapped and then Paired computers on the sheet,
  then Paired computers shows, and Back returns to Tim's laptop.
- Given Tim's laptop is shown and holds its agents,
  when the computer says this phone is removed,
  then the agents are dropped before the app tells its screens, which then show Removed.
- Given Tim's laptop can't be confirmed,
  when the app shows it,
  then it shows Can't confirm and nothing held is dropped.
