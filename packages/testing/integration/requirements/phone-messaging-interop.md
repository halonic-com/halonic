# integration.phone-messaging-interop

- Status: draft
- Since: unreleased
- Source: HAL-17643 (phase 2 L2; rows L2-1 to L2-9 in the `acceptance` document on HAL-17997)

The suite shall run the phone's messaging client against the real remote gateway on loopback, through the gateway's test phone, with the desktop's allow-list view (`phoneMessaging`) over the real Paperclip provider and a fake Paperclip that refuses any request it doesn't expect. It shall check that a paired phone reads the Inbox, answers a normal card once and the answer reaches Paperclip exactly once, can't answer a risky item, reads the merge queue, is refused while Paperclip is offline, and gets `cut-off` when the gateway closes.

## Examples

- Given Acme's Paperclip with a confirmation card and a hire approval,
  when the paired phone reads the Inbox,
  then it gets both items, the approval marked risky.
- Given that Inbox,
  when the person accepts the card on the phone,
  then the phone gets `answered` and Paperclip saw exactly one accept for it.
- Given the hire approval,
  when the phone answers it,
  then the host refuses it with `not-allowed-remotely` and Paperclip saw no answer.
- Given Acme's GitHub snapshot with two queued pull requests,
  when the phone reads the queue,
  then it gets Acme's merge queue with both.
- Given Paperclip offline,
  when the phone answers the card,
  then the host refuses it and Paperclip saw no answer.
- Given an open session,
  when the gateway closes while a read is out,
  then the phone gets `cut-off`.
