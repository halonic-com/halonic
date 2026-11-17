# models.api-keys.enter-key

- Status: draft
- Since: unreleased
- Source: HAL-10 migration checklist U31, P7 (Now, decided; new: the old app has no key entry); changed by the save-model decision, HAL-1102 (req-models, HAL-110; flow-models, HAL-177)

When the user enters an API key on a provider's page, the models feature shall store it under the provider's secret name in the OS keychain (of this computer on desktop, of the host when served) and never in a workspace file; in a served page opened on another device over plain http it shall offer no field and show the host command, and over https it shall warn and offer the host command too.

## Examples

- Given provider "Anthropic" with `secret: anthropic` and no key stored, in the desktop app,
  when the user types `sk-acme-test-123` into "API key" and presses "Save key",
  then the OS keychain holds the key under `anthropic`, the field is cleared, and no file in the workspace changes.
- Given the same key saved, when an agent runs on alias `smart` (provider `anthropic`), then the request uses that key.
- Given a provider with no `secret:` name, then the page asks for a secret name first and offers no key field.
- Given a served Studio opened in a browser on the machine that runs `serve`, when the user saves a key for "Anthropic", then the host's keychain holds it under `anthropic` and no warning is shown.
- Given a served Studio opened over plain http from a laptop on the local network, when the user opens "Anthropic", then above the key field the page says the key can't be sent from here because the connection is not encrypted.
- Given that laptop, then there is no key field, because the host refuses a key sent over plain http (`server.secrets-refusals`); the page shows the host command to run on that machine instead.
- Given a served Studio opened over https from another device, then the warning says the key is sent over an encrypted connection and still names the host command.
- Given a served Studio with no password where the page counts as off-host (for example through a tunnel), then there is no key field; the page says a password is needed for `serve` to enter keys from another device and shows `halonic secret set anthropic` to run on the host.
