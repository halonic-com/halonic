# Decision: the Google stand-in can save and replace a client secret through the agent host

- Approval: the plan for this change is approved on HAL-10655, and the review of this change is HAL-10658; Liam approves this note in review
- Kind: internal
- Task: HAL-9910

## What changes

The requirement `agent-host-client.google` gains two calls, `saveClientSecret` and `replaceClientSecret`.
Each sends the account's ref and the secret to the host's `POST /v1/google/secret` or
`POST /v1/google/secret/replace`, and nothing else. The secret is read once, only while the request is
built, and is never kept or put in an error. `replaceClientSecret` answers the host's outcome as its own
word and fails with `answer_invalid` for a word it doesn't know. The rest of the requirement is unchanged:
the page still never sends or reads a token.

## Why

The agent host owns the Google setup record and the staged secret, so saving and replacing the secret go
through it like the other Google writes (HAL-9910 slice 1). Passing every outcome on as its own word keeps
the page from showing a refused or unfinished check as a success. Liam set these conditions on HAL-10655.

## Covers

- agent-host-client.google
