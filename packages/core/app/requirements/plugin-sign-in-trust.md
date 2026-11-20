# app.plugin-sign-in-trust

- Status: active
- Since: unreleased
- Source: HAL-8613; HAL-984 design section 6; the trust check line and the token host warning approved by the board on HAL-8619 (19 Nov); a Sign-ins section in the trust check, decided by the team with the designer on HAL-13419

The app shall give the words of a plugin's sign-in that every trust check shows, so `halonic plugin add` and Studio say the same: the trust check line, "Signs in to your *name* account at *sign-in host*. Halonic gets the tokens from *token host*. It can: *the scope reasons*. The sign-in is used only with *the access hosts*.", without "It can: …" when the sign-in asks for no scopes; and the token host warning, "The sign-in page and the token address are different services: *sign-in host* and *token host*. Only continue if you expect that.", which a check shows only when the two hosts differ and aren't a known pair of one provider, such as Google's `accounts.google.com` and `oauth2.googleapis.com`. Before the plugin's settings are set, the app shall give these facts from the sheet as written, with a host that a setting holds put into the words the check uses for it. A sign-in's client secret shall go only to the hosts of the token URL and the revoke URL of the sign-ins that name it.

## Examples

- Given a sign-in whose sign-in page, token URL and access hosts all come from the setting `server`,
  when its facts are read before the setting is set,
  then each host is the check's words for that setting, and there is no token host warning.
- Given a sign-in at `auth.example.com` that gets its tokens from `tokens.example.net`,
  when its trust check is shown,
  then the token host warning names both hosts.
- Given a sign-in that asks for no scopes,
  when its trust line is read,
  then it has no "It can: …".
- Given a client secret named by a sign-in with a token URL on the setting `server` and a revoke URL on `revoke.example.com`,
  when its hosts are read,
  then they are that setting and `revoke.example.com`, and no others.
