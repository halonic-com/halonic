# agents.configuration.sandbox-fields

- Status: draft
- Since: unreleased
- Source: HAL-18931 (T6 gap 6); flow-agents 5.3; UX checklist 2.6 and 2.9; the agent file's `workingFolder` and `allowedSites`

The agents feature's Harness page shall show, under Where it runs, the agent's **Working folder** as its file says, or `files/agents/<id>` when the file names none, with **Change…**, and its **Allowed sites** as a chip list with **Add site**. **Change…** shall open a box with the folder in it; Enter or leaving the box shall save the typed folder and put the text and **Change…** back, with focus on **Change…**, and Esc shall close it without saving. A folder the host refused shall stay in the box. Adding or removing a site shall save the whole list at once, and the list shall go back to the saved one when the save fails. The reason a save failed shall show as for any other field of the page. While the list is empty, the agent's harness is a program rather than Halonic's own loop, and where it runs reads as the sandbox or a choice on hold, the page shall say "None. The agent's program can't reach any site." under **Allowed sites**, and **Add site** shall be described by that line. It shall not say it while the agent runs on this computer, while where it runs is loading, failed or unknown, or for Halonic's own loop.

## Examples

- Given Sorter's file names the working folder `files/work/sorter` and the site `registry.npmjs.org`, then the Harness page shows both, with **Change…** and a chip "registry.npmjs.org" whose ✕ is named "Remove registry.npmjs.org".
- Given Sorter's file names no working folder, then the page shows `files/agents/sorter`.
- Given the person chooses **Change…**, types `files/out` and presses Enter, then Sorter's working folder is saved as `files/out`, the page shows it and focus is on **Change…**.
- Given the person presses Esc in the box, then nothing is saved and the old folder shows.
- Given the person adds `api.example.com` with **Add site** and removes `registry.npmjs.org`, then the saved allowed sites are `api.example.com` alone.
- Given the host refuses the site `localhost` with "Enter a site like registry.npmjs.org.", then the chip list shows `registry.npmjs.org` alone again and the page says "Couldn't save: Enter a site like registry.npmjs.org."
- Given Sorter runs Claude Code in its sandbox and its file names no site, then the page says "None. The agent's program can't reach any site." under **Allowed sites**, and the line goes once the person adds `api.example.com`.
- Given the person confirmed **On this computer** for Sorter, or Sorter's harness is Halonic, then the page doesn't say it, even with no site.
