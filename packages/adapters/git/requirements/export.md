# git.export

- Status: active
- Since: 0.1.0
- Source: HAL-1736 (plugins P3, PR 8)

The git adapter shall export the files of one commit of a remote repository into a folder, with no `.git` in it. It shall accept only an `https://` or `ssh://` address, and refuse one that starts with `-`, names a transport such as `ext::` or `file://`, is a local path, has a space or control character, or carries a password; the error never repeats the password. It shall accept a branch, a tag or a full commit id as the commit, and refuse anything else, such as an option, a range or `HEAD~1`, before it reaches the remote. It shall resolve the commit to its full id before it writes any file, fetch only that commit with no submodules, and give back the full id. When no commit is named, it shall export the branch the remote's `HEAD` points at and give back that branch's name too.

## Examples

- Given an address of `ext::sh -c touch% marker`,
  when the adapter exports it,
  then it refuses the address and starts no program.
- Given a commit of `--upload-pack=x`,
  when the adapter exports it,
  then it refuses before it reaches the remote.
- Given a remote with two commits and the first one named,
  when the adapter exports it,
  then the folder has the first commit's files and the full id of the first commit is given back.
