# format.skill-scripts-folder

- Status: active
- Since: 0.1.0
- Source: HAL-188, HAL-3011, HAL-3628

The format shall tell whether a program start touches a skill's `scripts/` folder (a `skills/<name>/scripts` part, in either slash style and any letter case) in the program, an argument, the value of an argument joined with `=` or the folder it starts in, as written, resolved against the folder it starts in or through a symbolic link, so every adapter that starts a program refuses the same starts.

## Examples

- Given `node skills/mail/scripts/send.js`,
  when it is checked,
  then it touches a skill's scripts.
- Given `node --file=skills/mail/scripts/send.js`,
  when it is checked,
  then it touches a skill's scripts.
- Given `node --file=innocent` where `innocent` is a link to `skills/mail/scripts/send.js`,
  when it is checked,
  then it touches a skill's scripts.
- Given `node scripts/build.js skills/mail/SKILL.md`,
  when it is checked,
  then it does not.
