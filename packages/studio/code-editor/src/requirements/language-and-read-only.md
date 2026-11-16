# code-editor.language-and-read-only

- Status: active
- Since: 0.1.0
- Source: component specs 24.7; req-files (HAL-110); HAL-1293; HAL-10536

The code editor shall choose YAML, Markdown or plain text from the file name, shall name its text area for screen readers after the file, and shall refuse every edit while it is read-only without losing the text or the cursor.

## Examples

- Given the file is `hubs/p/hub.yaml` or `x.yml`, then the language is YAML; `skills/tone.md` is Markdown; anything else is plain text.
- Given the editor is read-only, when the user types, then the text does not change.
- Given the editor was read-only and is made editable again, when the user types, then the text changes.
- Given the editor shows `models.yaml`, then a screen reader hears "models.yaml" for the text area.
