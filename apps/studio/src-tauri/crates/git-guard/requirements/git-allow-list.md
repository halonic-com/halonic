# studio.src-tauri.crates.git-guard.git-allow-list

- Status: draft
- Since: 0.1.0
- Source: HAL-192, HAL-1508 (closes HAL-6 finding 7)

When the Studio asks the shell to run git, the shell shall run it only if the first argument is a subcommand on the allow-list and every option matches, exactly, an option on that subcommand's list, with a value that meets the option's rule. If an option is shortened, bundled, unknown or given a wrong value, if a global option comes first, or if a URL appears anywhere but in `remote add` or `remote set-url`, then the shell shall refuse the call before git starts. After `--`, every argument shall count as a path. If a revision or path, before or after `--`, is absolute (`/`, `\`, `C:` or `\\server`) or has a `..` component, then the shell shall refuse the call, because `diff` reads a path outside the repository as `--no-index` and would print any file. If a remote name starts with `.`, or a URL's host or user starts with `-`, then the shell shall refuse the call. If a `commit` has neither `-m` nor `--message`, and is not `--amend --no-edit`, then the shell shall refuse it with `message_required`, because git would take its message from `commit.template`, a file the repository's config can name anywhere.

## Examples

- Given the call `pull --upload-pac=touch%20owned`,
  when it is checked,
  then it is refused, because `--upload-pac` is not on `pull`'s list.
- Given the call `-c core.pager=touch%20owned status`,
  when it is checked,
  then it is refused, because `-c` is not a subcommand.
- Given the call `push https://git.acme.example/acme.git main`,
  when it is checked,
  then it is refused, because `push` takes a remote name, not a URL.
- Given the call `remote add origin ext::sh`,
  when it is checked,
  then it is refused; `remote add origin https://git.acme.example/acme.git` is allowed.
- Given the call `add -- --upload-pack=x`,
  when it is checked,
  then it is allowed, with `--upload-pack=x` as a path.
- Given the call `diff -- /dev/null ../.ssh/id_ed25519`,
  when it is checked,
  then it is refused, because both paths lie outside the repository.
- Given the call `commit --allow-empty-message`, in a repository whose config sets `commit.template` to a file outside it,
  when it is checked,
  then it is refused, so the file can't become a commit message and be pushed.
- Given the call `remote add origin ssh://-oProxyCommand=x/acme.git`,
  when it is checked,
  then it is refused, because ssh would read the host as an option.
