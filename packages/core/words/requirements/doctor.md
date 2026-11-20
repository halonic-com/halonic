# words.doctor

- Status: active
- Since: unreleased
- Source: HAL-13406; first-run-progress 4.2 and 7 (one shared message file for the CLI and Studio), sized by Liam on HAL-8005 item 1

The words package shall hold every sentence `halonic doctor` shows, keyed by its area and name, such as `doctor.diskFree`, so Studio's Check this computer and the CLI take the same words from one place. A sentence shall come out as a phrase: its text, its bold and dim parts and its marks by name, never colour codes or a face's own stand-ins, and its plain text shall use the Unicode marks. A sentence that names a command, such as the fix after "not trusted yet", shall take the finished command as given and add nothing to it, because only the face that shows it knows how to quote a folder for the person's shell.

## Examples

- Given 48 GB free and Halonic's data at 1.4 GB, of which run logs 1.1 GB,
  when the Disk ✓ sentence is made,
  then its key is `doctor.diskFree` and its words are "48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)".
- Given the command "halonic trust --dir ./acme",
  when the Workspace ! sentence for a workspace changed since it was trusted is made,
  then its words are "changed since you trusted it · halonic trust --dir ./acme", with the separator as a mark.
- Given a check that ran over its 5-second limit,
  when its sentence is made,
  then its words are "didn't answer in 5 seconds".
