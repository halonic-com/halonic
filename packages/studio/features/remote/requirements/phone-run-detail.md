# remote.phone-run-detail

- Status: draft
- Since: unreleased
- Source: HAL-12248 (run detail drawing on HAL-16169, approved by the board on 23 Nov; option A on HAL-16055; wording from HAL-15240; D7 rule I2 on HAL-15159)

When an agent's row is tapped, the phone shall show that agent's run detail: Back, the agent's name as the screen's heading, and the connection label; then the agent's messages and approvals the phone holds, oldest first, each with the computer's time; then the prompt box, sending to this agent. When the phone dropped older events, the history shall start with "Older activity isn't kept on this phone.". An approval that still waits shall show what it asks, its time and "Answer this on your computer.", with no Approve or Reject; an answered one shall be one line, "Approved {time} · {summary}" or "Denied {time} · {summary}", where it was asked. The history shall end with how the agent stands: "{agent} is working…" while it runs and the phone is connected, "Working as of {time}." while it runs and the phone isn't, "Finished {time}", or "Failed {time}. See what happened on your computer.". While the phone isn't connected, the stale banner shall show above the history and the prompt box shall be off. When the agent leaves the computer's list, the phone shall go back to Agents.

## Examples

- Given the phone is connected and Sorter waits on `send_replies: {"drafts":4}`, asked at 14:02,
  when its run detail shows,
  then the history ends with "Sorter is waiting for your OK", `send_replies: {"drafts":4}`, "14:02" and "Answer this on your computer.", with no Approve or Reject.
- Given Sorter's approval to read the inbox was approved at 13:53,
  when its run detail shows,
  then that approval reads "Approved 13:53 · read_inbox: {}" where it was asked.
- Given the phone can't reach the computer, and the last update arrived at 14:02 while Reporter was running,
  when Reporter's run detail shows,
  then the banner is above the history, the history ends with "Working as of 14:02.", and the prompt box is off.
- Given Writer failed at 14:10,
  when its run detail shows,
  then the history ends with "Failed 14:10. See what happened on your computer.".
