# kit.dialog

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 8, 17.3, 23 A1, A7 and A10

When it mounts, the kit's `Dialog` shall open a native `<dialog>` with `showModal()`, named by its `title` (an `h2` in `text-heading`) and, unless it is a `form` or `flush`, described by its body. It shall draw a `surface-raised` box with a 16px radius, `shadow-3` and a transparent 1px border over the `overlay` colour, fading in with the enter easing, without scaling or blur, 440px wide for `sm`, 560px for `md` and 720px for `lg`, never wider than the window less 32px or taller than the window less 64px, and, when it has a `height` on desktop, that height within the same limit. Its body shall scroll and its footer shall not; when the window is shorter than 36em, the header shall scroll with the body. A `flush` body shall have no padding and a line under the header. The header shall have a ghost `sm` close button named "Close" and the title without a trailing question mark (or `closeLabel`) unless `closeButton` is `false` or it is on a phone. On desktop the footer shall show Cancel (or `cancelLabel`, ghost) then the confirming button (`primary` or `danger`), right-aligned; on a phone it shall stack them full width at 48px, the confirming one first in the DOM. Focus shall start on the first field of a `form` that is neither disabled nor inside a `hidden` element, else on Cancel. Escape, Cancel, the close button and a click that starts and ends on the overlay before anything was typed shall call `onCancel` and leave the dialog open for the screen to unmount; when the browser closes it anyway, it shall call `onCancel`. The confirming button shall call `onConfirm`; in a `form` it shall submit, and a submit while the button is `unavailable` or the Dialog is `busy` shall be ignored. While `busy`, the confirming button shall be busy and show its required `busyLabel`, Cancel and the close button shall be unavailable with the confirming button as their reason, and Escape, Cancel and the overlay shall do nothing. The body shall end in an always-mounted `role="alert"` slot with no box of its own; when `error` is set, the slot shall hold a `danger` Callout with no role, scrolled into view, and focus shall not move. On each attempt the slot shall empty and fill again a frame after the request ends, so the same message is read again.

## Examples

- Given a Dialog "Delete agent?" with the confirming button "Delete agent",
  when it mounts,
  then focus is on Cancel, and Escape calls `onCancel`.
- Given a busy Dialog whose request failed with "Couldn't delete Sorter.",
  when it stops being busy,
  then a frame later the alert slot reads "Couldn't delete Sorter." and focus stays on Delete agent.
