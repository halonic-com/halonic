# kit.dialog-live-regions

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 8 and 23 A4

The kit's `Dialog` shall render, inside its `<dialog>`, a visually hidden `aria-live="polite"` region and a visually hidden `aria-live="assertive"` region with no `role`. While the Dialog is mounted inside a `ModalRegionsProvider`, the kit shall hand both regions to the provider's `pushModalRegions`, and when it unmounts it shall call the function that returned. A new `pushModalRegions` passed while a Dialog is open shall not hand its regions again. A region's `say(text)` shall clear the region and set `text` on the next animation frame, so the same text is read again, and a text still waiting for its frame when the Dialog unmounts shall be dropped. Without a provider, the regions shall stay empty.

## Examples

- Given a Dialog over Settings inside a `ModalRegionsProvider`,
  when the shell announces "Removed trust from inbox-helper",
  then the text appears in the top Dialog's polite region a frame later.
