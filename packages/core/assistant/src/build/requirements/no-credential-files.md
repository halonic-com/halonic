# assistant.build.no-credential-files

- Status: active
- Since: unreleased
- Source: HAL-16869 (Julian's security sign-off on HAL-16790, #5423)

The Build chat's `read_file`, `list_files`, `propose_file` and `propose_delete` shall never read, list or write a common credential file, in a trusted workspace too: `.npmrc`, `.yarnrc.yml`, `.netrc`, `_netrc`, `.pypirc`, `.git-credentials`, `.pgpass`, an SSH key named `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, `id_ecdsa_sk` or `id_ed25519_sk`, a file ending in `.pem`, `.key`, `.p12` or `.pfx`, `.aws/credentials`, `.docker/config.json`, `.kube/config`, or anything in `.ssh/` or `.gnupg/`, in any folder and however it is spelled (case folded, trailing dots and spaces removed, as the `DefinitionStore` port compares names). They shall refuse it before the store is touched, with "Couldn't read <path>: it can't be read." for a read and "Couldn't change <path>: it can't be written to." for a write.

## Examples

- Given a trusted workspace with `.npmrc`,
  when the model calls `read_file` for `.npmrc`, `hubs/sales/.NPMRC.` or `certs/server.pem`,
  then the result is "Couldn't read <path>: it can't be read.".
- Given a trusted workspace with `.npmrc`, `.ssh/config` and `package.json`,
  when the model calls `list_files`,
  then the list is only `package.json`, and `list_files` with `under: ".ssh"` is refused.
- Given a trusted workspace,
  when the model calls `propose_file` for `.git-credentials`,
  then the result is "Couldn't change .git-credentials: it can't be written to." and nothing is written.
- Given a trusted workspace,
  when the model calls `read_file` for `keys/id_ed25519.pub` or `docs/keys.md`,
  then it reads the file.
