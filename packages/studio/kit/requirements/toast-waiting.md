# kit.toast-waiting

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 9 ("While a modal dialog is open", "On a phone")

While one of the kit's modal Dialogs is open, the `ToastRegion` shall keep every toast in the page, visually hidden but with its live role, so screen readers hear it when it arrives, and shall draw none of them nor run their timers until the last Dialog closes. On a phone it shall draw only the oldest toast, the others waiting the same way in order until it closes.

## Examples

- Given an open Dialog,
  when a `success` toast "Agent saved" is shown,
  then it is read but not drawn, and it is drawn when the Dialog closes.
- Given four toasts on a phone,
  when the first closes,
  then the second is drawn.
