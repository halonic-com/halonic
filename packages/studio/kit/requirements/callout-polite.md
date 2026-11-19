# kit.callout-polite

- Status: active
- Since: unreleased
- Source: HAL-13125; Harness page check HS1 (HAL-13120); WCAG 4.1.3

With `announce="polite"`, the kit's `Callout` shall put its title, text and files in a `role="status"` region with `aria-atomic="true"`, and its actions outside that region, after it, so that a screen reader reads the words once when they appear or change and never reads the action's label or busy label with them. While its `children` are empty (`""`, `null`, `false` or absent), it shall draw no box, no icon and no action, and keep the same, empty region on the page, so that the region is already there when the words arrive. It shall have no `tabindex` and take no focus.

## Examples

- Given a polite `warning` Callout with no text and the action "Check again",
  when its text becomes "Writer can't run until Codex is installed.",
  then the status region that was already on the page holds that sentence, and "Check again" is outside it.
- Given the same Callout with its text,
  when its text becomes empty,
  then the box and "Check again" are gone and the empty status region stays.
