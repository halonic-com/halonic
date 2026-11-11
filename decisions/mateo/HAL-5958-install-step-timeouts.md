# Decision: every install step in CI has its own time limit

- Task: HAL-5958 (follow-up to HAL-5765 and HAL-5833: a hung Ubuntu mirror held the merge queue on 11 Nov)
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:l9dJCXxRVEaM7g0G+e4RrkOvxomLAyomFQayxJjPtAhGPkHZarSMVV5ssGC4yBoR0motYEqcmxQlEIEOj9UsBQ==

## What changes

The steps that install packages or browsers get a step-level `timeout-minutes`:

- 8 minutes on the three `.github/actions/apt-install` steps in `.github/workflows/ci.yml` (Tauri shell, bubblewrap fence, Studio end-to-end).
- 5 minutes on `playwright install chromium webkit` in the Studio end-to-end job.
- 5 minutes on the Shellcheck step in `.github/workflows/wsl-image.yml`, which runs `apt-get` directly.

## Why

On 11 Nov the Ubuntu mirror hung apt installs for 15 to 20 minutes. The jobs ran until their own limit, which held the head of the merge queue and rebuilt the whole queue. HAL-5765 caps `apt-get update` and the download inside each attempt, but not the step as a whole: three attempts, the install itself and the cache-hit `dpkg` path could still run past the job's limit. With a step limit a hang fails the step in minutes.

8 minutes covers one full apt attempt (3 + 5 minutes) and leaves room for a fallback mirror. On `main` these steps take 14 to 34 seconds, and the browser download 10 seconds. No check is removed or weakened: the same steps run, they only fail sooner when they hang.

## Covers

- .github/
