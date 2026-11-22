# models.api-keys.not-bound-yet

- Status: draft
- Since: unreleased
- Source: HAL-11872 (step B b of the design on HAL-11343, approved with the quiet badge on HAL-11347; the UX checklist on HAL-11872, rows B-2, B-3, B-15, B-16 and B-18); `models.api-keys.key-addresses`

Where the Studio keeps a key's addresses, while a stored key has none recorded (it was saved before addresses existed, or a new key was stored but its address wasn't kept), the key block shall show the neutral, non-interactive badge "Not bound yet" and an Address field under a notice that says the key has no address yet and keeps working as it does until an address is saved. It shall never fill in an address for such a key from the provider's name, unless the provider type has its own address, and it shall force nothing: no dialog, banner, count or blocked button. When the addresses can't be read, the key block shall say so, say "Check that your system keychain is unlocked, then try again.", since the list is kept in the keychain next to the key, and show **Try again**, which reads the addresses again; it shall show neither the badge nor an address (C566 #54, HAL-15361).

## Examples

- Given a key `anthropic` with no addresses recorded,
  when the user opens the page of "Anthropic",
  then it shows "Not bound yet" and the notice, and "Address" holds `https://api.anthropic.com`.
- Given that key,
  when the user presses "Save key" with no new key typed,
  then the address is stored, the page says "Address saved: https://api.anthropic.com" and the badge is gone.
- Given a key whose addresses can't be read,
  when the user opens its provider's page,
  then it says "Can't read the addresses saved for this key. Halonic won't use this key until that is fixed." and "Check that your system keychain is unlocked, then try again." with **Try again**, and shows no badge.
- Given that key, once its addresses can be read again,
  when the user presses **Try again**,
  then the block shows its first address and the alert is gone.
