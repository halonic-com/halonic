# kit.narrow

- Status: active
- Since: unreleased
- Source: HAL-17822; a11y check 2, row Z2 (HAL-12633); HAL-12667 option 1

The kit shall export a narrow-window context, set by a `NarrowProvider` and read with `useNarrow`, that says whether the window is narrower than `WIDE_MIN_WIDTH`, a phone included. Without a provider, it shall say the window is not narrow. It shall be separate from the presentation, so a narrow desktop window keeps the desktop's components.

## Examples

- Given a component that calls `useNarrow()` inside `<NarrowProvider narrow>`,
  when it renders,
  then it gets `true`, and `usePresentation()` still gets `desktop`.
- Given the same component with no provider,
  when it renders,
  then it gets `false`.
