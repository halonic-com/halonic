# plugins.plugin-updates

- Status: active
- Since: unreleased
- Source: HAL-9383 (B27); plugin screens design sections 6 and 7 (HAL-1739); microcopy 24 T5, T6, T10 and T12 (HAL-751); UX check L9 (HAL-12363); HAL-11626 (the reason after the colon reads as `reasonAfterColon`, a common first word in lower case, decided by Liam on the task)

The Studio shall give the status box of a plugin that is on and was added from a git repository the button **Check for updates**, and one added from a folder the button **Update from folder**; the page's ⋮ shall have the same item after Open panel. While it looks, the button shall be busy ("Checking for updates…"). When the source has nothing newer, the button shall turn into "Up to date (*version*)". When it has a newer version, the Studio shall open the trust check "Update *name* to *version*?" with the source line (for a git plugin, the commit change `3f9c2a1 → 8be41d0`), the change rows against what the person trusted and the closed "Unchanged (*n*)" list, with the buttons **Keep** *version*, focused, and **Trust and update**. **Keep** *version* shall close the dialog and leave everything as it was, and the button shall turn into "Up to date (*version*)". **Trust and update** shall put the newer version in place and trust it through the app; when that can't be saved, the dialog shall stay open and say "Couldn't update: *reason*. The plugin stays as it was." When looking fails, the Studio shall say "Couldn't check for updates: *reason*." (or "Couldn't update from folder: *reason*.") in a toast. A plugin that isn't on, or that wasn't added through Add plugin, shall have neither, and neither shall any plugin while the app can't read a plugin's source again, so nothing on the page promises updates that can't come.

## Examples

- Given the Weather plugin is on, version 1.2.0, added from a git repository,
  when its page opens,
  then the status box has **Check for updates**, and so does the ⋮.
- Given the Weather plugin was added from a folder,
  when its page opens,
  then the button says **Update from folder**.
- Given the repository has no newer commit,
  when the person presses **Check for updates**,
  then the button turns into "Up to date (1.2.0)".
- Given the repository has version 1.3.0 at commit `8be41d0`, and Weather is at `3f9c2a1`,
  when the person presses **Check for updates**,
  then the dialog "Update Weather to 1.3.0?" opens, its source line ends "3f9c2a1 → 8be41d0", and **Keep 1.2.0** has the focus.
- Given the same,
  when the person presses **Keep 1.2.0**,
  then nothing is updated, and the button turns into "Up to date (1.2.0)".
- Given the same,
  when the person presses **Trust and update**,
  then the app updates and trusts the plugin, and the dialog closes.
- Given the update can't be saved because the disk is full,
  then the dialog stays open and says "Couldn't update: the disk is full. The plugin stays as it was."
- Given the source can't be reached,
  when the person presses **Check for updates**,
  then a toast says "Couldn't check for updates: *reason*." and the button is back.
- Given the Weather plugin isn't trusted yet,
  then its page has no **Check for updates**.
- Given an app that can't read a plugin's source again yet (the desktop app until HAL-9373),
  then the page of the Weather plugin, on and from git, has no **Check for updates**, in the status box or the ⋮.
