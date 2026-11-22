# settings.agent-sandbox-not-available

- Status: active
- Since: unreleased
- Source: HAL-4291 (checklist 3.4); HAL-11627 (the same words as a failed host check); microcopy 23.3 "Settings › Agent sandbox, not available" (replaces 13.1's first sentence and its second line), 23.3a; `runs.sandbox-cant-run`; HAL-16379 (design check C701 row 1, the same look for both checks); HAL-16474 (design check C711 rows 1 and 2: the same words after Check again, and served Studio's words). The words are placeholders until HAL-1784 is approved: reviewers check the keys.

While Settings › Agent sandbox reads **Not available** and the workspace provides `sandboxStartCheckKey`, the section shall check the sandbox once. While that check refuses, the words after the chip shall be, in this order: the reason from `sandboxStartWords`; the fix for Settings (`settingsFix`), which is none for the reasons whose fix is to set the sandbox up in Settings, since the person is there already; **Check again** and a link to the docs section for the reason, named by the catalogue's `docsName`; then "You can run an agent on this computer after a warning." In served Studio, used from another device such as a phone, the fix shall be the one for doing it on the computer (`phoneFix`) and the last line "On the computer Halonic runs on, you can run an agent after a warning." The reason and the fix shall each be a line of their own, **Check again** shall be the section's own ghost button with the refresh icon, as in Ready and Needs repair, on one row with the link, and the last line shall be muted. A reason the host's check found (`settings.agent-sandbox-state`) shall look exactly the same, so one state reads and looks the same whichever check reported it. Before the check answers, when it passes and where nothing can check, the section shall keep 13.1's one line. **Check again** shall ask the check now and say the result ("Sandbox checked: ready.", or the can't-run Callout's own words for "not ready" and the reason, or for a check that couldn't run), and **Check again** on a reason the host's check found shall say the same "not ready" words, so one state is also heard the same whichever check reported it. It never changes a system setting.

## Examples

- Given the section reads Not available and the check says `bubblewrap-missing`,
  then it reads "bubblewrap isn't installed, and the sandbox needs it.", then "Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap.", then Check again and "How to install bubblewrap", then "You can run an agent on this computer after a warning."
- Given the check says `setup-needed`, then there is no fix line.
- Given the check says `distro-missing`, and given instead the host's check says `distro-missing`,
  then both show the same lines, the same Check again beside the same link, and the same muted last line (HAL-16379).
- Given no check, then the section reads "The sandbox isn't available on this computer, so agents can't run in it. You can run an agent on this computer after a warning."
- Given the host's check says `distro-missing`,
  when the person presses Check again and the check says `distro-missing` again,
  then the live region says "Sandbox checked: not ready. WSL works, but Halonic's own Linux system for the sandbox isn't installed.", as it does for the start check (HAL-16474).
- Given served Studio and the check says `distro-missing`,
  then the fix reads "On the computer Halonic runs on: use Halonic inside WSL 2." and the last line "On the computer Halonic runs on, you can run an agent after a warning." (HAL-16474).
