# studio-click-test.card-steps

- Status: active
- Since: unreleased
- Source: HAL-19002 (the board's re-plan of HAL-18861's acceptance, 26 Nov; Liam's plan approval, 27 Nov)

The click test shall check each card kind it seeds, one step per kind after the Start menu shortcuts step and before Disconnect, each needing Connect Paperclip. Each step shall seed its kind twice on the throwaway Paperclip: an Inbox copy, made by the board on a task of its own, and a Messenger copy, made by the seeded agent on its chat in a run that a message on the chat starts, each copy's prompt ending in "(Inbox)" or "(Messenger)". It shall then answer the Inbox copy from its row in the main window's Inbox, and the Messenger copy in the agent's chat in Halonic Messenger, and after each answer shall read the copy back through the test Paperclip's API: its status and the fields of its result the answer sets (the options picked, the reason). It shall answer the second surface even when the first failed, and a failure's note shall name each surface that failed. It shall find Halonic Messenger's window by its label, `messenger`, since another window, such as Halonic Inbox, can name the agent too. Like every step, the card steps shall run in the nightly run and when a change touches the code their requirements are about (`studio-click-test.affected-steps`).

The kinds it checks:

1. **Yes/no:** Accept in the Inbox, Reject in the Messenger.
2. **Plan approval**, bound to revision 1 of its task's `plan` and needing a reason to reject: in the Inbox, Reject opens a field labelled "Why are you rejecting this?" instead of sending, and the field's Reject sends the reason, which Paperclip keeps. In the Messenger, the card leaves Reject out and says "Reject needs a note: choose it in your Inbox.", and Accept answers it.
3. **One question, one pick:** an option's button answers it on each surface, and Paperclip has that option.

## Examples

- Given an agent that never posts its copy on the chat,
  then the step fails as `NOT_SEEDED`, saying so.
- Given an Inbox whose Accept never reaches Paperclip,
  then the yes/no step fails as `NOT_ANSWERED_ON_PAPERCLIP`, noting "Inbox:".
- Given a plan card whose Reject sends at once, with no reason field,
  then the plan step fails as `NO_REASON_FIELD`.
- Given an Inbox whose Accept never reaches Paperclip and a Messenger answer recorded as another one,
  then the yes/no step still answers the Messenger copy and fails as `NOT_ANSWERED_ON_PAPERCLIP`, noting "Inbox:" and then "Messenger:".
- Given a Halonic Inbox window that names the agent and lists the Messenger copy, open before Messenger's,
  then the step answers the copy in Messenger's window.
- Given a Messenger answer that Paperclip records with another option,
  then the step fails as `WRONG_ANSWER`, noting "Messenger:" and what Paperclip has.
