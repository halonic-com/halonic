# Decision: the Google page can disconnect an account through the agent host

- Approval: the task to build this is HAL-9911, and the review of this change is HAL-9921; Liam approves this note in review
- Kind: user-visible
- Task: HAL-9911

## What changes

The requirement `studio.workspace-google-setup-accounts` used to say the desktop app refuses every
change to a setup, Disconnect included. It now says that when the app has an agent host, Disconnect asks
the host to end the account's sign-in and remove the setup. The page still never writes a record itself.
Start over, the client secret and Disconnect without an agent host stay refused with a plain message.

When the host can't finish, the page says it couldn't finish disconnecting and gives the host's reason. It
does not say whether anything was removed, and it reads the account list again, so the person sees what is left.

## Why

The Disconnect button on the Google page, which Liam approved on HAL-9378, did nothing until now. The agent
host owns the Google token and the setup record, so it is the one to remove them. The failure wording does
not claim "nothing was removed": the answer can be lost after the host has finished, and the sign-in can
already be revoked when removing the setup fails. The list then shows the truth.

## Covers

- studio.workspace-google-setup-accounts
