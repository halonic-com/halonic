# assistant.chat.looking-at

- Status: active
- Since: unreleased
- Source: HAL-16934 (T14 PR 6c); flow-assistant 2.2 (HAL-647); UX checklist T14 1.2 (HAL-1361)

While the Build chat is not answering and was not stopped by the person, the panel's status line shall say "Looking at: " and the name of the page the window shows, as its active tab names it, and shall follow it when another page shows. In a window that names no page, the status line shall be empty.

## Examples

- Given the active tab shows the workflow "Support triage", when the panel opens,
  then the status line says "Looking at: Support triage".
- Given that panel, when the person switches to the Changes tab,
  then the status line says "Looking at: Changes".
- Given the person sent a message from Home and the status line says "Running · thinking",
  when the answer ends, then the status line says "Looking at: Home" again.
