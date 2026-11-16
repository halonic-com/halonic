# code-editor.loaded-on-demand

- Status: active
- Since: 0.1.0
- Source: HAL-10536 (conditions of the CodeMirror decision); HAL-1293

The code editor package shall load CodeMirror only when a file is first opened, so its entry point imports nothing from CodeMirror and fetches the editor with a dynamic import.

## Examples

- Given the package's entry point, then its source holds no static import of CodeMirror or of the editor module.
- Given a file is opened, then the editor is made and shows the text.
