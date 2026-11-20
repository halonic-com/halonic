# plugins.plugin-trust-yes

- Status: active
- Since: unreleased
- Source: HAL-3384; the "Runs" line design sections 2 and 7 and build condition (a) (HAL-1873); Julian's notes on HAL-13786; UY1 and UY2 on HAL-14003; extends plugins.plugin-trust-runs-line

When a plugin's trust check opens from **Review**, after Add or for an update, and the app gives the host's sandbox status, the Studio shall read the status from the host and show "Checking the sandbox on this computer…" until it answers. It shall then show the "Runs" line for that answer: in the sandbox, not in the sandbox for its reason, or not in the sandbox with the yes saved on its day. When the host can't answer, names a reason the Studio has no words for, or gives a yes with no readable day, and when the app gives no status, the trust check shall keep its plain last line. When the person ticks the box and presses **Trust**, the Studio shall ask the host to save the yes for the reason shown, and trust the plugin only once the host saved it. When the host answers that the reason changed, the Studio shall trust nothing, read the status again and show the reason that holds now, with the box not ticked; it shall then move focus to the box and read the new reason's sentence once in the dialog's polite live region. When the yes can't be saved, the dialog shall stay open, trust nothing and say why; when the host answers that it couldn't save the yes (`allow_failed`), the reason shall be "Halonic couldn't save your yes to run plugins without the sandbox". Once the yes for the reason shown is saved, the Studio shall not ask the host to save it again, since a new yes stops the plugins already running under the old one.

## Examples

- Given the host still reading the status,
  then the trust check says "Checking the sandbox on this computer…" and **Trust** is unavailable.
- Given the host answers `needs-yes` for `windows` and the person ticks the box,
  when they press **Trust**,
  then the host saves the yes for `windows` first, and then the plugin is trusted.
- Given the host answers `allowed` for `windows` on 9 Nov,
  when the person presses **Trust**,
  then the check said "You allowed … on 9 Nov, for this reason." and no yes is sent again.
- Given the reason changed from `windows` to `container` after the check opened,
  when the person presses **Trust** with the box ticked,
  then nothing is trusted, and the check shows the container's reason with the box not ticked,
  focus is on the box, and the container's reason is read once.
- Given the host answers `allow_failed`,
  when the person presses **Trust** with the box ticked,
  then the dialog says "Couldn't save trust: Halonic couldn't save your yes to run plugins without the sandbox. Nothing was started."
- Given the yes was saved but trust couldn't be,
  when the person presses **Trust** again,
  then no second yes is sent.
- Given the host can't answer,
  then the last line is "Plugin code runs apart from Studio. Halonic doesn't check what the plugin does with what it's given."
