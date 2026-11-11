# Decision: CI installs its apt packages through one retrying, cached action

- Task: HAL-5765 (CI on `main` went red twice on 11 Nov because the runner couldn't resolve the Ubuntu mirror)
- Approval: the task asks for this change; Mateo reviewed it on [HAL-5984](/HAL/issues/HAL-5984), Liam signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oaB/CVv7imy2SIkZ3JbVAOz5tTR2r3ZWkPZrHrtAJG/fKfEXV5rOxl9eAdI2F/kjXSsIR6+zY/QUMK1+jHr8Cw==

## What changes

A new composite action `.github/actions/apt-install` installs a list of apt packages. It keeps the downloaded `.deb` files in the Actions cache, keyed on the runner image and the package list, and only `main` writes that cache. On a cache miss it makes up to 3 attempts, each capped (3 min for `apt-get update`, 5 min for the download), and switches mirror after a failed one: first `archive.ubuntu.com`, then `mirrors.edge.kernel.org/ubuntu`.

`.github/workflows/ci.yml` uses it in the bubblewrap fence job, the Tauri job (the keychain packages now go in the same step) and the Studio end-to-end job. There the package list comes from `playwright install-deps --dry-run`, so `playwright install` only downloads the browsers.

## Why

On 11 Nov `apt-get install` in the bubblewrap job couldn't resolve `azure.archive.ubuntu.com` (runs 43031037299 and 43038492667), and the Playwright job hung in `playwright install --with-deps` until its timeout. That was a runner network problem, not a code change. The last fallback is outside `ubuntu.com` because every `ubuntu.com` name failed to resolve that day.

No check is removed or weakened: the jobs install the same packages and run the same steps. The action gets no secrets, and a pull request can only read the cache, not write it.

## Covers

- .github/
