# inbox.final-state-open

- Status: active
- Since: unreleased
- Source: HAL-19496 (board report on HAL-10, comment 20e30d36: a card processed in Paperclip should update here too and animate to its state); plan approved by Liam; row L4.2 and team decision G1 in HAL-20218's UX acceptance rows

While an agent's item is open in the Inbox's pane, when it ends anywhere else, because it was answered, cancelled or expired there, the Inbox shall keep it open, and its bar shall become its final state in the kit's words (`kit.final-state`), as its row and the Messenger say it, such as "Approved by Liam · 10:00", "Cancelled · 10:00" or "Expired by Ada · 10:00", without its option buttons or reply field. When the line says only "Answered", the answer shall follow it, the option picked or the reply in quotes; a card that asked several questions shall keep its form, ticked and unavailable, described by the line (`inbox.question-cards`). When the focus was on a button or a stepper that went, the line shall take the focus, and the Inbox shall not read the card out again (`inbox.final-state`), since a screen reader already read the line. A card answered from this card shall keep its own line, such as "Answered at 10:00: Yes.".

## Examples

- Given Ada's card "Ship the release?" open in the Inbox,
  when Liam approves it in Paperclip at 10:00,
  then the card stays open and its bar says "Approved by Liam · 10:00", with no Yes or No.
- Given the same card open,
  when it is cancelled in Paperclip,
  then its bar says "Cancelled · 10:00".
- Given the same card open,
  when Ada lets it expire,
  then its bar says "Expired by Ada · 10:00".
- Given the same card open,
  when Liam answers No in Paperclip,
  then its bar says "Answered by Liam · 10:00", then "No".
- Given the same card open with the focus on Yes,
  when it is cancelled in Paperclip,
  then the focus is on "Cancelled · 10:00", and the Inbox reads nothing else out for it.
- Given the same card open with the focus outside it,
  when it is cancelled in Paperclip,
  then a screen reader hears "Ship the release?: Cancelled · 10:00" once.
