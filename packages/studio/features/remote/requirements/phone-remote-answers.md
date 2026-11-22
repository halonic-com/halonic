# remote.phone-remote-answers

- Status: draft
- Since: unreleased
- Source: HAL-15179 (tunnel D7, design on HAL-15159, sections 2 and 3, section 5 items 7 and 11, and design decision 6 on HAL-12206; one wording for the stale state, flow check C672 on HAL-16097)

The phone's view of a computer shall be live only while the connection is connected and a session list has arrived since the last `welcome`; otherwise it shall keep the last sessions and approvals, turn Approve, Deny and the prompt box off, and give "You can answer once your phone reconnects." as the reason. Its "as of" time shall be the phone's own clock when the last session list or event arrived. The phone shall show an approval from its `approval-requested` until its `approval-settled`, and send no answer to a `risky` one, giving a reason instead. It shall send each answer and prompt at most once and never send it again, settling it with the host's `ok` or refusal, the shell's refusal, or as cut off by a drop. After a drop, an answer that was cut off shall stay shown as sent until the approval settles, or until the phone holds the session's events up to its `lastSeq` in the first list after the reconnect with the approval still open, when the person may answer again. It shall send no empty prompt and none over 10,000 characters.

## Examples

- Given a drop,
  when the view goes stale,
  then it keeps the sessions and approvals, and every answer is off with "You can answer once your phone reconnects.".
- Given a `risky` approval,
  when the person tries to answer it on the phone,
  then nothing is sent.
- Given an answer cut off by a drop, and a reconnect whose events settle the approval,
  when they arrive,
  then the approval is gone and the answer was sent once.
- Given an answer cut off by a drop, and a reconnect that shows the approval still open,
  when the phone has caught up,
  then the person may answer again.
