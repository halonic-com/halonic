# plugins.plugin-trust-sign-ins

- Status: active
- Since: unreleased
- Source: HAL-8613; the designer's answer on HAL-13419 (a Sign-ins section in the trust check, the team's decision under HAL-2282); SI1 and SI2 of HAL-14004, decided by the team; the words approved by the board on HAL-8619 (`app.plugin-sign-in-trust`)

The Studio's trust check of a plugin shall show a Sign-ins section after Secrets when the plugin's backend has sign-ins, with one item per sign-in: its name, its purpose as plain text, the trust check line and, when the sign-in page and the token address are different services, the token host warning, in the words of `app.plugin-sign-in-trust` and without buttons. The section shall start closed, like the others, unless a sign-in has the token host warning: then it shall start open, so the warning is seen before Trust. A host that a setting holds shall be named as the dialog names it elsewhere, by the setting's label, and the sign-in shall still be shown before that setting is set. When the trust check shows what changed, a sign-in that was added shall be marked new with its purpose, a removed one removed with its purpose, and a changed one changed with what changed in it and, when its scopes changed, the trust line's "It can: …" as it is now, and a sign-in no row mentions shall be listed as unchanged.

## Examples

- Given a plugin that signs in to the address in its setting Server address, before that setting is set,
  when the trust check opens,
  then Sign-ins follows Secrets and the trust line names "the address you enter under Server address" for each host.
- Given a sign-in whose tokens come from `tokens.example.net` while the sign-in page is on the server's address,
  when the trust check opens,
  then the token host warning names both, and Sign-ins is open without being clicked.
- Given a plugin without sign-ins,
  when the trust check opens,
  then it has no Sign-ins section.
- Given a plugin whose sign-in `account` now asks for other scopes,
  when the trust check shows what changed,
  then "Sign-in account" is marked changed, with "what it can do changed. It can: change your projects.".
