# ports.agent-messaging-item-kind

- Status: active
- Since: unreleased
- Source: HAL-19491 (board approved Sofia's proposal: the picture says who asks, a badge says what kind of item it is, 26 Nov); HAL-19664

The `AgentMessaging` port shall let a source say what kind of item an inbox item is with an optional `kind`: `approval`, `question`, `action`, `elsewhere`, `task` or `comment`. When an item has no `kind`, `inboxItemKind` shall give `action` for an item with `action` or `stepper`, `elsewhere` for an item with `answerElsewhere`, and `question` for any other. An item shall hold together only when it has kind `action` exactly when it is an action item, or has no kind.

## Examples

- Given an item with kind `approval`,
  when apps ask its kind,
  then it is `approval`, whatever its fields.
- Given an item with no kind and a `stepper`,
  when apps ask its kind,
  then it is `action`.
- Given an item with no kind and `answerElsewhere`,
  when apps ask its kind,
  then it is `elsewhere`.
- Given an item with no kind, options and no action,
  when apps ask its kind,
  then it is `question`.
- Given an item with kind `action` and no `action` or `stepper`, or an action item with kind `question`,
  when it is checked,
  then it doesn't hold together.
