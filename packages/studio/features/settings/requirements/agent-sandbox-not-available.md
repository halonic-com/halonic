# settings.agent-sandbox-not-available

- Status: active
- Since: unreleased
- Source: HAL-4291 (checklist 3.4); HAL-11627 (the same words as a failed host check); microcopy 23.3 "Settings › Agent sandbox, not available" (replaces 13.1's first sentence and its second line), 23.3a; `runs.sandbox-cant-run`. The words are placeholders until HAL-1784 is approved: reviewers check the keys.

While Settings › Agent sandbox reads **Not available** and the workspace provides `sandboxStartCheckKey`, the section shall check the sandbox once. While that check refuses, the words after the chip shall be, in this order: the reason from `sandboxStartWords`; the fix for Settings (`settingsFix`), which is none for the reasons whose fix is to set the sandbox up in Settings, since the person is there already; **Check again** and a link to the docs section for the reason, named by the catalogue's `docsName`; then "You can run an agent on this computer after a warning." Before the check answers, when it passes and where nothing can check, the section shall keep 13.1's one line. **Check again** shall ask the check now and say the result ("Sandbox checked: ready.", or the can't-run Callout's own words for "not ready" and the reason, or for a check that couldn't run). It never changes a system setting.

## Examples

- Given the section reads Not available and the check says `bubblewrap-missing`,
  then it reads "bubblewrap isn't installed, and the sandbox needs it.", then "Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap.", then Check again and "How to install bubblewrap", then "You can run an agent on this computer after a warning."
- Given the check says `setup-needed`, then there is no fix line.
- Given no check, then the section reads "The sandbox isn't available on this computer, so agents can't run in it. You can run an agent on this computer after a warning."
