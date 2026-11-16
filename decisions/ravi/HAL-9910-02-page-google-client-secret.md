# Decision: the Google page can save and replace a client secret through the agent host

- Approval: the plan for this change is approved on HAL-10655, and the review of this change is a child task of HAL-9910; Liam approves this note in review
- Kind: user-visible
- Task: HAL-9910

## What changes

The requirement `studio.workspace-google-setup-accounts` used to say the desktop app refuses the client
secret with a plain message. It now says that when the app has an agent host, saving or replacing the
client secret sends it once, in its own request, to the host, and tells the listeners afterwards. An
accepted replace lists the addresses of the accounts it fixed. A check that couldn't finish rejects in plain
words that the old secret is still in use. Without an agent host both are refused like the other changes.
The checks (Check again, wrong account, new address) stay refused, and the page still never writes a record.

## Why

The secret field and its buttons on the Google page, which Liam approved on HAL-9378, did nothing in the
desktop app. The agent host already stores the secret, so the page only has to send it (slice 1 of HAL-9910).
No wording a person reads is new: the error texts follow the other host changes.

## Covers

- studio.workspace-google-setup-accounts
