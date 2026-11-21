# kit.dialog-alert

- Status: active
- Since: unreleased
- Source: HAL-11873 UX checklist C-5 ("Allow this address?" is an `alertdialog`)

When a `Dialog` has `alert`, the kit shall give its `<dialog>` `role="alertdialog"`, with the same name, description, focus and closing as any Dialog. Without it, the `<dialog>` keeps its own `dialog` role.

## Examples

- Given a Dialog "Allow this address?" with `alert`,
  when it mounts,
  then a screen reader finds an `alertdialog` named "Allow this address?" and described by its body.
- Given a Dialog "Delete agent?" without `alert`, then its `<dialog>` has no `role` attribute.
