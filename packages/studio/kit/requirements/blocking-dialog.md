# kit.blocking-dialog

- Status: active
- Since: unreleased
- Source: HAL-20516; board decision HAL-10 (27 Nov: a sign-in an app can't work without shows in a modal that can't be closed); plan approved on HAL-20519

The kit shall offer a `BlockingDialog` for an app that can't work until something is done. Mounting it shall open it as a modal `<dialog>` with `aria-modal="true"`, named by its title (`aria-labelledby`) and described by its one line (`aria-describedby`). It shall have no close button. Escape, a click on the overlay and a close the browser makes by itself shall not close it: while it is mounted it stays open. Focus shall start on what `initialFocus` returns, else on the title, and shall go back to the opener when the screen unmounts it, as in `kit.dialog-return-focus`. The kit's `Dialog` keeps closing on Escape, its ✕ and the overlay.

## Examples

- Given a mounted `BlockingDialog` titled "Sign in to Paperclip",
  when the user presses Escape or clicks the overlay,
  then it stays open.
- Given a mounted `BlockingDialog`,
  then it has `aria-modal="true"`, is named "Sign in to Paperclip" and has no button that closes it.
