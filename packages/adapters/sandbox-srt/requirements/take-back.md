# sandbox-srt.take-back

- Status: active
- Since: unreleased
- Source: HAL-16084; HAL-16082 (findings: a reinstall's sandbox step makes the later take-back impossible)

When asked to take back on its own the grants a removal with administrator rights left, the sandbox-srt adapter shall do what `sandbox-srt.forget-after-admin-removal` does before a setup, without the setup, and shall say what it did: `taken_back`, `none` when srt keeps nothing it should take back or the system isn't Windows, `elevated` when it skipped them because the process runs with administrator rights, or `failed` when srt couldn't forget them. It shall count only `taken_back` and `none` as done.

## Examples

- Given Windows, a process without administrator rights, and srt listing kept grants while its sandbox account is gone,
  when it is asked to take them back,
  then it runs `profile forget` and `acl forget --all` and says `taken_back`.
- Given srt still lists its sandbox account, or keeps no grants,
  when it is asked,
  then it forgets nothing and says `none`.
- Given the same orphaned grants and a process with administrator rights,
  when it is asked,
  then it forgets nothing and says `elevated`, which isn't done.
- Given `acl forget --all` fails,
  when it is asked,
  then it says `failed`, which isn't done.
- Given Linux,
  when it is asked,
  then it doesn't run srt-win and says `none`.
