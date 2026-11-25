# studio.preview-auto-build

- Status: active
- Since: unreleased
- Source: HAL-18706

When a merge to `main` changes the Studio (`apps/studio/`), a package (`packages/`) or the lockfile, the Studio preview workflow shall start by itself; it can still be started by hand. A newer run shall replace a build that is still waiting, and shall never cancel a running publish. The installer job shall share the Rust release cache with CI's installer job; only runs on `main` shall save it, and a run on any other branch shall only read it. The publish job shall restore no cache, so it signs the installer the installer job built.

## Examples

- Given a merge to `main` that changes `apps/studio/src/app.tsx`,
  when it lands,
  then the preview workflow starts without anyone starting it.
- Given a preview run started by hand on a branch,
  when its build ends,
  then the Rust cache is not saved.
- Given the publish job,
  when it runs,
  then it restores no cache and signs the installer artifact from the installer job.
