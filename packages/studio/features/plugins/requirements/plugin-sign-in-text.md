# plugins.plugin-sign-in-text

- Status: active
- Since: unreleased
- Source: HAL-8613; HAL-984 design section 6; wording and flow approved by the board on HAL-8619 (19 Nov); the team's wording for the other lines listed on HAL-8613

The Studio shall describe each sign-in of a plugin's backend from its sheet and the settings it has now, resolved as the host approves it (`approvedSignIns`): the host of the sign-in page, the host Halonic gets the tokens from, each scope's reason in the sheet's order and the hosts the token may go to; when a setting the sign-ins read is missing or wrong, it shall have only each sign-in's name and purpose. Its trust check line shall read "Signs in to your *service* account at *authorize host*. Halonic gets the tokens from *token host*. It can: *reasons*. The sign-in is used only with *access hosts*.", leaving out "It can: …" for a sign-in without scopes. When the two hosts differ and aren't a known pair (Google's `accounts.google.com` and `oauth2.googleapis.com`), it shall warn "The sign-in page and the token address are different services: *authorize host* and *token host*. Only continue if you expect that." Its lines for how a sign-in ended shall be the approved ones (cancelled, a refused client secret, a provider's error with its code, different access with what is missing and what is extra), a line of the team's for each other way, and nothing for a sign-in that got the access it asked for; after a sign-out the provider didn't confirm, "You're signed out here. *service* didn't confirm, so the token may still work there until it expires."

## Examples

- Given the Acme sign-in on auth.example.com with two scopes and access to api.example.com and files.example.com, and its client ID set,
  when its trust line is written,
  then it is "Signs in to your Acme account at auth.example.com. Halonic gets the tokens from auth.example.com. It can: read your projects; change your files. The sign-in is used only with api.example.com and files.example.com."
- Given the client ID isn't set,
  then only the sign-in's name and purpose are known.
- Given a token URL on tokens.example.net,
  then the token host warning names auth.example.com and tokens.example.net.
- Given Google's sign-in page and token host,
  then there is no warning.
- Given a sign-in that got `admin` it didn't ask for,
  then the line is "Acme gave a different set of access than you were asked to approve: extra admin."
- Given the person cancelled at the provider,
  then the line is "You cancelled the sign-in."
