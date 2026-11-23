# remote.phone-first-reach

- Status: draft
- Since: unreleased
- Source: HAL-13413 (first-run-progress section 6 and 9 on HAL-7986, approved by the board on 19 Nov, HAL-7993; "{computer} isn't answering" as the one name for that state, C672 on HAL-16097)

When the phone app opens a paired computer that doesn't answer yet, the computer's screen shall show the kit's waiting line "Reaching {computer}…" with the seconds waited, from 2 seconds, and from 10 seconds the reason "Halonic has to be open there. This can take a moment." and a 48px Something wrong? row, which opens Check this connection. If the computer hasn't answered after 30 seconds, or a try fails before then, the wait shall give up: the header label shall read "{computer} isn't answering", also while the tunnel tries again in the background, and the screen shall show that title with the two likely causes for the way the phone reaches it, Try again as the main button and Check this connection under it. Try again shall start the wait over and connect at once, setting the last try's failure aside until the tunnel says how the new one went. When the computer answers, the wait shall end, and a later loss of the connection shall show the stale banner instead. While the phone is offline, the screen shall show the stale banner's offline state.

## Examples

- Given Tim's laptop is paired through Tailscale and doesn't answer,
  when the app opens it and 12 seconds pass,
  then the screen reads "Reaching Tim's laptop…", "12 s" and "Halonic has to be open there. This can take a moment.", with Something wrong? under it.
- Given the same wait,
  when 30 seconds have passed,
  then the header reads "Tim's laptop isn't answering" and the screen says "Halonic may be closed there, or Tailscale may be off on that computer." with Try again and Check this connection.
- Given a computer reached through this Wi-Fi refuses the first try,
  then the wait gives up at once and says "Halonic may be closed there, or your phone and that computer may not be on the same Wi-Fi."
- Given the wait gave up,
  when the tunnel tries again in the background without a failure yet,
  then the screen still says the computer isn't answering.
- Given the wait gave up,
  when the person presses Try again,
  then the phone connects again and the waiting line counts from 0.
- Given Tim's laptop answers,
  then the waiting line goes, and when the connection is lost later the stale banner shows.
