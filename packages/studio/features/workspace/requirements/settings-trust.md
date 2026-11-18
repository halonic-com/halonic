# workspace.settings-trust

- Status: active
- Since: unreleased
- Source: HAL-11795 (usability walk-through HAL-11771); replaces `settings.workspace-links`; flow-settings 1.2; HAL-12859

The Workspace feature shall add the workspace section Trust (`trust`) to Settings. It shall say where the workspace stands in the words of the workspace page's Trust section (`workspace.trust-section`): "Not trusted yet. …", "Trusted on *3 Nov 2026*", "Changed since you trusted it on *3 Nov*." and the like, and it shall follow the state as it changes. Under it shall be one button, **Open Trust**. A press shall close Settings and then run the command `workspace.open-trust` through the window's `runCommand`, so the page opens as Ctrl K opens it. Without a window's `runCommand`, a press shall only close Settings. Without a folder to trust, the section shall show only the button. A workspace that holds nothing to trust (HAL-10131) shall say "Nothing to trust here." and shall not offer **Open Trust**, because the page shows that same line and no **Review** (HAL-12859). The section shall not carry the line "Part of *Acme*.", because trust is kept by the app and not in the workspace (`shell.settings-workspace-line`). In the phone's settings list, Trust's row shall carry one line in the words of the header badge: "Trusted", "Not trusted yet", "Changed since you trusted it", "Couldn't load workspace settings", or "Nothing to trust here"; it shall wait for the first answer, and have none without a folder to trust.

## Examples

- Given a workspace that isn't trusted yet,
  when the user opens Settings › Trust,
  then it says "Not trusted yet. …", offers **Open Trust** and has no line about Changes.
- Given a window that gives no `runCommand`,
  when the user presses **Open Trust**,
  then Settings closes and nothing else happens.
- Given a workspace that holds nothing to trust,
  when the user opens Settings › Trust,
  then it says "Nothing to trust here." and offers no **Open Trust**, and its row in the phone's settings list says "Nothing to trust here".
