# studio.src-tauri.crates.git-guard.repo-leaks

- Status: draft
- Since: 0.1.0
- Source: HAL-3811, bringing over the git adapter's requirement `git.repo-leaks` (HAL-2669)

When the shell runs git in a repository whose `local` or `worktree` config sets a key that could send git's traffic somewhere else or let others read it, `url.<base>.insteadOf`, `url.<base>.pushInsteadOf`, `remote.<name>.pushUrl`, or `http.sslVerify`, `http.sslCAInfo` or `http.sslCAPath`, also in their `http.<url>.*` form, then the shell shall refuse the call with `config_not_allowed`, naming the key. If such an entry sets any `hook.<name>.*` key, which newer git runs as a hook, then the shell shall refuse the call the same way. The same keys from the user's own config still apply.

## Examples

- Given a repository whose config sets `url.https://evil.example/.insteadOf`,
  when the shell runs `status`,
  then the call is refused with `config_not_allowed`, naming the key.
- Given a repository whose config sets `remote.origin.pushUrl` to another server,
  when the shell runs `push`,
  then the call is refused with `config_not_allowed` and nothing is sent.
- Given a repository whose config sets `hook.acme.command`,
  when the shell runs `commit`,
  then the call is refused with `config_not_allowed` and the hook does not run.
- Given the user's global config sets `http.sslCAInfo`,
  when the shell runs `pull`,
  then the call runs with the user's value.
