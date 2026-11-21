# Decision: sign-out-all also removes the grants of an integration the host has no parts for

- Approval: HAL-14918, from Liam's review of halonic#4307 (HAL-14850); Liam approves this note in his security review
- Kind: internal
- Task: HAL-14918
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:umu9/QCOaPQIc+/u/Tr/tSXfaXtGJko2GAJDLH9CTNQK1V93IiZS+lMFifsIOImeNKElZDR7u2HG8nRePj+5Dw==

## What changes

`SignInHost.signOutAll` used to sign out nothing when the host had no parts for the integration. A single-executable agent host (`isSea`) loads no plugins, so `plugins.signIns` gives `undefined` and the host has no parts for any plugin. Now, without parts, the host still finds the integration's saved grants from the token records (`savedSignIns`, as before) and signs them out with `signOutSavedSignIns`, over https only:

- **No secret is read.** Without the integration's picks there is no way to read its client secret, so the sign-out gets secrets that have none. A sign-in that needs a client secret gets no revoke (`notConfirmed`); one that needs none, a public client, is revoked at the address the person approved.
- **Each grant is removed**, whether or not the revoke was sent or succeeded, as for every other sign-out.
- **No refresh runs** for an integration without parts in this host, so there is nothing to wait for, which is what `signOutSavedSignIns` assumes.

A name with no saved grant still signs out nothing, and the other integrations' grants stay.

Changed requirement: `integration-sign-in.sign-out-all`. Its example "an integration the app doesn't name … the saved grants stay" becomes: a plugin this host doesn't name has its grants removed, with a revoke only where no client secret is needed.

## Why

Grants are saved per profile, not per host. A host that isn't a single executable, such as one started from a clone, can sign a plugin in, and the person can then remove the plugin's trust through a single-executable host on the same profile. Before this change, that left the grant, and a plugin added later under the same id, with the same sign-in description, found itself signed in without the person signing in again: the case HAL-14850 closed for every other host.

Not reading a secret is deliberate. The host doesn't run the plugin, so it has no picks to read the plugin's secrets through, and reading a workspace secret by the name the grant carries could read a secret the person never gave the plugin.

## Covers

- integration-sign-in.sign-out-all
