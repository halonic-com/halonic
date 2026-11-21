# Decision: a connector's secret is listed once, says it's Studio's own, and a failed save lets go of the value

- Approval: HAL-15263 (flow check C552, findings 1 and 6, a team decision on an approved screen under HAL-2282); the CTO, Liam, approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:n/XNTzlJxgB91ILg0VYuxEoidzjj79C4Rac2b1CPp2dY7d0+0USz99XVaNVNlUhJNXbx5oX90yEiI24HOG9+Aw==

`library.connector-secrets` and `library.connection-summary` change three things.
With the Secrets section on the page, "How it connects" no longer has its own
"Secrets" row: that second list had no state, and the connector's "Not checked
yet" right under it read as the secret's, even after it was set. The line under
each secret's name adds "It's Studio's own: halonic secret set doesn't reach
it.", because `halonic doctor` sends people to `halonic secret set`, which
writes the CLI's file, so Studio kept saying the secret "isn't set for Studio".
A failed save empties the entry, so the typed value isn't kept on the page,
not even masked.

## Covers

- library.connector-secrets
- library.connection-summary
