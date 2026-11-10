# kit.line-frame-action

- Status: active
- Since: 0.1.0
- Source: HAL-3519; base component specs 18.4

When a `LineFrame` has an `action` (`{ label, onClick }`), the kit shall show it at the right of the line as a text button in `accent-text`, weight 500, with no padding, underlined on hover, with the focus ring and, on touch, a 48px hit area, and run `onClick` when it's pressed. The text and the action shall wrap as one group, so that when they don't fit side by side (200% text) the action goes under the text, starting where the text starts. The frame itself shall not change.

## Examples

- Given `<LineFrame icon={…} action={{ label: "Turn on", onClick }}>Sharing is off for this workspace.</LineFrame>`,
  when it renders,
  then "Turn on" is a button at the right of the line.
- Given the same LineFrame,
  when the user presses "Turn on",
  then `onClick` runs.
