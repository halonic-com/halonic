# profile.token-folders

- Status: active
- Since: unreleased
- Source: HAL-13855 (Liam's option 2 on HAL-13854: Halonic makes the token key itself)

The profile package shall name the folders of the token stores the profile's `token-key` seals, `google/tokens` and `integration-sign-ins/tokens` in the profile folder, joined with the profile's own separator, so that the CLI and the Studio's host keep their tokens in the same places and both know every place a token sealed with the key may be. It shall create nothing.

## Examples

- Given the Linux profile folder `/srv/acme/.local/share/halonic`,
  when the token folders are found,
  then they are `/srv/acme/.local/share/halonic/google/tokens` and `/srv/acme/.local/share/halonic/integration-sign-ins/tokens`.
- Given the Windows profile folder `<drive>\Users\acme\halonic`,
  when the token folders are found,
  then they are `google\tokens` and `integration-sign-ins\tokens` in that folder, joined with `\`.
