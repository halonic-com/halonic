# shell.workspace-content-fields

- Status: active
- Since: 0.1.0
- Source: `shell.keybindings.one-undo-in-editors` (req-shell rev 8); save model 4.1 and HAL-396 1.1; HAL-1293

The shell shall let an editor or the form around its fields mark itself as showing workspace content, with `workspaceContentProps`, and shall tell whether a key press happened inside such a mark, with `isInWorkspaceContent`. A field outside a mark, such as the chat message box, is not workspace content.

## Examples

- Given an Instructions field inside a marked form and the chat message box outside it,
  when the shell is asked about a key press in each,
  then the Instructions field is workspace content and the message box is not.
- Given no target for the key press,
  when the shell is asked,
  then it is not workspace content.
