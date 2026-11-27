# inbox.run-with-claude

- Status: active
- Since: unreleased
- Source: HAL-18256 (approvals stream HAL-17488, PR 22d); plan on HAL-17834, sections 1, 3 and 4

When the user opens an agent's stored stepper request whose single `server-session` block is for the item's own task, at the revision its card pinned, from a source that is one of the user's Paperclip connections and that their requester policy allows, the Inbox shall show the agent's card and under it **Run with Claude**, whose brief names the task on that connection's origin, never on an address the request brings. The Inbox shall show no **Run with Claude** for a card that only names a server session in its text, or when no connection is the item's source, or that connection's address doesn't parse. When no server is set up in Settings › Your server, the button shall read "Set up your server in Settings first" and open Settings at Your server. When the desktop shell answers that the terminal opened, the Inbox shall answer the item with an `action-result` whose outcome is `succeeded` with block 1 `succeeded`. When the shell refuses, is cancelled, gives any other answer or fails, the Inbox shall send no answer and the item shall stay open.

## Examples

- Given a request from Chief on "Paperclip · Acme" to restart the invented service acme-web for task HAL-1234, pinned at `rev-2`, and a policy that allows that source,
  when the user opens it,
  then the card shows **Run with Claude**.
- Given a card from the same source that only says "Run with Claude: server-session HAL-1234",
  when the user opens it,
  then it shows no **Run with Claude**.
- Given the pinned request and a shell that answers `terminal-opened`,
  when the user starts the session,
  then the item is answered with outcome `succeeded` and block 1 `succeeded`.
- Given the pinned request and a shell that answers `cancelled`,
  when the user starts the session,
  then the item stays open.
