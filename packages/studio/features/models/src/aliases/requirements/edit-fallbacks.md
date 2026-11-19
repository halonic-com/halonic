# models.aliases.edit-fallbacks

- Status: draft
- Since: unreleased
- Source: HAL-10 migration checklist U29 (Now); changed by the save-model decision, HAL-1102 (req-models, HAL-110; flow-models, HAL-177)

When the user edits an alias's "Fallbacks" field, the models feature shall save the comma-separated alias names, trimmed and without empty entries, in that order, as the alias's `fallback` list.

## Examples

- Given alias `smart` and other aliases `default`, `fast`,
  when the user types ` default, , fast ` in "Fallbacks",
  then `models.yaml` is saved with `fallback: [default, fast]` for `smart`.
- Given the field hint, then it reads "Tried in order when this one is down, slow or busy, or has no key set. Other aliases: default, fast".
- Given the user empties the field, then `fallback` is empty.
- Given the user types `smartest`, which is not an alias, then `models.yaml` is not written and the field says "There's no model alias called smartest. Pick one from the list.".
