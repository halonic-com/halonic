# words.doctor-lines

- Status: active
- Since: unreleased
- Source: HAL-13406; first-run-progress 4.2 (Check this computer says what `halonic doctor` says), sized by Liam on HAL-8005 item 1

The words package shall turn each line of the doctor's report, other than the Sandbox line, into its label and its items, in the order `halonic doctor` prints them, so the CLI and Studio say the same: each item a sentence, a fix (the sentence that says what to do, starting with "Fix:") or a docs link. The command a sentence names, such as `halonic trust` with the person's `--dir`, a secret's name as one word of the person's shell, and the shell a harness's sign-in is typed into shall come from the face that shows the line. Text from a workspace file, a model server or a harness shall be made printable. A check that ran over its limit, the Sandbox's included, shall say "didn't answer in 5 seconds". The Sandbox line's reason and fix shall stay with each face, because they differ between the CLI and Studio on purpose.

## Examples

- Given a workspace changed since it was trusted, and the face's trust command "halonic trust --dir ./acme",
  when its line is worded,
  then the label is "Workspace" and the one sentence is "changed since you trusted it · halonic trust --dir ./acme".
- Given a workspace on the Windows drive /mnt/c under WSL,
  when its line is worded,
  then after the trust come the drive's sentence, the fix "Fix: if you use it only from the command line, move it into your Linux home folder (~), then run halonic doctor again." and the docs link to the sandbox page's `#wsl2-folder` section.
- Given the secret files-token isn't set and the connector files uses it,
  when the Secrets line is worded,
  then the label is "Secrets" and the one sentence is "files-token isn't set (connector files) · halonic secret set files-token", with the name as the face's shell word.
- Given HTTPS_PROXY is an https:// proxy,
  when the Network line is worded,
  then the label is "Network" and the one sentence is "HTTPS_PROXY is an https:// proxy; Halonic only uses http:// proxies".
- Given Writer uses Codex, which isn't installed,
  when the Harnesses line is worded,
  then it has the sentence "Writer uses Codex, and it isn't installed." and the fix "Fix: install Codex, then run halonic doctor again.".
- Given the disk check ran over its limit,
  when its line is worded,
  then the label is "Disk" and the one sentence is "didn't answer in 5 seconds".
