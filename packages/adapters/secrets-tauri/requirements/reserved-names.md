# secrets-tauri.reserved-names

- Status: active
- Since: unreleased
- Source: HAL-12237, security review HAL-14084; `apps/studio/src-tauri/crates/secrets/requirements/secret-commands.md`

The lists of Halonic's own secret names in `@halonicjs/ports` (`halonicSecretNames` and `hostSecretNames`), in the shell's canonical form, shall hold exactly the names in the shell's shared fixture `tests/fixtures/reserved-names.txt`, which the shell's own list is checked against too, so the page and the shell never disagree on which names the secret commands refuse.

## Examples

- Given the fixture line `remote_host_key`,
  when the ports' lists are read,
  then `hostSecretNames` holds `remote-host-key`.
- Given a name in the ports' lists that the fixture lacks,
  when the check runs,
  then it fails and names it.
