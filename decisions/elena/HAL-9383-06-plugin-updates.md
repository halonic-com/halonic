# Decision: the plugin updates flow

- Approval: the words are the board-approved microcopy T5, T6, T10 and T12 (HAL-1801) and the design's section 6 (HAL-1739); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-9383

## What changes

New requirement `plugins.plugin-updates`. A plugin that is on and was added through Add plugin gets **Check for updates** (git) or **Update from folder** (folder) in its status box and its ⋮. The result is "Up to date (*version*)" or the trust check "Update *name* to *version*?" with **Keep** *version* (focused) and **Trust and update**. `PluginActions` gains `checkForUpdate` and `applyUpdate`; the app wires them with HAL-9373 (the check reads the source again without touching the installed copy; the apply replaces and trusts as one step). Nothing was removed or weakened.

Team call, wording not in the spec: when **Trust and update** can't be saved the dialog says "Couldn't update: *reason*. The plugin stays as it was.", in the shape of the trust check's own failure line. The plugins list's row ⋮ also lists **Check for updates** in the design; that follows as its own pull request.

## Why

"A plugin called *id* is already installed. Update it from its page." pointed at an action the page did not have.

## Covers

- plugins.plugin-updates
