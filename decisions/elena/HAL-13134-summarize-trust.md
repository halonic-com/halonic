# Decision: Knowledge › Summarize calls no model from a workspace that isn't trusted

- Approval: Liam's rule on HAL-1984 and HAL-12011 (starting anything needs trust unless the workspace reaches only the test model), applied to the Studio's engine on HAL-12409 and to Summarize on HAL-13134; Julian reviews the security change, Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-13134

## What changes

`studio.workspace-knowledge`: right before Summarize sends the documents to the local model through the agent host, the desktop app checks the saved workspace by the rule the engine starts by (`studio.untrusted-starts-nothing`): trusted on this computer, or reaching only the test model. Otherwise, or when the check fails, it sends no request and answers `untrusted`. It checks the saved files because the agent host reads the saved provider files; it gets only the folder and the provider's id. When the agent host itself refuses the chat as `workspace_not_trusted` (its own check, HAL-13943, which also sees a provider file saved after the app's check), Summarize answers `untrusted` too (HAL-13950).

`library.knowledge-summarize`: the page shows that answer under the Summary row as "Couldn't summarize Handbook: this workspace isn't trusted yet, so nothing was sent.", with no **Try again**, since trying again can't help until the workspace is trusted. On a phone, which has no header badge, the line gets **Review**, which opens Workspace settings › Trust (`workspace.open-trust`), as TU2 does for the Inbox on #4101 (C296 SU1 on HAL-14044).

No test was weakened. `SummarizeOutcome` gains the kind `untrusted`; the desktop app is its only host.

## Why

Settings › Trust says "Halonic won't start programs or call real models from this workspace." HAL-12409 made the engine keep that promise; Summarize called a local model through the agent host without asking, so an untrusted workspace could still send its documents to a real model.

## Decided by the team

- The line reuses the Studio's existing refusal for an untrusted start ("this workspace isn't trusted yet, so nothing was started"), with "sent" for "started", because Summarize sends a request rather than starting a run. It sits in the page's existing "Couldn't summarize *name*: *reason*." shape.
- No Review action on the line on the desktop: the header badge's Review stays the way in, as for Routines › Run now on HAL-12409.
- On a phone, which has no header badge, the line gets **Review**, opening Workspace settings › Trust, as TU2 on #4101 (C296 SU1, decided by the team on HAL-14044 under HAL-2282: approved words and an approved pattern).

## Covers

- studio.workspace-knowledge
- library.knowledge-summarize
