# Decision: the run page's "without the sandbox" shield is amber, like the Full access chip

- Approval: HAL-15539, comments 347696b5-3b53-46a1-8fde-623fda666cc2 (Liam leaves the tone to the author) and 5c2cd8ca-d542-4aa5-a4c3-af53cf951fc3 (amber); task HAL-15659; Liam approves this note by signing it in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gxyutaKC8eHIwXO79I7bwott2Bxt4L5jOhMApwW7xNef939Wa1fMKP3/3ly9B37qM8xf4DMiMS7MjTjttfdIBQ==

## What changes

`runs.run-view.sandbox-panel`: the line "Ran on this computer, without the sandbox" under a step
now has its shield in the attention tone (amber), where it said "in warning tone". The words, the
icon and everything else in the requirement stay as they were.

## Why

Running without the sandbox asks the person to have a look; it isn't their turn. The kit keeps
the warning tone (violet) for "Needs you, your turn" and the attention tone (amber) for "have a
look". The Full access chip (HAL-15539), the trust check's not-in-sandbox line and Where it runs'
Callouts already use amber, so the run page's line now matches them.

## Covers

- runs.run-view.sandbox-panel
