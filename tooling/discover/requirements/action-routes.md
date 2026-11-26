# discover.action-routes

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, section 2.4; task HAL-17518 (PR 3-2); plan approved on HAL-20151

When `pnpm discover` runs, it shall write `apps/studio/src-tauri/src/generated/action-routes.json` in the `halonic.action-routes/1` format, holding every route `routesOf` builds for the shipped catalog's definitions of a service the desktop shell sends to, and each host their guided steps open with no browser path prefixes, and leave the file untouched when it is already up to date. Every pattern and template in it shall be one the shell's route list can read, so the shell never refuses the whole list.

## Examples

- Given the shipped catalog,
  when the list is built,
  then it holds the guided step of `github.upload-social-preview@1` and no route of an `npm`, `google` or `registrar` definition.
- Given the shipped catalog,
  when the list is built,
  then no pattern in it holds a group, a `|` or a `.` outside a class, and no address holds a query.
- Given a list already written,
  when `pnpm discover` runs again,
  then it doesn't rewrite the file.
