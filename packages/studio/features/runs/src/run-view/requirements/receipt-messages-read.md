# runs.run-view.receipt-messages-read

- Status: active
- Since: 0.1.0
- Source: HAL-62 receipt requirements RCPT-2.2, RCPT-2.7 and RCPT-3.3; the headings and line wording are a team decision under HAL-2282 (HAL-1301)

The run page's receipt shall have a Messages section that says what the run drafted and what it sent as two separate lines, "Drafted 1 email" first, then "Sent 2 emails and 1 invite". "Sent" shall count only what a send-risk tool recorded as sent, never a draft and never a file saved. It shall have a Read section with one line for all the run's reads, "Read 12 emails and 3 Drive files", never one line per read. A section with no line shall be left out. The lines shall be plain text.

## Examples

- Given a run that drafted 1 email and sent 2 emails and 1 invite,
  then Messages lists "Drafted 1 email" and "Sent 2 emails and 1 invite".
- Given a run that saved a Drive file and sent nothing else,
  then the receipt has no Messages section.
- Given a run that read 3 emails and 1 Drive file in four calls,
  then Read lists the one line "Read 3 emails and 1 Drive file".
- Given a run that read nothing a tool sheet names,
  then the receipt has no Read section.
