# ports.agent-messaging-steppers

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (the board's requirement on HAL-10, 24 Nov 13:05 UTC: "If Paperclip needs something, it ends up as a stepper in my Halonic Inbox"); architecture note on HAL-17491, sections 7.2, 7.4 and 7.8; Liam's review of #5674 (a runtime check of the request on an item); task HAL-17536

The `AgentMessaging` port shall let an inbox item carry a stepper request instead of a single definition: the format `halonic.stepper-request/1`, the request document's text at the revision its source pinned, at most 16 KB, that revision, what each block touches with its risk, and whether the source has a newer revision. Such an item is an action item: it shall take only an `action-result` answer that passes its check, in which a step is a block, numbered from 1.

The ports package shall have a check that takes a stepper request on an item only when every field is on its allow-list and holds what the list says: the format, a document of at most 16 KB in UTF-8, a revision of plain text of at most 200 characters, at most 20 touches, each with a block number from 1 to 20, a risk of `routine`, `admin` or `irreversible` and at most 20 targets with only a service, a kind and a name, each plain text of at most 2,000 characters, and whether it changed as true or false. A problem it reports shall name the field and never its value. A provider shall run the check before it serves the item.

The `action-result` answer shall let a succeeded step be marked as done by hand, and only a succeeded step.

## Examples

- Given a stepper request with a field not on the list, at its top, in a touch or in a target,
  when it is checked,
  then it is refused, the problem naming the field and not its value.
- Given a stepper request whose document is over 16 KB in UTF-8, or whose format is another,
  when it is checked,
  then it is refused.
- Given a stepper request with 21 touches, a block numbered 0 or a risk that isn't one of the three,
  when it is checked,
  then it is refused.
- Given an item with a stepper request and a reply, or with an `action-result` answer that passes its check,
  when it is asked whether the answer fits,
  then the reply doesn't and the answer does.
- Given a succeeded step marked done by hand, or a failed one,
  when the answer is checked,
  then the first is taken and the second refused.
