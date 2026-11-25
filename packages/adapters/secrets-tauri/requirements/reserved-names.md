# secrets-tauri.reserved-names

- Status: active
- Since: unreleased
- Source: HAL-12237, security review HAL-14084; server pairings HAL-18501; `apps/studio/src-tauri/crates/secrets/requirements/secret-commands.md`

The lists of Halonic's own secret names in `@halonicjs/ports` (`halonicSecretNames` and `hostSecretNames`), in the shell's canonical form, shall hold exactly the names in the shell's shared fixture `tests/fixtures/reserved-names.txt`, which the shell's own list is checked against too, so the page and the shell never disagree on which names the secret commands refuse. For every case in the shell's `tests/fixtures/server-pairing-names.tsv`, the ports' `isServerPairingSecretName` shall be true only where the host's channel accepts the name, and `isHalonicSecretName` true exactly where the page's commands refuse it as reserved.

## Examples

- Given the fixture line `remote_host_key`,
  when the ports' lists are read,
  then `hostSecretNames` holds `remote-host-key`.
- Given the case `Server-Pairing__0123456789abcdef0123456789abcdef`, which the host's channel refuses and the page's commands reserve,
  when the ports check it,
  then `isServerPairingSecretName` is false and `isHalonicSecretName` is true.
- Given a name in the ports' lists that the fixture lacks,
  when the check runs,
  then it fails and names it.
