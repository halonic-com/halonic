# kit.presentation

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 0.2 (Building)

The kit shall export a presentation context whose value is `desktop` or `phone`, set by a `PresentationProvider` and read with `usePresentation`. Without a provider, the presentation shall be `desktop`. Kit components that change their element or layout on a phone shall read it from there, never from the window width.

## Examples

- Given a component that calls `usePresentation()` inside `<PresentationProvider presentation="phone">`,
  when it renders,
  then it gets `phone`.
- Given the same component with no provider,
  when it renders,
  then it gets `desktop`.
