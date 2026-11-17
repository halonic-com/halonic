# Decision: the plugin trust check can list the plugin's backend files

- Approval: the task to build this is HAL-7956, assigned by Liam from HAL-11564; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TcQnnwW1nbvtxHXWskWn4L9dxzyAM0fH+jC8w3k4moI/W1CeaBYotoYZ2yCWUnLzpiYnAd/XJ75Ba29/Xe9NDw==
- Task: HAL-7956

## What changes

The requirement `app.plugin-trust-sections` used to give only the sections of a plugin's trust check. It now also
gives the files of the plugin's folder that the fingerprint covers: the first ten by path, and the number of files
after them, so a host can say "and N more". `plugin.yaml` is not listed, because the sections already show it.

## Why

The check showed tools, programs, secrets, addresses and the fingerprint, but not which files the fingerprint
covers. A person who trusts a plugin should see what code they trust. The list lives in the shared model so the
CLI and Studio stay the same (P8). The cap keeps a large plugin from filling the screen. The sentence "runs with
your permissions" is left out on purpose (HAL-3384).

## Covers

- app.plugin-trust-sections
