# models.aliases.edit-target

- Status: draft
- Since: 0.1.0
- Source: HAL-10 migration checklist U29 (Now); changed by the save-model decision, HAL-1102 (req-models, HAL-110; flow-models, HAL-177)

When the user changes an alias's provider or model in the alias editor, the models feature shall write it to `models.yaml`, saved at once and undoable as one step (Ctrl Z), and, while the model name is empty, not write the file and show a field error.

## Examples

- Given alias `smart` on provider `anthropic`, model `claude-sonnet-5-5`,
  when the user picks provider "OpenAI" and types model `gpt-5-mini`,
  then `models.yaml` is saved with `smart: { provider: openai, model: gpt-5-mini }` and the status line says "Updated model alias smart".
- Given the provider list, then local providers show as "<name> (local)", e.g. "Ollama (local)".
- Given the user clears the model field and leaves it, then `models.yaml` is not written and the field says "Give the model a name. Put back gpt-5-mini."
