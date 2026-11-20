# Decision: a Settings section that stops on the desktop says so

- Approval: the a11y check C275 on HAL-13936 (SE1), and the team's wording decision on HAL-13974 (a detail of the approved Settings states, under HAL-2282); Liam approves this note in review on HAL-13974
- Kind: user-visible
- Task: HAL-13974

## What changes

`shell.page-stopped` gains one sentence and one example: in the desktop app, a Settings section
whose view fails to load or draw shows the page's stopped state in that section only, titled
"Couldn't load these settings" one heading level below the section's name (`h4` under the
dialog's `h3`, `h2` under the phone's `h1`), with the reason "Halonic ran into a problem showing
the _section_ settings. Nothing in your workspace changed.", **Reload page** and **Copy details**.
Until now such a section showed its name and nothing else, with no reason and no way to try again.

The served Studio and the phone keep what `shell.page-unreachable` says: "Couldn't load these
settings" with **Try again** when the computer can't be reached, and nothing for another failure.

Nothing is removed from the requirement, and no test or expectation is weakened.

## Covers

- shell.page-stopped
