# Decision: read the sandbox profile's environment, `-m` among short flags and quoted paths

- Approval: follow-up from Julian's security check of halonic#1587 on [HAL-4884](/HAL/issues/HAL-4884) (points 3 and 4); planned on [HAL-4903](/HAL/issues/HAL-4903), with Julian's security check and Liam's review of the pull request
- Kind: internal
- Task: HAL-4903

## What changes

Three gaps Julian found pass on `main` today. Each one makes the shared reading of a program
start (`format.program-start-paths`) and so `format.skill-scripts-folder` stricter:

1. **The sandbox profile's environment.** The sandbox adapters (`sandbox-host` and
   `sandbox-srt`) now pass the profile's `env` to the skill-scripts guard, so a `PATH`,
   `NODE_OPTIONS` or other value of the profile that names a skill's `scripts/` refuses the start.
   Only the profile's variables are read, which Halonic sets. The safe host `PATH` that
   `sandbox-srt` adds when the profile has none is the person's own environment, not workspace
   content, so it isn't read, as in the MCP adapter (HAL-4777). The srt runner, which gets only the
   merged environment, keeps checking the program, arguments and folder; the session in front of it
   reads the profile. The values are only resolved and looked up on the local file system; they are
   never shown or written anywhere, which matters as some hold a run token.
2. **`-m` among short flags.** `python -Im skills.mail.scripts.send` and
   `python -Imskills.mail.scripts.send` now read `skills/mail/scripts/send`. In a group of short
   flags, the text after the first `m` is the module, and when the `m` ends the group, the next
   argument is. A flag that takes a value, as in `-Xdev`, may read a stray module; that only adds
   a path to check.
3. **Quotes.** Each piece is also read without its `"` and `'`, and the whole text inside each pair
   of quotes is read too. So `NODE_OPTIONS=--require "skills/mail/scripts/send.js"` and
   `--file="my link"` (a link into a skill's scripts) refuse.

Every start the guard refused before, it still refuses: every path it listed is still listed, and
no example or test is removed. The working-folder guards share the reading and get the same, which
for them also only adds paths.

Inline code (`python -c "runpy.run_path(...)"`) stays out of scope: reading strings can't catch it
reliably, and the fence is the protection there.

## Why

None of the three is a hole an agent controls today: the profile's environment is set by Halonic,
and the trust gate and the fence stay the main controls. But the guard's rule is to refuse every
start that names a skill's script, and these were forms it missed. Now that `env` values are read,
quoted `NODE_OPTIONS` is a realistic form. Reading too much as a path only makes a guard stricter.

## Covers

- format.program-start-paths
- format.skill-scripts-folder
- sandbox-host.start
- sandbox-srt.session
