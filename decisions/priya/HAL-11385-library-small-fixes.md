# Decision: settled words for the held note, How it connects and the approval line

- Task: HAL-11385
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-751#document-microcopy (revision 105, checked by Maya on HAL-11393; small wording fixes on approved screens from the HAL-11370 design check are a team decision, HAL-2282 rule; Liam reviewed the PR on HAL-11448 and HAL-11450)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4lNbs96qLWHSo4uQXIhM61yvdaHliG+sjhV9bkCmidDeiW2YBa/XJDu3ChuabfWOvGDn+lHMijOR81DvR6CyAA==

## What changes

- `inbox.secret-hold`: with no Google account waiting, a held Google client secret reads "…Add the secret to a connector in the Library instead." (on a phone "…in the Library on your computer instead.") and the button is **Open New connector**. With an account waiting, the line and **Go to the secret field** stay as before.
- `library.connection-summary`: the HTTP transport reads "MCP server over HTTP", the New connector dialog's own string. A plugin's row is **Name** with its display name, or **ID** with its id when it has no name.
- `library.status-section`: the "Waiting for approval" group stays, and each line reads *"search" stays off until you approve it.*, without the connector's name, which is the page's title.

## Why

The design check (HAL-11370, item L2) found these lines didn't match the screens and microcopy; the settled words are microcopy 10.2 and 11.4, revision 105.

## Covers

- inbox.secret-hold
- library.connection-summary
- library.status-section
