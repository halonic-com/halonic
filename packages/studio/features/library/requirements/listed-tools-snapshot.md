# library.listed-tools-snapshot

- Status: active
- Since: 0.1.0
- Source: HAL-2213 / HAL-8338 part 3 (HAL-8634)

The Library feature shall build a connector's review snapshot from the core review of its listed tools, so that each changed tool shows the texts it changed since its stored approval, the approved text beside the new one, and whether only its server changed.

## Examples

- Given a tool that was approved and whose description changed,
  when the snapshot is built,
  then its row has one difference with the approved text as `before`, the new text as `after` and the hidden-change kind, if any.
- Given a tool that was never approved,
  when the snapshot is built,
  then its row is `not_approved` with no differences.
- Given a tool whose text is the same but whose server changed,
  when the snapshot is built,
  then its row has `serverChanged` and no differences.
- Given an approval that can't be read and doesn't name its tool,
  when the snapshot is built,
  then `unreadable` has no `toolName`.
