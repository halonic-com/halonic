# settings.ai-agent-key-line

- Status: active
- Since: 0.1.0
- Source: HAL-8123 (T11 PR 8); req-settings `settings.ai-agent.local-only-warning`, `workspace.settings.session-ai`; flow-settings 7 and 13 (HAL-646); HAL-119 (keys are entered in one place only)

The Settings feature shall show, under Model once a provider is set, a Key line that says whether a key is stored under the Assistant's secret name, and shall never offer a field for the key. With no secret name it shall read "No key needed." With a key stored: "● Key set · Replace it on the provider page ›". With none stored: "○ No key · Add it on the provider page ›" when a provider of the open workspace uses the secret name, else "○ No key. Add a provider that uses the secret name to *Workspace* ›"; with no workspace open: "○ No key. Open a workspace to add it." A link shall close Settings and then open the provider page, or start Add provider with the type and the secret name filled in. Served, the line shall read "Set on the computer running Halonic" or "No key on the computer running Halonic", without a link. While the workspace answers, a skeleton bar shall stand in the line; if it can't answer, the line shall read "Couldn't check for a key."

The section shall show a warning Callout, "*Workspace* is local only, so it can't use this cloud model.", first under the first line, while the open workspace is local only and Local is off, and a line "*Workspace* sets its own assistant model (*model*)." with a link "Workspace settings ›" to the workspace page's Session AI (no link when served), while the open workspace sets one. Without an `AssistantWorkspaceService` none of these show and the Key line says to open a workspace.

## Examples

- Given Anthropic with the secret name `anthropic-api-key` and a key stored,
  when the section opens,
  then the Key line reads "● Key set · Replace it on the provider page ›".
- Given the open workspace Acme is local only and Local is off,
  when the section opens,
  then the warning "Acme is local only, so it can't use this cloud model." shows, and it goes when Local is switched on.
- Given Acme sets the model smart,
  when the person presses Workspace settings ›,
  then Settings closes and Acme's page opens at Session AI.
