# remote.phone-agents

- Status: draft
- Since: unreleased
- Source: HAL-12248 (tunnel design on HAL-12206, decision 6 and section 3, `s-m2` and `s-m3`; D7 design on HAL-15159, sections 2 and 3; microcopy 28 on HAL-751; flow check C672 on HAL-16097; 40px tile, C673 on HAL-16111; the waiting row and the tap, run detail drawing on HAL-16169)

The phone shall list the agents of the paired computer in the order the computer listed them, each with a 40px letter tile, its name, a line and its state in words (Running, Needs you, Done, Failed). The line shall say when an agent that ended finished or failed, else what its oldest open approval asks, else the agent's newest message. While the phone can't answer because it isn't connected, each line of an agent that hasn't ended shall end with "as of" and the time of the last update the phone received (an agent that finished or failed keeps only its end time). Tapping an agent's row shall open its run detail. An agent that needs you shall show its oldest open approval: one the phone never answers, such as a risky one, with "Answer this on your computer." and no Approve or Reject; any other with Approve and Reject, turned off with "You can answer once your phone reconnects." under them while the phone isn't connected. The phone shall send an answer only while the approval can be answered, and shall never send one twice.

## Examples

- Given the phone is connected and Reporter is running with its newest message "Writing the weekly report",
  when the Agents list shows,
  then its row reads "Reporter", "Writing the weekly report" and "Running".
- Given the phone can't reach the computer, and the last update arrived at 14:02,
  when the Agents list shows Sorter waiting on "Send 4 replies",
  then its row reads "Send 4 replies · as of 14:02" and "Needs you", and Approve and Reject are off with "You can answer once your phone reconnects." under them.
- Given Sorter waits on a risky approval,
  when the Agents list shows, connected or not,
  then its row says "Answer this on your computer." with no Approve or Reject.
- Given Writer finished at 13:40 today,
  when the Agents list shows,
  then its row reads "Finished 13:40" and "Done".
- Given the phone can't reach the computer, and Writer failed yesterday at 09:12,
  when the Agents list shows,
  then its row reads "Failed yesterday 09:12" and "Failed", with no "as of" time.
