# remote.phone-standing

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decisions 7, 13 and 16; strings table on HAL-12233, `s-m7`, `s-m9` and `d-m2`)

When the computer has proved who it is and said this phone isn't paired, the phone shall show "Removed from" the computer in place of its agents, say that the phone can't see agents there any more, that what it saved from that computer is cleared and that the agents there are not affected. When the computer's identity changed since pairing, the phone shall show "Can't confirm it's" the computer, say why that can happen and to check the computer if neither cause applies, and say that nothing on this phone was cleared. Both shall offer Pair again and Forget this computer, which asks once as on Paired computers; on Removed the question shall not say that the computer still lists this phone, and on Can't confirm it shall say the computer may still list it (C665-5, HAL-16065). Neither shall move focus, because the header has already said the state.

## Examples

- Given Tim's laptop proved who it is and said this phone isn't paired,
  when the screen shows,
  then it reads "Removed from Tim's laptop" and "This phone can't see agents there any more. What it saved from that computer is cleared. Your agents there are not affected.", with Pair again and Forget this computer.
- Given Tim's laptop answered with a different identity,
  when the screen shows,
  then it reads "Can't confirm it's Tim's laptop" and "Nothing on this phone was cleared.", with Pair again and Forget this computer.
- Given either screen shows,
  when the person presses Forget this computer,
  then the phone asks "Forget Tim's laptop?" and forgets it only after Forget is pressed again.
- Given Tim's laptop removed this phone,
  when the person presses Forget this computer,
  then the question doesn't say that the computer still lists this phone as paired.
- Given Tim's laptop answered with a different identity,
  when the person presses Forget this computer,
  then the question says "Tim's laptop may still list this phone as paired. To cut it off there, use Revoke in Settings › Remote."
