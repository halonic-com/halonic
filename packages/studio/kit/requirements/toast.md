# kit.toast

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 9 and 23 A2 and A13

The kit shall export `createToastStore()`, a plain store with `show`, `close`, `focus`, `list` and `subscribe` and no knowledge of the shell, and a `ToastRegion` that shows one store. While it has toasts, the region shall be a `region` named "Notifications", placed bottom right 16px in and 360px wide (`--container-toast`), on a phone the width less 16px on each side and 8px from its wrapper's bottom, at `--layer-toast`, stacking cards 8px apart with the newest at the bottom. Each card shall be `surface-raised` with a 12px radius, `shadow-2`, 12px padding and a transparent 1px outline inside its edge for forced colours, and show the tone's 16px icon (`success`, `info` in accent, `running`, `warning`, `danger`), the title in `text-body-strong`, an optional line in `text-small` `fg-muted`, at most one action as an `accent-text` text button with no padding on the title line, underlined on hover, and a close button named "Close" and the title. The text and the action shall wrap as one group (`flex-wrap`, text `flex: 1 1 10rem`, action `flex: none; max-width: 100%`), so a long action goes under the text. A `danger` toast shall be `role="alert"` and stay until closed; the others shall be `role="status"`. A `success` or `info` toast shall close after 5s, or 10s with an action, with the timer paused while the pointer is over it, a finger is on it or focus is in it; `running` and `warning` shall stay until closed. The action and the close button shall close the toast, with a 120ms fade (`--duration-fast`) and no slide. On desktop the region shall show at most three, a fourth closing the oldest. `store.focus()` shall move focus to the newest drawn toast's first button; when a focused toast closes, focus shall go to the newest one left, else back to where it was before.

## Examples

- Given a `success` toast "Agent saved",
  when 5s pass without the pointer over it or focus in it,
  then it fades and leaves the store.
- Given three toasts on desktop,
  when a fourth is shown,
  then the oldest closes.
