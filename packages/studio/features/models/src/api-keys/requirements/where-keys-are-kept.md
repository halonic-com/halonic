# models.api-keys.where-keys-are-kept

- Status: draft
- Since: 0.1.0
- Source: HAL-10 migration checklist U31, P7, P8 (decided by the user on 8 Nov: the browser demo keeps no keys; a served page may take keys from any signed-in device, with a warning off the host) (req-models, HAL-110; flow-models, HAL-177)

Where the Studio runs in a browser without `serve` (the demo), the models feature shall offer no key field and say that the demo runs on the built-in test model.

## Examples

- Given the Studio in a browser with the demo workspace,
  when the user opens the page of "Anthropic",
  then there is no key field, and the page says the demo uses the built-in test model and points to the desktop app or `halonic serve` for real models.
- Given the desktop app, then the page says the key is kept in the system keychain.
- Given a served Studio, then the page says the key is kept on the host, and, on another device, shows the off-host warning from `enter-key`.
