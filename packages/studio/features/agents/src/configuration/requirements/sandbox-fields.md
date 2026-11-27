# agents.configuration.sandbox-fields

- Status: draft
- Since: unreleased
- Source: HAL-18931 (T6 gap 6); flow-agents 5.3; UX checklist 2.6 and 2.9; the agent file's `workingFolder` and `allowedSites`

The agents feature's Harness page shall show, under Where it runs, the agent's **Working folder** as its file says, or `files/agents/<id>` when the file names none, with **Change…**, and its **Allowed sites** as a chip list with **Add site**. **Change…** shall open a box with the folder in it; Enter or leaving the box shall save the typed folder and put the text and **Change…** back, with focus on **Change…**, and Esc shall close it without saving. A folder the host refused shall stay in the box. Adding or removing a site shall save the whole list at once, and the list shall go back to the saved one when the save fails. The reason a save failed shall show as for any other field of the page.

## Examples

- Given Sorter's file names the working folder `hubs/acme/work/sorter` and the site `registry.npmjs.org`, then the Harness page shows both, with **Change…** and a chip "registry.npmjs.org" whose ✕ is named "Remove registry.npmjs.org".
- Given Sorter's file names no working folder, then the page shows `files/agents/sorter`.
- Given the person chooses **Change…**, types `hubs/acme/out` and presses Enter, then Sorter's working folder is saved as `hubs/acme/out`, the page shows it and focus is on **Change…**.
- Given the person presses Esc in the box, then nothing is saved and the old folder shows.
- Given the person adds `api.example.com` with **Add site** and removes `registry.npmjs.org`, then the saved allowed sites are `api.example.com` alone.
- Given the host refuses the site `localhost` with "Enter a site like registry.npmjs.org.", then the chip list shows `registry.npmjs.org` alone again and the page says "Couldn't save: Enter a site like registry.npmjs.org."
