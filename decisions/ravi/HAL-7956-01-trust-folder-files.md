# Decision: the plugin trust check can list the plugin's backend files

- Approval: the task to build this is HAL-7956, assigned by Liam from HAL-11564; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:EdFN7uhN26npQYo0g3+O81hRjPiHPw+ejgKV7K96MNdUJd3AK9xYpLVEE+AcKmKpTMyqyqC+jaybCehsOXeKBQ==
- Task: HAL-7956

## What changes

The requirement `app.plugin-trust-sections` used to give only the sections of a plugin's trust check. It now also
gives the files of the plugin's folder that the fingerprint covers: all of them when there are at most eleven,
otherwise the first ten by path and "and N more", never "and 1 more". They sit under the headings "Folder" and
"Backend files". `plugin.yaml` is not listed, because the sections already show it.

## Why

The check showed tools, programs, secrets, addresses and the fingerprint, but not which files the fingerprint
covers. A person who trusts a plugin should see what code they trust. The list lives in the shared model so the
CLI and Studio stay the same (P8). The cap keeps a large plugin from filling the screen. The sentence "runs with
your permissions" is left out on purpose (HAL-3384).

## Covers

- app.plugin-trust-sections
