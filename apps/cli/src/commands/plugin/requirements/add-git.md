# cli.commands.plugin.add-git

- Status: active
- Since: 0.1.0
- Source: HAL-1736 and HAL-6653 (P3, plugin add from git); cli-output 3.6, approved on HAL-2123

The `halonic plugin add` command shall read a source with a scheme such as `https://` or `ssh://`, a transport such as `ext::`, or the form `user@host:path` as a git address, and anything else as a folder. The commit shall be what follows the last `@` after the last `/` and `:`, so the user part of an address stays in it. It shall export that one commit, or the latest commit on the remote's default branch when none is given, through the hardened git export into a temporary folder outside the profile and every workspace, add the plugin from there as from a folder, keep the address and the full commit id in the plugin's install record, and delete the temporary folder. When no commit was given it shall print "! Using commit 3f2c1ab, the latest on main. Add @<full commit id> to pin it." before the trust check. An address or commit the export refuses shall be refused with "✕ Couldn't add the plugin: <reason> · Check the folder or git address." and exit 2, before git reaches any remote, before the live line shows any part of the address, and with nothing written to the plugins folder. No line it prints shall contain a password from the address.

A branch or tag with `/` in it, such as `feature/maps`, can't be pinned yet: after `@` it is read as part of the address. A full commit id pins such a branch's commit instead.

## Examples

- Given a remote whose default branch is main,
  when `halonic plugin add https://github.com/acme/weather` is run and the user trusts it,
  then it prints "! Using commit 3f2c1ab, the latest on main. Add @3f2c1ab… to pin it." and "✓ Added Weather 1.2.0. It's on.", and the install record keeps the address and the full commit id.
- Given the source `https://example.com/weather.git@--upload-pack=touch`,
  when `halonic plugin add` is run,
  then it refuses the commit before git reaches the remote and exits 2.
- Given the source `ext::sh -c touch% marker`,
  when `halonic plugin add` is run,
  then it refuses the address, starts no program and exits 2.
- Given an `https://` address with a user and a password and no path,
  when `halonic plugin add` is run,
  then it refuses the address and exits 2, and the password appears on no line it prints, the live line included.
