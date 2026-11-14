# models.providers.list-and-show

- Status: draft
- Since: 0.1.0
- Source: HAL-10 migration checklist U30 (Now) (req-models, HAL-110; flow-models, HAL-177)

The Providers section of the workspace page shall list the providers in `providers/`, sorted by id, each with its type and a "local" or "cloud" badge, and each shall open a provider page showing its type, base URL, secret name and file.

## Examples

- Given `providers/anthropic.yaml` (type anthropic, secret anthropic) and `providers/ollama.yaml` (name Ollama, type ollama, local),
  when the user opens "Workspace settings…",
  then Providers lists "Anthropic · anthropic · cloud" and then "Ollama · ollama · local".
- Given the user opens "Anthropic", then the page shows Type "anthropic", Base URL "default", Secret "anthropic", and a link to `providers/anthropic.yaml`.
- Given no providers, then the section says "No providers yet (providers/)."
- Given `privacy.localOnly: true`, then the page of "Anthropic" says "Blocked: this workspace is set to local only."
