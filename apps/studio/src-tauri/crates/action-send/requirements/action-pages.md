# studio.src-tauri.crates.action-send.action-pages

- Status: draft
- Since: unreleased
- Source: HAL-17525, HAL-17562 (Julian's backslash rule); architecture note on HAL-17491 (2.4, 7.1)

When a stepper asks the shell to open a guided step's page, the shell shall build the address only from that step's route, with each placeholder checked as for a send. When it asks to open a `browser` block's address, the shell shall open it only if it is `https`, holds no user name, password or port, no query or fragment and only printable characters, its host (lower-cased) is on the route list's web origins, and its path, decoded once, holds no `.` or `..` segment, `..`, `//`, `\`, `%2F`, `%5C` or `%2E` and starts with one of that host's path prefixes. Otherwise it shall refuse it as `bad-value` and write the reason only to its log. The shell shall open the same page at most once every 3 seconds, and any page at most once a second, and refuse more as `too-often`.

## Examples

- Given `https://github.com/acme/app/settings/variables/%255C..%255Caccess`,
  when a `browser` block asks to open it,
  then the shell refuses it, because the path still holds `%5C` after decoding once.

- Given `http://github.com/acme/app/settings/variables/actions` or `https://user@github.com/…`,
  when a `browser` block asks to open it,
  then the shell refuses it as `bad-value`.
- Given `https://evil.example/acme/app/settings/variables/actions`,
  when a `browser` block asks to open it,
  then the shell refuses it, because the host isn't on the list.
- Given `https://github.com/acme/app/settings/variables/%5C..%5Caccess`,
  when a `browser` block asks to open it,
  then the shell refuses it, because the path holds `\` after decoding.
- Given a page that just opened,
  when the stepper asks to open it again within 3 seconds,
  then the shell refuses it as `too-often`.
