# Decision: the host owns part of the working-folder list

- Approval: Paperclip task HAL-8676; Liam approves this note in review on HAL-8679
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Bf2eSjWPbsGorSIes6Dc/40vHxFTR50G7yYyB6hxuBwlR1Ys8xssE7dD0Jz21L9kzlTfGG3agZ1Y8t/iWEjgDg==

The connector routes (HAL-2310) took the agents' working folders only from the caller. The list is no longer only the caller's:

- Each folder must be inside the workspace; otherwise the host answers 403 `working_folder_outside_workspace`.
- The host always adds `files/agents`, the parent of every default agent folder, so an empty list never leaves the defaults unchecked.
- A workspace with no harness agents is not refused; custom folders still come from the caller.

The list only blocks connector starts, so a longer list is only stricter.

## Covers

- agent-host.connector-routes
