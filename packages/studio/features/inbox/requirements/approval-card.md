# inbox.approval-card

- Status: active
- Since: 0.1.0
- Source: HAL-1218; [card requirements](/HAL/issues/HAL-64#document-requirements) INBOX-CARD-01, 05, 13, 15 to 18, 31; [flow-inbox](/HAL/issues/HAL-877#document-flow-inbox) 5.3; [ux-checklists-approvals](/HAL/issues/HAL-1250#document-ux-checklists-approvals) 2.1 to 2.4 and 2.6; [ux-checklists](/HAL/issues/HAL-1069#document-ux-checklists) 2.5 to 2.7; [microcopy](/HAL/issues/HAL-751#document-microcopy) 10.2 and 19; the way back on the decided card (HAL-4008)

The approval card shall be a region named by its title, "_Agent_ wants to use _tool_ (_connector_)", and opening it shall focus the title, never Approve. The header says since when it waits, counting on every minute while the card is open, and has **Open run**. The action shows the summary as its heading, the neutral tag "External connector (MCP)" for a tool from a connector, the raw name, and every argument with **Show raw JSON**. A tool approval shows no timer.

The bar under the card holds **Reject**, **Ask for changes** and **Approve**. For 1 s after the card opens, a press that started in that second, or a key that is held or repeats, does nothing; a screen reader's click, with no press before it, goes through. No key decides. While a decision is sent its button reads "Approving…" or "Rejecting…" and is busy, and the others ignore presses. If it fails, "Couldn't record your decision." shows with **Try again** in the bar's alert slot and the card stays as it was.

**Ask for changes** opens a dialog, "Ask for changes", with its **Note** field focused. Enter adds a line and Ctrl Enter sends, the same as **Send note**, which reads "Sending note…" while the note is sent. **Send note** is never disabled: an empty note shows "Say what should change." under the field and focuses it. A note that can't be sent keeps the dialog open with the note and says "Couldn't record your decision."; Cancel closes it and the card keeps the note until the item is decided.

After a decision the card shall be replaced in place: the header keeps **Open run** but no longer says since when it waits, the action's summary, muted in a dashed frame, then the decided Callout, which takes focus: "Approved by you at 10:44. The run continues.", "Rejected by you at 10:44. This tool call didn't run. The agent is told, and the run continues." or "Note sent to the agent at 10:44: _note_", with the note as plain text, never as Markdown or HTML, folded like a long argument. Then **Next: _title_ · _2_ left**, or "Nothing else is waiting for you." It never says "Done" or "Sent" and has no Undo. When you came from a run's **Review in Inbox**, the decided card also offers **Back to run 01JD8Q**, secondary, beside **Next** or the line; from an agent chat, **Back to the chat with _Mailbot_**. The way back stays when nothing else waits, so you always have one.

## Examples

- Given Sorter's call to `notes-mcp__create_note` with `{ title: "Refund for Sam", body: "" }`, asked at 10:42,
  when the card opens at 10:43,
  then the title "Sorter wants to use create_note (notes-mcp)" has focus, the header reads "Waiting since 10:42 (1 min)", the tag reads "External connector (MCP)", and the arguments read `title: Refund for Sam` and `body: (empty)`.
- Given the card has been open for 1 s,
  when you press Approve at 10:44,
  then it reads "Approving…" until the answer is recorded, then "Approved by you at 10:44. The run continues." has focus.
- Given the card opened less than 1 s ago,
  when you click Approve,
  then nothing is sent; a screen reader's click at the same moment is sent.
- Given recording the decision fails,
  when you press Reject,
  then "Couldn't record your decision." shows with **Try again**, and the buttons stay.
- Given the card has been open for 1 s,
  when you ask for changes with the note "Use the shorter title" at 10:44,
  then `reject` is sent with the note, the dialog closes and "Note sent to the agent at 10:44: Use the shorter title" has focus.
- Given the Ask for changes dialog with an empty note,
  when you press Send note,
  then nothing is sent and "Say what should change." shows under the focused note.
- Given you came to the card from run 01JD8Q's **Review in Inbox** and nothing else waits,
  when you approve it,
  then "Nothing else is waiting for you." shows with **Back to run 01JD8Q**, which opens that run.
