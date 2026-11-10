# kit.kit-services

- Status: active
- Since: 0.1.0
- Source: HAL-3519; base component specs 18.5 (revision 21, L6), 9 and 8

The kit shall export a `ClipboardProvider`, through which the shell sets how kit parts put text on the clipboard (the desktop app's Tauri clipboard), with `navigator.clipboard` and the browser's copy command used when there is none, and a `ToastStoreProvider`, through which the shell gives kit parts the window's toast store, with none where there is no provider. A `Dialog` shall give the parts inside it its own polite region, through which a part says a text the same way the shell's announcer does; outside a Dialog a part shall get none.

## Examples

- Given a part inside a `Dialog`,
  when it says "Copied" through the Dialog's region,
  then the Dialog's polite region reads "Copied" on the next frame.
- Given a part with no `ToastStoreProvider` round it,
  when it asks for the toast store,
  then it gets none.
