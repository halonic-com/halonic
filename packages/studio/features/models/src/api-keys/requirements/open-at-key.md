# models.api-keys.open-at-key

- Status: draft
- Since: unreleased
- Source: HAL-12499 (UX check R1 and R2 on HAL-12390: the run page's **Add key** and **Replace key** open the provider's key field)

When a provider's page is opened with the step `key` (`openItem(provider, { step: "key" })`), the models feature shall scroll to the key block and put the focus on the key field, after the page's heading took it; where there is no field (a provider with no `secret:` name, or a served page that can't take a key) the focus shall go to the block's **API key** heading instead. Opened with the step again while the page is open, it shall do so again. Opened without the step, the page shall leave the focus where the window puts it.

## Examples

- Given provider "Anthropic" with `secret: anthropic`, when the run page's **Add key** opens it at `key`, then the focus is in the "API key" field.
- Given the same page is open and the focus moved elsewhere, when **Replace key** opens it at `key` again, then the focus is back in the field.
- Given a provider with no `secret:` name, when it is opened at `key`, then the focus is on the heading "API key", above "Give this provider a secret name above, then you can store its key here."
- Given a served Studio opened over plain http from a laptop, when "Anthropic" is opened at `key`, then the focus is on the heading "API key", above the host command.
- Given "Anthropic" is opened from the Providers list, then the key field doesn't take the focus.
