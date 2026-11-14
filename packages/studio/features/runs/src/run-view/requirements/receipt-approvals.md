# runs.run-view.receipt-approvals

- Status: active
- Since: 0.1.0
- Source: HAL-62 receipt requirements RCPT-2.4 and RCPT-3.3; the section's heading and line wording are a team decision under HAL-2282 (HAL-1301)

The run page's receipt shall have an Approvals section under its summary line that lists each approval the run asked for, in the order asked, as "{action}: approved by you at 10:42" or "{action}: rejected by a rule at 10:44", where the action is the Inbox card's plain words ("Send an email with Gmail", else "Use create_note"), saying who answered from what the log records ("you" for a person, "a rule" for an automatic decision) and when. An approval still open shall read "{action}: waiting for your answer", unless the run has ended (cancelled, or a child ended with its parent), when it shall read "{action}: not answered" because the run can no longer take an answer. A log that doesn't say who answered shall leave out the "by". The section shall be left out for a run that asked for no approval. Lines shall be plain text.

## Examples

- Given a run whose person approved gmail_send at 10:42 and whose rule rejected drive_save at 10:44,
  then Approvals lists "Send an email with Gmail: approved by you at 10:42" and "Use drive_save: rejected by a rule at 10:44".
- Given a run waiting on an approval for gmail_send,
  then Approvals lists "Send an email with Gmail: waiting for your answer".
- Given a run that was cancelled while waiting on an approval for gmail_send,
  then Approvals lists "Send an email with Gmail: not answered".
- Given a run that asked for no approval,
  then the receipt has no Approvals section.
