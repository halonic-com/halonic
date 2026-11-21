# sandbox-srt.windows-setup-version

- Status: active
- Since: unreleased
- Source: HAL-5404, HAL-3779

The sandbox-srt adapter shall record, in `windows-setup-version.json`, the version of sandbox-runtime pinned for the repository and the Windows setup version that version's `srt-win` needs, because a change of setup version means `windows-install` must run again (one administrator prompt) and a rollback across it must uninstall first. The recorded sandbox-runtime version shall be the pinned one, so a bump can't keep a setup version recorded for another release. On Windows, after srt's install, the setup version `srt-win` reports it needs and the one the install recorded on the machine shall both be the recorded setup version.

## Examples

- Given sandbox-runtime pinned at a version,
  when the record is read,
  then it names that version and a whole setup version above zero.
- Given a Windows machine after srt's install,
  when `srt-win user status` is read,
  then the setup version it needs and the one on the machine are the recorded one.
