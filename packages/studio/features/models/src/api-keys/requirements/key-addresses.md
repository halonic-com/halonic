# models.api-keys.key-addresses

- Status: draft
- Since: unreleased
- Source: HAL-11872 (step B b of the design on HAL-11343, approved on HAL-11347); `secrets-tauri.key-origins`; `keyDestination` in `@halonicjs/adapter-workspace-models`

Where the Studio's key store keeps the addresses a key may be sent to (the desktop keychain), the models feature's keys shall read a key's addresses and add one to them through that store, under the same name rule as the key itself, and shall pass on a list that can't be read as an error, never as no addresses. The address a provider's key field offers shall be the one the model resolver sends the key to, and only when that is the provider type's own address; a provider with an address of its own, or a type with none, shall get no address offered. A Studio whose key store keeps no addresses shall have none to show.

## Examples

- Given a key `acme-key` whose addresses are `https://llm.example.com`,
  when its addresses are read,
  then the answer is `https://llm.example.com`.
- Given a key saved before addresses existed,
  when its addresses are read,
  then the answer is none recorded.
- Given a keychain that can't read the list,
  when the key's addresses are read,
  then the read fails.
- Given the name `token-key`,
  when its addresses are read or one is added,
  then it is refused and the keychain is not asked.
- Given an Anthropic provider with no `baseUrl`,
  when its offered address is asked,
  then it is `https://api.anthropic.com`; given `baseUrl: https://gateway.example.com/v1`, there is none.
