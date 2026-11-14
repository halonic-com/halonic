# models.aliases.list

- Status: draft
- Since: 0.1.0
- Source: HAL-10 migration checklist U29 (Now) (req-models, HAL-110; flow-models, HAL-177)

The Models section of the workspace page shall list the aliases in `models.yaml`, sorted by name, each with "provider / model", and each shall open its alias editor as a tab.

## Examples

- Given `models.yaml` with aliases `smart` (anthropic, claude-sonnet-5-5) and `default` (ollama, llama3.2),
  when the user opens "Workspace settings…",
  then Models lists "default · ollama / llama3.2" and then "smart · anthropic / claude-sonnet-5-5".
- Given `models.yaml` has no aliases, then the section says "No model aliases yet. An alias is a short name like `fast` that agents use instead of a provider." and offers **New alias**.
- Given the user clicks "smart", then a tab "Alias: smart" opens, saying `Agents ask for "smart". Point it at any provider and model; nothing else changes.`
