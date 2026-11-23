---
"@halonicjs/app-studio": patch
---

The Assistant's Build chat never reads, lists or changes common credential files, even in a trusted workspace: `.npmrc`, `.yarnrc.yml`, `.netrc`, `_netrc`, `.pypirc`, `.git-credentials`, `.pgpass`, SSH keys named `id_rsa`, `id_dsa`, `id_ecdsa`, `id_ed25519`, `id_ecdsa_sk` or `id_ed25519_sk`, files ending in `.pem`, `.key`, `.p12` or `.pfx`, `.aws/credentials`, `.docker/config.json`, `.kube/config`, and anything in a `.ssh` or `.gnupg` folder, in any folder and however the name is capitalised.
