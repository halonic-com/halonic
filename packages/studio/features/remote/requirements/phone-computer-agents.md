# remote.phone-computer-agents

- Status: draft
- Since: unreleased
- Source: HAL-15180 (tunnel D7d; D7 design on HAL-15159, sections 2 and 3)

When a paired computer's screen opens, the phone shall show that computer's agents from a gateway client over the shell's tunnel to that computer, in place of a fake, and shall keep that client in memory only until the computer removes this phone or the person forgets it. Once the computer has answered, the screen shall show the Agents list with the prompt box docked under it, and tapping an agent shall show its run detail in place of the screen, with Back to Agents and Android back returning to the list. The stale banner and the status sheet shall say "as of" with the time the last session list or event arrived. While that computer runs an older Halonic that speaks only version 3 of the gateway's messages, the screen shall show "Update Halonic on Tim's laptop", "Update Halonic on Tim's laptop to use Inbox and Messenger from your phone." and "Agents still works." over the Agents list. When the computer removes this phone, the phone shall close the run detail and drop the computer's agents before the Removed screen shows.

## Examples

- Given the phone paired with Tim's laptop by scanning its code,
  when the person presses Open agents and the computer answers,
  then the phone says `hello`, lists the sessions, watches the running and waiting ones and shows them in the Agents list.
- Given Sorter waits on a normal approval,
  when the person presses Approve,
  then the computer gets that answer once.
- Given Reporter's run detail shows and the phone is connected,
  when the person sends "Add last week's numbers.",
  then the computer gets that prompt once and the box says "Prompt sent.".
- Given the phone can't reach the computer any more,
  when the screens show,
  then they keep the agents with "as of" and the time of the last update, and the prompt box is off.
- Given the phone reconnects,
  when the new session list arrives,
  then each watch resumes after the last event the phone holds and the screens are live again.
- Given Reporter's run detail shows,
  when the computer removes this phone,
  then the Removed screen shows and Reporter's run detail and agents are gone.
- Given Tim's laptop runs an older Halonic that speaks only message version 3,
  when the phone falls back to version 3 and the computer lists its agents,
  then the screen shows "Update Halonic on Tim's laptop to use Inbox and Messenger from your phone." and "Agents still works." over the Agents list.
