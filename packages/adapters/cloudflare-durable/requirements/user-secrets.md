# cloudflare-durable.user-secrets

- Status: active
- Since: unreleased
- Source: HAL-13223 (selling layer S1-11, end-user secrets); selling layer design, sections 3.4 and 13.5; the sealing from HAL-16242

The usage object of a person's scope (`u/`) shall keep that person's wrapped data key and sealed secrets in its own storage, and only what it is handed: it never holds the key-encryption key, so it can't open them. It shall refuse a secret call for an organisation's scope (`o/`) or for a scope other than its own, before anything is read or stored. It shall keep the first wrapped data key it is given and hand that one back to every later first write, store and replace a sealed secret by its name in `secretKey` form, list only names, never a sealed value, and remove a secret, where removing one that isn't stored changes nothing. It shall refuse a name not in `secretKey` form, an empty sealed value or one over 300,000 characters, and a new name past 100 secrets, with a `RangeError` and without storing anything. Reading names or the data key shall not note a scope. Erasing the object for a scope delete shall remove the secrets with the rest of its storage.

Rationale: a secret belongs to the person, even when they work in an organisation, so it lives only in their personal object; the object is reachable only by the scope the Worker names from the signed-in session, and the cap keeps one account from filling its object's storage.

## Examples

- Given `u/eu_alice…`'s object holding `GITHUB_TOKEN`,
  when a call for `u/eu_bob…` asks it for that secret, its names or its data key,
  then it is refused.
- Given the object of `o/acme`,
  when a secret is stored in it,
  then it is refused and nothing is stored.
- Given two first writes, with the wrapped data keys `uk1.first` and `uk1.second`,
  then both get `uk1.first` back.
- Given 100 stored secrets,
  when a 101st name is stored,
  then it is refused, while replacing one of the 100 still works.
- Given a person's object with a secret,
  when the scope is erased,
  then its names and data key are gone.
