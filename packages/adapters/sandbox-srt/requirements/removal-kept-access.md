# sandbox-srt.removal-kept-access

- Status: active
- Since: unreleased
- Source: HAL-15004, HAL-15836, HAL-5404 (S2)

When a removal of the Windows sandbox runs with administrator rights and so skips the grants srt kept for this user, the sandbox-srt adapter shall say it is done with `keptAccess: "until_next_start"` when srt then lists kept grants while its sandbox account is gone, the state in which the next start takes them back (`sandbox-srt.forget-after-admin-removal`); with `keptAccess: "manual"` when srt then lists kept grants with its sandbox account still there, or its status can't be read, as the next start doesn't take them back; and without `keptAccess` when srt lists no kept grants. So Settings, the CLI and the uninstaller can say what access stays. Any other removal that is done shall say it is done without `keptAccess`.

## Examples

- Given Windows and a removal with administrator rights that skipped the user's kept grants, after which srt lists kept grants and no sandbox account,
  when it finishes,
  then it is done with `keptAccess: "until_next_start"`.
- Given the same removal, but srt still lists its sandbox account,
  when it finishes,
  then it is done with `keptAccess: "manual"`.
- Given the same removal, but srt's status can't be read,
  when it finishes,
  then it is done with `keptAccess: "manual"`.
- Given the same removal, but srt lists no kept grants,
  when it finishes,
  then it is done without `keptAccess`.
