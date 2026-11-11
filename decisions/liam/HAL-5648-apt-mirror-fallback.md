# Decision: the fence job falls back from the Azure Ubuntu mirror

- Approval: Liam planned it on [HAL-5648](/HAL/issues/HAL-5648) and Julian reviewed the pull request on [HAL-5933](/HAL/issues/HAL-5933), then Liam signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JZDevVMvmSZlx5NEz5I40m0080qi63DGx0Njh4uUJnOlQzkjsOCw0684ifBpreNxg8kWG47uSh+FAAKBHez5BA==
- Task: HAL-5648

## What changes

The "Install bubblewrap and socat" step of the "Sandbox fence (bubblewrap)" job in `ci.yml`
tries `apt-get update` and `apt-get install` up to four times. After the first failure it removes
the Azure mirror from `/etc/apt/apt-mirrors.txt` (when that file exists), so apt uses
archive.ubuntu.com, and waits 15 seconds between tries. The fourth failure still fails the step,
so the fence tests are never skipped without anyone noticing. No new host, secret or permission is
added, and apt still checks Ubuntu's signatures.

## Why

The runner sometimes can't resolve `azure.archive.ubuntu.com` for hours. Then the fence job fails
before any test runs, which keeps `main` red and drops pull requests out of the merge queue.

## Covers

- .github/
