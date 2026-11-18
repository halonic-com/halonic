# Decision: the Inbox says when it couldn't load the workflows or the sandbox's runs

- Approval: Liam decided this on HAL-11643, from the states audit on HAL-11635 (gap 5) and the board-approved microcopy 1.1; it applies approved words to existing screens, a team decision with no board card (HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:veohBkYWYqHCmT1dXYYV+XcOSdYXMlY9s+grjaS9wKxKk3PLUNWkcnC3RAOG9WGsgiV/1uTvwFPOsdFjFDcyAg==
- Task: HAL-11643

## What changes

The states audit found two Inbox reads that fail with no words:

- When the workflows you can start can't be read, the request form and **New request** vanished,
  as for a workspace with none. The Inbox now says "Couldn't load the workflows you can start."
  with **Try again** where the form would be (on a phone, where the New request row would be).
  One example is added.
- When the sandbox card's runs can't be read, "Didn't run because of this" stayed empty. The card
  now says "Couldn't load the runs that didn't run." with **Try again** in their place. The
  sentence is the request form's shape; Sofia confirms the words with Noah, and a change to them
  is a follow-up.

No example is removed and no test is weakened.

## Covers

- inbox.request
- inbox.sandbox-row
