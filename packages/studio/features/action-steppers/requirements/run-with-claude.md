# action-steppers.run-with-claude

- Status: active
- Since: unreleased
- Source: HAL-17844 (plan on HAL-17834, sections 1, 3 and 4; approvals stream HAL-17488, PR 22c)

The stepper shall offer **Run with Claude** only for an open Inbox item whose stored request is at the revision its card pinned, passes `validateStepperRequest`, has a single `server-session` block naming the item's own task, and comes from a source the user's requester policy allows to ask for an `irreversible` request. A label, a block on a newer revision or a block for another task shall offer nothing. When no server is set in Settings, the button shall read "Set up your server in Settings first" and open Settings. When the user presses **Run with Claude**, the stepper shall show the confirm screen: "Run with Claude on <host>", the user and host the session starts on, and the whole brief as plain text under "Written by <requester>, not checked by Halonic", with **Run with Claude** and **Cancel**. When the user confirms, the stepper shall give the desktop shell only the task id, the brief and the request's revision. Where the shell can't open a terminal (Windows, the browser, or none found), the stepper shall show the manual guide with **Copy command** for the ssh command and a Copy button for the brief.

## Examples

- Given an open item from Chief on "Paperclip · Acme" for task `HAL-1234`, pinning a request whose single block is `server-session` for `HAL-1234`, and a server `ops@build.acme.example`,
  when the user opens it and presses **Run with Claude**,
  then the screen says "Run with Claude on build.acme.example" and shows the brief under "Written by Chief, not checked by Halonic".
- Given the same item whose card only carries a `server-session` label, or whose request changed after the card was made,
  when the user opens it,
  then there is no **Run with Claude**.
- Given no server in Settings,
  when the user opens the item,
  then the button reads "Set up your server in Settings first".
- Given a computer where the shell can't open a terminal,
  when the user presses **Run with Claude**,
  then the screen shows "Start it yourself" with **Copy command** for `ssh -- ops@build.acme.example`.
