# Decision: a connector's Secrets section in the approved key words

- Approval: HAL-15225 (words check C553, rows 26, 28 and 29, a team decision on an approved screen under HAL-2282); the CTO, Liam, approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:NxCbflm1hX+izQR3UmlEn4Ost0fS8tUxrtGiO8oxUs1RY53HT3oZGMj47JZks1WoQm5C1ZvO+AHNNxHX8JOfBw==

`library.connector-secrets` changes three things it says, and empties the entry for a refused name.
The line under each secret's name is the approved key hint (microcopy rev 96,
as on the Models page): "Kept in your system keychain, never in files." in
place of "Stored in your secrets on this computer.", which read as the store
`halonic secret set` writes too, so `halonic doctor` could say a secret isn't
set while Studio shows **Set**. A failed save or remove is in 1.1's form, the
reason after a colon in lower case. A name that belongs to Halonic or to a
plugin now says whose it is and the next step, "Give it another name in the
connector's file.", and empties the entry, without asking the store, which
refuses it with no reason Studio may show.

## Covers

- library.connector-secrets
