# models.api-keys.open-by-secret

- Status: draft
- Since: unreleased
- Source: HAL-17481 (models flow 3.3 and microcopy 14.1: the Assistant's **Set the key ›** opens the provider's key block; asked on HAL-17334)

When another feature calls `ModelsService.openProviderPage(secretName, "key")`, the models feature shall open, in the window, the page of the first provider (by file name) whose `secret:` is that name, at the step `key` (`models.api-keys.open-at-key`); called with `"page"`, it shall open that page without the step. Where no provider has that `secret:` name, it shall run `workspace.open-models`, which opens the workspace page's Models, so the link still leads to where a key is set.

## Examples

- Given provider "Anthropic" with `secret: ANTHROPIC_API_KEY`, when the Assistant's **Set the key ›** calls `openProviderPage("ANTHROPIC_API_KEY", "key")`, then Anthropic's page opens at its key block.
- Given the same provider, when `openProviderPage("ANTHROPIC_API_KEY", "page")` is called, then Anthropic's page opens at the top.
- Given no provider has `secret: OPENAI_API_KEY`, when `openProviderPage("OPENAI_API_KEY", "key")` is called, then the workspace page's Models opens.
