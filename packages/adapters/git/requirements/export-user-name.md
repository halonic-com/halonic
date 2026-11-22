# git.export-user-name

- Status: active
- Since: unreleased
- Source: HAL-16337

When the git adapter checks an address before it exports a commit, it shall refuse an `https://` address that has a user name in it, such as `https://name@example.com/acme/a.git`, and the error shall not repeat the user name. It shall accept an `ssh://` address with its user, such as `ssh://git@example.com/acme/a.git`.

## Examples

- Given the address `https://name@example.com/a.git`,
  when the adapter checks it for an export,
  then it refuses with `Can't use that git address: it has a user name in it`, and the error doesn't contain the user name.
- Given the address `ssh://git@example.com/acme/a.git`,
  when the adapter checks it for an export,
  then it accepts it.
