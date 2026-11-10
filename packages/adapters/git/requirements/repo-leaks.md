# git.repo-leaks

- Status: active
- Since: 0.1.0
- Source: HAL-2669 (reviews of #765 and #766); the desktop's `git-guard` (`repository.rs`)

The git adapter shall refuse a repository whose own config could send git's traffic somewhere else or let others read it: `url.<base>.insteadOf` and `pushInsteadOf`, `remote.<name>.pushurl`, and `http.sslVerify`, `http.sslCAInfo` and `http.sslCAPath`, also for one URL. It shall refuse every `hook.<name>.*` key, which newer git runs as a hook. It shall send each remote's `uploadpack` and `receivepack` back to git's defaults on every call. It shall refuse a repository nested as a gitlink, or nested and not yet tracked, whose git folders are outside the workspace, and say which alternate objects folder is missing when one is. It shall run only the git subcommands it uses itself, so a subcommand such as `blame` or `stash` can't start a program the repository names, and refuse an option that reads or writes a file it names, such as `--output` or `config --file`.

## Examples

- Given a repository whose config sets `url.https://acme.example/.insteadOf`,
  when the adapter opens it,
  then it refuses, naming the key.
- Given a nested repository whose `.git` file says `gitdir:` a folder outside the workspace,
  when the adapter opens the outer repository,
  then it refuses.
- Given a repository,
  when a call asks for `git blame`,
  then the adapter refuses it.
