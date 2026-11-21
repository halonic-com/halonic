# Decision: the CLI says a trusted plugin is off on this computer when its backend can't run in the sandbox

- Task: HAL-15080
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15080 (found in check C540 #2 on HAL-15074; R13's words, which the board approved on HAL-1949, said on the command line, so a team decision under the HAL-2282 rule; Sofia confirms the words on the task; Liam's code review signs this note)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:s/U7xO2765682sgXbuG7qYM2ea35boAinKi/xNaYeHfChOvVMmUYN1tvZWkI2OQmXEcj9tiIb9oJsszuP4ppAg==

## What changes

- New `cli.commands.plugin.off-here`: where a plugin's backend wouldn't run in the sandbox (the gate's own `runnerFence` from the platform and the srt check), `trust --plugin`, `plugin add` and `plugin list` say a trusted plugin with a backend is "trusted, but off on this computer until you allow plugins and integrations to run without the sandbox." with a !, then the reason and fix in `runnerUnfencedWords`' words and "Or allow this in the Halonic desktop app. The halonic command runs plugin code only in the sandbox.". Trust is still saved and they still exit 0. `--json` gives `offOnThisComputer` with the reason code; `status` keeps its value, so scripts that read it don't break.
- `cli.commands.trust.plugin`, `cli.commands.plugin.add` and `cli.commands.plugin.list` point to it for that case.
- `cli.commands.plugin.add`: under Folder, the trust check (also `trust --plugin`'s, which is the same) adds "Copied from <source>", written as `plugin list` writes it: `~` for the home folder, a git address without its scheme and `.git`, then `@` and 7 characters of the commit. A plugin with no install record shows no such line. Nothing else in them changes.
- The tests of those three commands now fix the fence to `fenced`, so they say what they said before on any computer. No test is weakened.

## Why

`trust --plugin` and `plugin add` said "✓ Acme orders is on now." and `plugin list` "✓ on" on a computer where the backend never starts: the command holds no yes to run without the sandbox (`cli.no-unfenced-run-yes`, HAL-12639), so its tools never show up, and the CLI user never learned why. Studio's plugin page says off for the same plugin (#4448).

## Decided by the team

- The words are R13's, so the CLI, the plugin page and the Plugins list (#4491) use one state: "off on this computer".
- "Or allow this in the Halonic desktop app" is true only for Studio's runs; the second sentence says the command still won't run it, so nobody expects a yes given in Studio to reach `halonic run`.
- Sofia confirmed the words on HAL-15142: line 3 starts "Or allow this", because line 2 already ends with a fix and this is the other way out, and "this" matches Studio's view-only line.
- The trust check's Folder line named the profile copy while `plugin list` names the source (C540's small item). Sofia picked a "Copied from" line under Folder (HAL-15142): the check is where someone decides, so it shows what runs and where it came from. `plugin list` stays as it is.

## Covers

- cli.commands.plugin.off-here
- cli.commands.trust.plugin
- cli.commands.plugin.add
- cli.commands.plugin.list
