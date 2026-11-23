# shell.shown-title

- Status: active
- Since: unreleased
- Source: HAL-16934 (T14 PR 6c); flow-assistant 2.2 (HAL-647); UX checklist T14 1.2 (HAL-1361)

The window shall give every feature's context on the desktop a read-only `shownTitle`: the name of the page the active window tab shows, as that tab's label names it. It shall let a feature subscribe, and shall tell a listener only when the name changes: a tab switch, Back or Forward, or a rename. On a phone, which has no tabs, `shownTitle` is absent.

## Examples

- Given tabs on Home and on the place Changes, Home active,
  when the user switches to the Changes tab,
  then `shownTitle.get()` is "Changes" and a listener ran once.
- Given the run's tab is active and named by its id,
  when its kind names it "Support triage",
  then `shownTitle.get()` is "Support triage" and a listener ran.
- Given two tabs on Home,
  when the user switches between them,
  then no listener runs.
