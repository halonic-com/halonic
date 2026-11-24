# assistant.chat.apply-all

- Status: active
- Since: unreleased
- Source: HAL-16800 (T14 PR 9); req-assistant (HAL-110); flow-assistant 3.5 (HAL-647); states H10 (HAL-5896); component specs 21.4 (HAL-175); microcopy 14.1, 14.2 and 19.5 (HAL-751)

While two or more items have changes to review from a chat, the chat shall show a strip above the box with "*n* items to review" and **Accept all** and **Reject all**, which accept or reject every change from that chat still to review, from any turn, as one undo step, with the toast "Accepted *n* changes in *m* items" or "Rejected *n* changes in *m* items" and **Undo**. The count shall be a button named "*n* items to review, go to the next one" that moves focus to the next card's **Review**. While the chat is answering, both buttons shall wait, still focusable, with "Wait for the answer to finish." written under the count as their reason. An item that waits for Compare shall be left out, and the toast shall name it after the result ("Accepted 5 changes in 2 items. Support triage waits for Compare."). When the person clicks **Undo**, the chat shall put the changes back to review in one step and announce "Undone: accepted *n* changes".

## Examples

- Given changes to review in 3 items from this chat, when the person clicks Accept all in the strip,
  then the chat's changes are accepted as one step and the toast says "Accepted 7 changes in 3 items" with Undo.
- Given the person clicks Reject all instead, then the toast says "Rejected 7 changes in 3 items" with Undo.
- Given the person clicks Undo on that toast, then the changes are back to review and "Undone: accepted 7 changes" is announced.
- Given the chat is still answering, then both buttons are `aria-disabled` and described by "Wait for the answer to finish.", written under the count.
- Given one of the items waits on Compare, when the person clicks Accept all,
  then the toast says "Accepted 5 changes in 2 items. Support triage waits for Compare.".
- Given changes to review in 1 item, then there is no strip.
