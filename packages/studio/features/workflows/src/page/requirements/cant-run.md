# workflows.page.cant-run

- Status: active
- Since: unreleased
- Source: HAL-19614; HAL-4291 (checklist 3.1, 3.2, 3.9; the open start card from the CTO's review); microcopy 23.3 "Can't run, workflow" and "Phone"; `runs.sandbox-cant-run`.

When a step of the workflow runs an agent in a program of its own (Claude Code or Codex, `studio.workspace-workflow-read`) and the sandbox check refuses, the workflow page shall show the can't-run Callout of `runs.sandbox-cant-run` as a band under its header, on the Flow, Configuration and Runs tabs alike, and **Run** shall stay focusable but unavailable, described by the Callout's first line. The Callout's last line shall name the first such step and its program, "The step *Draft* uses *Claude Code*.", or "The step *Draft* and *2* other steps use a program." when there are more, then "To run *Writer* without the sandbox, change it in **Writer's settings ›**", which opens that agent's page. While the check hasn't answered, **Run** shall be unavailable the same way, described by "Agent host is still starting" (`runs.sandbox-cant-run`). When the start card is already open as the check refuses, for a workflow that gained a step with a program while it was open, its **Start run** shall be unavailable the same way, described by the same first line, and the card shall keep its input. When **Check again** finds the sandbox ready, focus shall move to **Run**. When the files also say Studio can't start the run (`workflows.start.start-run`), the page shall show both, and **Run** shall be described by both first lines, the Callout's first.

On a phone, **Run** shall be unavailable the same way, and the last line shall say "To change where *Writer* runs, use your computer." with no link.

A workflow none of whose steps starts a program shall not be checked, show no Callout and run as before. Nothing on the page shall run the workflow without the sandbox.

## Examples

- Given *Support reply* whose step *Draft* runs *Writer* in Claude Code, and a check that says `bubblewrap-missing`,
  then Run is unavailable and described by "Support reply can't run: the sandbox can't start on this computer.", and the Callout ends "The step Draft uses Claude Code. To run Writer without the sandbox, change it in Writer's settings ›".
- Given the same workflow and a check that hasn't answered yet, then Run is unavailable and described by "Agent host is still starting"; when the check passes, Run works.
- Given a workflow with no program step whose start card is open, when its file gains the step *Draft* in Claude Code and the check then says `bubblewrap-missing`,
  then the card stays open with its input, and its Start run is unavailable and described by "Agent host is still starting" while the check runs, then by the same first line.
- Given the same workflow on a phone, then Run is unavailable the same way, and the Callout ends "To change where Writer runs, use your computer."
- Given the same workflow whose *Writer* also uses a connector Studio can't start yet, then the Callout and the line "Writer uses a connector, which Studio can't start yet." both show, and Run is described by both.
- Given a workflow whose agents all run in Halonic's own loop, then there is no Callout and Run works.
