# kit.command-box

- Status: active
- Since: 0.1.0
- Source: HAL-3519; base component specs 18.5 (revision 21, L6)

The kit's `CommandBox` shall show a command in `font-mono` `text-small` on `surface-muted`, with a 4px radius and 6px 8px padding, wrapping anywhere rather than scrolling sideways and selected whole by one click, next to a ghost icon button named "Copy command" that keeps that name after copying and has a 48px hit area on a phone. When the button is pressed, the kit shall put the command on the clipboard through the shell's `ClipboardProvider` if there is one, else through `navigator.clipboard`, falling back to the browser's copy command. When that works, it shall say "Copied" with a toast; when it fails, it shall leave the command selected and say "Couldn't copy. Select the command and copy it." the same way. While the CommandBox is inside a Dialog, it shall say either through the Dialog's polite region instead of a toast, with nothing passed by the screen, show a check in place of its icon after copying until the button loses focus, and show a failure under the box. With neither a Dialog nor a toast store round it, it shall say the outcome through a status line of its own.

## Examples

- Given `<CommandBox command="halonic trust ~/work/acme" />` under a `ToastStoreProvider`,
  when the user presses "Copy command" and the clipboard takes the text,
  then the command is on the clipboard and a "Copied" toast shows.
- Given the same CommandBox inside a Dialog,
  when the user presses "Copy command",
  then no toast shows, the Dialog's polite region says "Copied", and the button shows a check until focus leaves it.
- Given a page where neither way of copying works,
  when the user presses "Copy command",
  then the command is selected and the message is "Couldn't copy. Select the command and copy it."
