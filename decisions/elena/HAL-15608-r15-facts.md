# Decision: a stopped plugin's page says nothing ran and the next run tries the sandbox again

- Approval: HAL-15608 (Paperclip task), from flow check C600 #4 on HAL-15594; the words of the approved R15 screen made true to what the host does, decided by the team with Sofia (HAL-15616) under HAL-2282; the reviewer signs this note with the pull request
- Kind: user-visible
- Task: HAL-15608

## What changes

`plugins.plugin-page-stopped`: R15 said "*Plugin* stopped: the sandbox stopped working while it ran." and "Halonic
doesn't start it again without the sandbox.", while the CLI's line for the same stop says nothing ran and the next
run tries the sandbox again. The code agrees with the CLI: the host records the stop when the fence fails as the
runner starts (`agent-host.plugin-run-state`), so nothing of the plugin ran, and the start gate decides every later
start as before, so the next run that uses it tries the sandbox again by itself; **Check again** only drops the note.

R15 now reads "*Plugin* stopped: the sandbox didn't work as it started, so nothing ran." with "Halonic tries it in the
sandbox again the next time a run uses it, never without it." under it. The Callout's place, tone, **Check again**
and its toast are unchanged. The requirement's first example names both sentences. The unreleased changeset
`plugin-page-stopped.md`, the README and two comments get the same facts.

No test was weakened or skipped: the page's tests check the two new sentences where they checked the old ones.

## Covers

- plugins.plugin-page-stopped
