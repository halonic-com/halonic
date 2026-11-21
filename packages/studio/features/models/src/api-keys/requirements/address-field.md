# models.api-keys.address-field

- Status: draft
- Since: unreleased
- Source: HAL-11872 (step B b of the design on HAL-11343, approved on HAL-11347; the UX checklist on HAL-11872, rows B-4 to B-9, B-13, B-14, B-17 and B-19); `models.api-keys.key-addresses`

Where the Studio keeps a key's addresses, when the user saves a key on a provider's page, the key block shall ask for the address the key may be sent to and keep only its scheme, host and port, showing that address under the field once focus leaves it. A new key shall need an address, pre-filled with the provider type's own address when it has one and empty for a custom provider; the key shall never be stored without the address it was saved with. A stored key with addresses shall list them, the first with "+N more" opening the rest in place, and shall take another address only after "Add another address"; a new value for that key shall keep its addresses. An address that isn't `http` or `https`, doesn't parse or holds a user name or password shall be refused under the field before anything is saved, and plain `http` to an address that isn't this computer shall be noted but allowed.

## Examples

- Given an Anthropic provider with no key stored,
  when the user types a key, leaves "Address" at `https://api.anthropic.com` and presses "Save key",
  then the key and the address are stored and the page says "Key saved. Address: https://api.anthropic.com".
- Given a custom provider,
  when the user types `https://Gateway.example.com/v1` and leaves the field,
  then the page says "Allowed address: https://gateway.example.com. Only the address part is kept."
- Given a custom provider and an empty "Address",
  when the user presses "Save key",
  then the page says "Enter an address for this key.", focus moves to the field and nothing is stored.
- Given `ftp://llm.example.com` or `https://user:pw@llm.example.com`,
  when the user presses "Save key",
  then the matching error shows under the field and nothing is stored.
- Given a new key whose address the key store doesn't keep,
  when the user saves it,
  then the new key is removed again and the save fails.
- Given a key with the addresses `https://api.example.com` and `https://gateway.example.com`,
  when the user opens its page,
  then it shows `https://api.example.com` and "+1 more", which opens the other address.
- Given `http://192.168.1.20:8080`,
  when the user leaves the field,
  then the page notes that the address isn't encrypted, and Save still stores it.
