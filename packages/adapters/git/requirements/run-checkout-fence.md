# git.run-checkout-fence

- Status: active
- Since: 0.1.0
- Source: HAL-3125 (step 3 of HAL-3023); plan section 4.5 ("its own git checkout, not a shared worktree")

The git adapter shall make, inside a run's checkout folder, a private temp folder and an empty Turborepo cache folder, hide both from git, and say what the sandbox profile needs: the temp folder, the checkout's `.git/hooks` and `.git/config` as read-only paths, and `TMPDIR` and `TURBO_CACHE_DIR` pointing at the two folders. It shall refuse a folder that isn't absolute.

## Examples

- Given a run checkout,
  when its fence is made,
  then the temp and cache folders exist inside the checkout and `TMPDIR` and `TURBO_CACHE_DIR` name them.
- Given a run checkout,
  when its fence is made,
  then `git status` in the checkout shows no changes.
- Given a folder that isn't absolute,
  when its fence is made,
  then it is refused.
