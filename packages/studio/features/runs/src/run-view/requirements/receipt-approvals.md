# runs.run-view.receipt-approvals

- Status: active
- Since: unreleased
- Source: HAL-62 receipt requirements RCPT-2.4 and RCPT-3.3; the section's heading and line wording are a team decision under HAL-2282 (HAL-1301); wait steps are D4 of HAL-12721 (HAL-12727); answer labels from the review of HAL-12727 (HAL-12745)

The run page's receipt shall have an Approvals section under its summary line that lists each approval the run asked for, in the order asked, as "{action}: approved by you at 10:42" or "{action}: rejected by a rule at 10:44", where the action is the Inbox card's plain words ("Send an email with Gmail", else "Use create_note"), saying who answered from what the log records ("you" for a person, "a rule" for an automatic decision) and when. An approval still open shall read "{action}: waiting for your answer", unless the run has ended (cancelled, or a child ended with its parent), when it shall read "{action}: not answered" because the run can no longer take an answer. A log that doesn't say who answered shall leave out the "by". A wait step the run waited at shall be listed among them in the same order, named by the title its description gave it, else its state's id, as "Approve this reply?: approved by you at 16:54", "{step}: rejected by you at 16:54", or "{step}: answered {answer} by you at 16:54" for any other answer, where {answer} is the label the step gave that event, as the Inbox card shows it ("Send to a manager"), else the event's id, since only a person sends a wait step its answer; one still open shall read "{step}: waiting for your answer", and one a timer moved on, or left open when the run ended, "{step}: not answered". A run waiting for a child run, or for the answer about a call whose outcome is unknown, is not an approval. The section shall be left out for a run that asked for no approval. Lines shall be plain text.

## Examples

- Given a run whose person approved gmail_send at 10:42 and whose rule rejected drive_save at 10:44,
  then Approvals lists "Send an email with Gmail: approved by you at 10:42" and "Use drive_save: rejected by a rule at 10:44".
- Given a run waiting on an approval for gmail_send,
  then Approvals lists "Send an email with Gmail: waiting for your answer".
- Given a run that was cancelled while waiting on an approval for gmail_send,
  then Approvals lists "Send an email with Gmail: not answered".
- Given a run whose person approved the wait step "Approve this reply?" at 16:54,
  then Approvals lists "Approve this reply?: approved by you at 16:54".
- Given a run whose person answered the wait step "Review" with escalate, which the step labels "Send to a manager", at 10:42,
  then Approvals lists "Review: answered Send to a manager by you at 10:42"; with no label it lists "Review: answered escalate by you at 10:42".
- Given a run whose wait step's timer moved it on before anyone answered,
  then Approvals lists "{step}: not answered".
- Given a run that asked for no approval,
  then the receipt has no Approvals section.
