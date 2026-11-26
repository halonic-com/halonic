# inbox.wait-context

- Status: active
- Since: unreleased
- Source: HAL-19395 (Sofia's first-run walk-through of the 0.2.0 build, HAL-19383 gap G3; the designer's team decision on a detail of an approved screen)

When the desktop Studio shows the card for a run waiting at a `wait` step, it shall show what the answer is about: above the title a meta line with the run's workflow name, followed by " · Sample answers" (the `runs.sample-chip` chip) when the test model wrote the run's answers, read as the CLI prints it, "Support reply · Sample answers"; when the workflow has a start field and the run started with text in it, that text as a quote above the draft; and the step's body in its own box. When the step's description ends with paragraphs that fill nothing in (no `{{…}}`) after one that does, and the body ends with those words, the Studio shall show them as a caption above the answer buttons and never inside the draft's box, before or after an answer; once answered the caption goes with the buttons. The card's title, which takes focus when the card opens, shall name the meta line as its description. The Inbox row and Home's Needs you row for that run shall start with the same meta line, then the run's short id. When the Studio doesn't know the step's description, as the served Studio doesn't yet, it shall show the body as plain text with no box while the card waits.

## Examples

- Given a run of Support reply on the test model, started with the email "Hi, my order #1042 arrived damaged. Can I get a refund?", waiting at `review`, whose description is "Approve this reply?", then `{{context.reply}}`, then "Approving finishes the run. Nothing is sent.",
  when its card opens,
  then the line above "Approve this reply?" reads "Support reply · Sample answers", the email shows as a quote above the draft, the draft's box holds the reply but not "Approving finishes the run. Nothing is sent.", and that sentence shows above **Approve** and **Reject**.
- Given that card,
  when you press **Approve**,
  then the draft's box still doesn't hold "Approving finishes the run. Nothing is sent.".
- Given that run in the Inbox list,
  then its row's meta line starts "Support reply · Sample answers · run".
- Given a step whose description fills nothing in after its first line,
  when its card opens,
  then its whole body shows in the box and there is no caption.
- Given a card whose step's description isn't known,
  when it opens,
  then its body shows as plain text with no box and no caption.
