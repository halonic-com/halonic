# inbox.wait-card

- Status: active
- Since: 0.1.0
- Source: HAL-1218; [ux-checklists](/HAL/issues/HAL-1069#document-ux-checklists) 2.5 to 2.8; [microcopy](/HAL/issues/HAL-751#document-microcopy) 5 and 10.2; Liam's decision on the wait step's description (HAL-2560); the way back on the decided card and answer labels (HAL-4008); the outcome after a labelled answer and long labels (team decision, HAL-4050)

The card for a run waiting at a `wait` step shall be a region named by its title, the step's first line as core filled it in, and opening it shall focus the title. The header says since when it waits and has **Open run**. Lines 2 onward show as plain text, never as Markdown or HTML, folded behind "Show 38 more lines" (or "Show 1,200 more characters") when long, as `inbox.plain-values` says. A step with a timer says "Moves on by itself on Mon 9 Nov, 14:00."; one without says nothing about time.

The bar holds one button per answer the step takes, in its order: the first primary and full width, the rest secondary, none red. A button reads the step's own label for its answer when core supplies one (team wording decision, HAL-4008); otherwise "approve" reads **Approve**, "reject" **Reject**, any other the event in words with a capital first letter. A label has no length limit: a button keeps it on one line and ends it with an ellipsis at its edge, and its name and its tooltip are the whole label. The card has the approval card's 1 s guard and its "Couldn't record your decision." with **Try again**.

Once answered the card is replaced in place: the header keeps **Open run** but no longer says since when it waits, the body muted in a dashed frame, then the decided Callout, which takes focus: "Approved by you at 10:44. The run continues.", "Rejected by you at 10:46." (the step's own answer, so nothing about a tool call or the agent), or "You chose _Escalate_ at 10:44.", which names the answer with the same word, in the same capitals, as its button; an answer the step labels itself always reads this way, "You chose _Ask a lead_ at 10:44.", followed by what the built-in line says happens next: "You chose _Send reply_ at 10:44. The run continues." for a labelled `approve`, nothing more for a labelled `reject` or any other answer. The decided line shows the whole label, wrapping when it's long. Then **Next** or "Nothing else is waiting for you.", with **Back to run 01JD8Q** or **Back to the chat with _Mailbot_** beside it when you came from one, as on the approval card.

## Examples

- Given Acme's `review` step, "Approve this reply?" with the reply on the next line, waiting since 10:40,
  when the card opens at 10:43,
  then "Approve this reply?" has focus, the header reads "Waiting since 10:40 (3 min)", and a reply holding a Markdown link or `<script>` shows as the characters it holds.
- Given the card has been open for 1 s,
  when you press Reject at 10:46,
  then `reject` is sent and "Rejected by you at 10:46." has focus.
- Given a step that takes `approve` and `escalate`,
  when you press Escalate at 10:44,
  then `escalate` is sent and the card reads "You chose Escalate at 10:44."
- Given a step whose `escalate` answer has its own label "Ask a lead",
  when you press **Ask a lead** at 10:44,
  then `escalate` is sent and the card reads "You chose Ask a lead at 10:44."
- Given a step whose `approve` answer has its own label "Send reply",
  when you press **Send reply** at 10:44,
  then `approve` is sent and the card reads "You chose Send reply at 10:44. The run continues."
- Given a step whose `approve` answer has a label longer than its button,
  when the card opens,
  then the button shows the label's start on one line ending in "…", and its name and tooltip are the whole label.
