# models.providers.list-and-show

- Status: draft
- Since: unreleased
- Source: HAL-10 migration checklist U30 (Now) (req-models, HAL-110; flow-models, HAL-177); HAL-12647

The Providers section of the workspace page shall list the providers in `providers/`, sorted by id, each with its type and a "local" or "cloud" badge, and each shall open a provider page showing its type, base URL, secret name and file.

## Examples

- Given `providers/anthropic.yaml` (type anthropic, secret anthropic) and `providers/ollama.yaml` (name Ollama, type ollama, local),
  when the user opens "Workspace settings…",
  then Providers lists "Anthropic · anthropic · cloud" and then "Ollama · ollama · local".
- Given the user opens "Anthropic", then the page shows Type "anthropic", Base URL "The provider's own", Secret name "anthropic", and a link to `providers/anthropic.yaml`.
- Given a provider of type `openai-compatible` with no base URL, then its page's Base URL shows "Needed for this type", because that type has no usual address.
- Given no providers, then the section says "No providers yet. A provider is the company or local server that runs your models, like Anthropic or Ollama."
- Given `privacy.localOnly: true`, then the page of "Anthropic" says "Acme is local only, so it can't use this provider." (Acme being the workspace name)
