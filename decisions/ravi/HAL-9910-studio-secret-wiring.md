# Decision: the Google page can save and replace a client secret through the agent host

- Approval: the plan for this change is approved on HAL-10655, and the review of this change is a child task of HAL-9910; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Qqbwky6s9nYmR9uehmlLBTlvtvQ+Ygi6gsq44I7UBycfgHYKaO9IEHRlV/60sOHyYrHPp5Cam2tJ9mfcr7PrAQ==
- Task: HAL-9910

## What changes

The requirement `studio.workspace-google-setup-accounts` used to say the desktop app refuses the client
secret with a plain message. It now says that when the app has an agent host, saving or replacing the
client secret sends it once, in its own request, to the host, and tells the listeners afterwards. An
accepted replace lists the addresses of every account that uses the new secret, this one included. A check that couldn't finish rejects in plain
words that the old secret is still in use. Without an agent host both are refused like the other changes.
The checks (Check again, wrong account, new address) stay refused, and the page still never writes a record.

## Why

The secret field and its buttons on the Google page, which Liam approved on HAL-9378, did nothing in the
desktop app. The agent host already stores the secret, so the page only has to send it (slice 1 of HAL-9910).
One wording a person reads is new: when the check of a new secret couldn't finish, the page says
"Halonic couldn't finish checking the new client secret with Google. The old one is still in use."
The team decides this small wording, as it builds on the approved secret field; Liam approved the
text in review of this change.

## Covers

- studio.workspace-google-setup-accounts
