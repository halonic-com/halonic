# studio.installer-take-back

- Status: active
- Since: unreleased
- Source: HAL-16084; HAL-16082 (findings: a reinstall's sandbox step makes the later take-back impossible); HAL-16342 (with administrator rights see `studio.installer-elevated`)

When the Windows installer installs Halonic without administrator rights, it shall run the installed agent host's `--sandbox-take-back` (`agent-host.sandbox-take-back`) as the person installing, before its sandbox step and whether or not the sandbox box is ticked, so the access a removal with administrator rights kept on that person's folders is taken back before the sandbox step recreates srt's sandbox account. No outcome of it shall stop the install.

## Examples

- Given the installer template,
  when its sandbox step section runs,
  then it runs `--sandbox-take-back` before it reads the sandbox box and before it starts the sandbox helper, and goes on whatever it exits with.
- Given a Windows computer where a removal with administrator rights kept a standard user's access and srt's sandbox account is gone,
  when that user installs Halonic again,
  then `srt-win user status` run as that user says srt keeps no grants, and the kept access entry is gone from the folder.
