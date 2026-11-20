# Decision: a page that can't open takes focus on its state's title

- Approval: the a11y check C238 on HAL-13787 (PU1, PU2), which asks for these examples, and the team's wording decision on HAL-13800 (PU3, Sofia, under HAL-2282); Liam approves this note in review on HAL-13800
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:sR+kudcRL9hjyfe9gvUkswAWDKP+1qegOkI1siJaj6YOtQqLXhYK7ZLDzIz9LKuFEsWXglqVf5AYkQpzcsndCA==
- Task: HAL-13800

## What changes

`shell.page-unreachable` and `shell.page-stopped` each gain one sentence and one example: when
"Couldn't load this page" or "This page stopped working" shows as the user opens the page, where
the shell would move focus to the page's `h1`, focus goes to the state's title instead. Focus the
user put somewhere else, such as in the sidebar, still stays where it is. Until now a
screen-reader user who opened a page that couldn't load heard nothing, and focus stayed on the
link (WCAG 2.4.3, 4.1.3).

`shell.page-unreachable` also gains the Settings section's own title, "Couldn't load these
settings", one heading level below the section's name (`h4` under the dialog's `h3`, `h2` under
the phone's `h1`), and an example for it (WCAG 1.3.1). Pages and item pages keep "Couldn't load
this page".

Nothing is removed from either requirement, and no test or expectation is weakened.

## Covers

- shell.page-unreachable
- shell.page-stopped
