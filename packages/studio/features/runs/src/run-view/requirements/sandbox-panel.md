# runs.run-view.sandbox-panel

- Status: active
- Since: unreleased
- Source: HAL-1707 (board, HAL-1601 proposal 1); sandbox-screens (HAL-1747) 1; microcopy 23.1; ux-checklists-sandbox (HAL-1833) Part 1; Julian's conditions (HAL-1673); `events.sandbox-opened`, `events.sandbox-off`

The run view shall show what each sandboxed step could do, read only from the step's `sandbox.opened` event, never from the agent's current settings:

- under the step's meta line, one line, in this order and only the parts that apply: "In a sandbox · writes only in its working folder · reaches only Halonic", with "reaches Halonic and 2 sites" ("1 site" for one) when the step may reach sites, "In a virtual machine" for a `vm` sandbox, and the link "What it can do" at the end. The line is a child row with a shield icon that opens the step's entry, named "What *Draft* can do" for a screen reader;
- a step that ran without the sandbox, from a `sandbox.off` event, says "Ran on this computer, without the sandbox" in warning tone, and its entry shows the Full access chip;
- a step whose `sandbox.opened` can't be read shows "Couldn't read what this step could do." and nothing else of it; the rest of the page works;
- a step with no `sandbox.opened` or `sandbox.off`, an old run or a step with no program, shows no line;
- in the step's open entry, after its other details, a list inside a panel, headed "What this step can do" while the run is live and "What this step could do" once it has ended, with rows in this order, a row with nothing in it left out:
  - **Writes in**: the working folder, home shown as `~/…`, then "and its own temporary folder", which names no path;
  - **Reads only**: the first 3 paths, then "and 2 more", which shows the rest in the same row;
  - **Can't open**: the names of the groups, never their paths, then "You added: …" with the paths the person added;
  - **Reaches**: Halonic, then up to 10 allowed sites as plain text with the registrable domain in bold, then "and 3 more";
  - **Time limit**: "Stops after 30 minutes", in minutes under an hour, otherwise "2 hours" or "1 hour 30 minutes";
- under the rows, the kind of sandbox ("A process sandbox on this computer, not a virtual machine.") and the line on what isn't covered, which always shows and names the working folder;
- on a phone the entry fills the screen, rows have their label above the value, "your computer" replaces "this computer", and the action is the line "Change this on your computer: *Writer* › Harness", with no link. On the desktop the action "Change in *Writer*'s settings" shows only where the page can open the agent.

No path from a denied group and no value of the step's environment shall appear on the page: the event never holds them (Julian, HAL-1673). Every value from the log is escaped for hidden and direction-changing characters. Every sentence comes from the sandbox words table by key; the words are placeholders until the board approves the sandbox screens (HAL-1784).

Not in this requirement: **Your sign-in** (waits for HAL-1710), the workflow's run card, and the agent page the action opens.

## Examples

- Given a step Draft whose `sandbox.opened` has a working folder `~/work/acme` and allowed sites `registry.npmjs.org` and `github.com`,
  when the person opens the run,
  then Draft has the line "In a sandbox · writes only in its working folder · reaches Halonic and 2 sites · What it can do".
- Given a step whose sandbox denied the groups `ssh-keys` and `browser-data` and the path `~/finance`,
  when its entry is open,
  then Can't open reads "Your SSH keys · Browser data" and "You added: ~/finance", and no path of either group is on the page.
- Given a step whose time limit is 5 400 000 ms,
  then Time limit reads "Stops after 1 hour 30 minutes".
- Given a finished run whose agent's allowed sites have changed since,
  when the person opens the run after restarting Halonic,
  then the list shows the sites the step could reach then.
- Given a run from before the log recorded `sandbox.opened`,
  then no step has a line.
