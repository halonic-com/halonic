# fs-web.focus-watch

- Status: active
- Since: 0.1.0
- Source: HAL-3335, HAL-5766

While a watch on the browser folder store is open, each time the page gets focus again or becomes visible, the store shall compare when each file last changed and its size with what it saw before, read only the files where one of them differs, and report the files whose text changed from outside as one batch, as `ports.definition-store-watch` says. It shall not report the store's own writes and removes, a file saved again with the same text, or the browser's pending copies. It shall report a change from outside that one of its writes found while it was pending. When the page may no longer use the folder, it shall tell the listener once with a `FolderAccessError` and report nothing more.

## Examples

- Given a watch on `a.yaml`, `b.yaml` and `c.yaml`,
  when another program changes `b.yaml` and the person comes back to the page,
  then the batch holds `b.yaml changed`, and only `b.yaml` is read.
- Given a watch on `a.yaml` holding `1`,
  when a write of `2` expecting `1` finds `3` from another program, and the person comes back,
  then the batch holds `a.yaml changed`.
- Given a watch, when the browser takes back access and the person comes back,
  then the listener hears a `FolderAccessError` once.
