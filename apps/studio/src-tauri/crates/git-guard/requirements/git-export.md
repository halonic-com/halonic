# studio.src-tauri.crates.git-guard.git-export

- Status: draft
- Since: 0.1.0
- Source: HAL-11571; `app.plugin-add`; `studio.src-tauri.crates.git-guard.git-hardening`

When the shell exports a commit of a remote repository, it shall take only an `https://` or `ssh://` address and a plain branch, tag or full commit id, and shall refuse every other address, one that starts with `-`, one with a password, a `%` escape, a space, a control character or a backslash in it, and every other reference, before it starts git or makes a folder. It shall fetch only that commit, with depth 1, no tags and no submodules, into an empty bare repository in a folder of its own, with the runner's hardening and no user, system, credential, excludes or attributes config, and ssh that asks no question. It shall refuse a commit with more files, or more bytes in all or in one file, than its limits, from the commit's listing and before it writes a file, and a fetch that grows its folder past the fetch limit. It shall write the files without a `.git` folder and leave only them behind. When the caller cancels, the deadline passes or any step fails, the shell shall stop git with every program it started and remove every folder the export made.

## Examples

- Given the address `ext::sh -c touch% x` or `-oProxyCommand=…`,
  when the shell exports it,
  then it is refused as `address_not_allowed` and no folder is made.
- Given an address with a password after the user name,
  when the shell refuses it,
  then the message does not repeat the password.
- Given the reference `main..other` or `--upload-pack=x`,
  when the shell exports,
  then it is refused as `reference_not_allowed`.
- Given a remote whose default branch is `main`, and no reference,
  when the shell exports it,
  then it writes that branch's files with no `.git`, answers the full commit id and `main`, and leaves only the files.
- Given a commit with more files than the limit,
  when the shell exports it,
  then it is refused as `export_too_large` and no file is written or left.
- Given an export whose git never answers,
  when the caller cancels,
  then git is stopped and no folder is left.
