# models.api-keys.replace-or-remove

- Status: draft
- Since: 0.1.0
- Source: HAL-10 migration checklist U31 (Now, decided; new); changed by the save-model decision, HAL-1102 (req-models, HAL-110; flow-models, HAL-177)

When the user saves a new key or presses "Remove key" on a provider page, the models feature shall first ask, and on confirmation replace or delete the key under that secret name in this device's secret store, taking effect right away.

## Examples

- Given a key is stored under `anthropic`,
  when the user saves `sk-acme-test-456`,
  then the page asks "Change *anthropic*? Every agent that uses it switches to the new key right away." with "Change key" and "Cancel"; on "Change key" the stored key is `sk-acme-test-456` and the page still says "Key set", and on "Cancel" the old key stays.
- Given a key is stored under `anthropic`, when the user presses "Remove key" and confirms, then no key is stored under `anthropic` and the page says "No key".
- Given a served Studio on another device, then saving a new key shows the same off-host warning as `enter-key`; removing a key needs a signed-in session but no network warning, since no key is sent.
