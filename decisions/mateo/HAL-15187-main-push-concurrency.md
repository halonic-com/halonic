# Decision: pushes to main don't wait for each other

- Task: HAL-15187
- Approval: the board's speed-up decision on HAL-14831 (Timothy, 21 Nov), split out to HAL-15187; Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

In `.github/workflows/ci.yml`:

- **A push to `main` gets a run group of its own commit** (`ci-<sha>`), so its run no longer waits behind the previous push's run. Pull requests, merge groups and `release/**` pushes keep their groups.
- **Nine macOS and Windows jobs get a job group** shared by all pushes to `main`: `tauri-windows`, `tauri-keychain-macos`, `sandbox-fence-macos`, `sandbox-mxc-fence`, `sandbox-windows`, `installer-windows`, `update-windows`, and the macOS and Windows legs of `sandbox-os` and `agent-host`. One runs, one waits, and a newer push's job replaces the waiting one, as the whole run did before. Everywhere else the job group carries the run's own ID, so nothing waits.
- **`ci-ok` counts one of those nine jobs as skipped when it ended as cancelled on a push to `main`**, and says so in a notice. Any other cancelled job, a failed job, or a cancelled job on a pull request, merge group or release branch still fails `ci-ok`.

No job is removed and no check is loosened for pull requests or the merge queue.

## Why

Each push's run waited for the previous one, whose Windows jobs take 15–20 minutes, so the Linux jobs on our CI server sat idle. Running the macOS and Windows jobs on every merge would mean about 18 an hour, more than GitHub's macOS limit allows, so those keep one waiting run. A replaced job isn't a failure: the newer push tests the same code and more. The daily "Failures on main, by area" report already ignores cancelled jobs and runs.

## Covers

- .github/
