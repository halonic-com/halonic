# remote.phone-status

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decisions 4 and 16; strings table on HAL-12233, "Status label in the header", "Announcements", G19 and G20)

The phone's header label shall show one of six states in words: "Connected · {computer}" (green dot), "Reconnecting…" (amber dot), "Can't reach your computer" and "Your phone is offline" (amber), "Removed from this computer" and "Can't confirm your computer" (red). Its screen-reader name shall be the state, then "Details". When the state changes, the phone shall say the new state once, politely, with the label's words, except that: the first state says nothing; Reconnecting after Connected is said only once it has lasted 2 seconds; while the label shows Can't reach or offline, a reconnect try shall not turn it back to Reconnecting and says nothing; and getting back to Connected is said ("Connected to {computer}") only if the trouble state before it was said.

## Examples

- Given the phone opens already connected to Tim's laptop,
  when the label shows,
  then it reads "Connected · Tim's laptop", is named "Connected to Tim's laptop. Details", and nothing is said.
- Given the phone is connected,
  when it starts reconnecting and connects again 1 second later,
  then nothing is said either way.
- Given the phone is connected,
  when it has been reconnecting for 2 seconds,
  then it says "Reconnecting" once; and when it connects again, it says "Connected to Tim's laptop".
- Given the label shows "Can't reach your computer",
  when the phone tries again in the background,
  then the label stays "Can't reach your computer" and nothing is said.
- Given the phone is connected,
  when the computer says this phone is no longer paired,
  then it says "Removed from this computer" at once.
