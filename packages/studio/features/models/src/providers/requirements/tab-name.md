# models.providers.tab-name

- Status: draft
- Since: unreleased
- Source: UX check C104, P3 (HAL-12952, HAL-12963)

The tab of a provider shall be named after the `name` in its file in `providers/`, and after its id with a capital when the file has no name or hasn't been read yet, and the tab shall take the new name when `providers/` changes it (`shell.item-tab-names`).

## Examples

- Given `providers/lm-studio.yaml` with `name: LM Studio`,
  when the user opens the provider,
  then its tab says "LM Studio", not "Lm-studio".
- Given `providers/anthropic.yaml` with no name, then its tab says "Anthropic".
- Given a provider tab saying "LM Studio",
  when the user renames the provider "LM Studio (laptop)",
  then the tab says "LM Studio (laptop)".
