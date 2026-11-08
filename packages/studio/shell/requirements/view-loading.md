# shell.view-loading

- Status: active
- Since: 0.1.0
- Source: HAL-171; plan 5.3, 8

The shell shall load a view by importing its module and taking the named export given in `view`. If the module has no such export, then it shall throw a `ShellError` that lists what the module does export.

## Examples

- Given `{ view: "AgentEditorView", load }` where the module exports `AgentEditorView`,
  when the view is loaded,
  then that export is returned.
- Given a module that exports only `default`,
  when the view `AgentEditorView` is loaded,
  then a `ShellError` naming `AgentEditorView` and `default` is thrown.
