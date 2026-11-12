# Decision: a workspace without a name is called by its folder's own name

- Approval: Liam decided this on [HAL-6810](/HAL/issues/HAL-6810) (follow-up from Tomas's review of #2037 on HAL-6693), small wording on approved CLI output, a team decision with no board card (HAL-2282 rule); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QaglOYcLgLEVou0075GyY4ra4eZS9ZRMPJosDPu+ESQX8Dv6t9dj8pJNNRJWUvLQYWbzfjcViKYfo2QWMnj4CA==
- Task: HAL-6810

## What changes

When `workspace.yaml` has no `name` (or doesn't parse), `halonic doctor`, the trust line and
`halonic run`, `runs` and `routines` name the workspace by its folder's own name, not by the folder
as typed. Run from inside `acme`, the trust check reads "Trust check for acme (.)" instead of
"Trust check for . (.)", and `doctor` says "acme" instead of ".". With `--dir acme` the name is
"acme" instead of "./acme". The folder as typed still shows where the output names a path, such as
the "(.)" after the name.

## Why

"." is a path, not a name: a sentence like "No runs in . yet." reads as a mistake. The folder's own
name is what the user would call the workspace when it has no name of its own, and it is what the
action labels ("Couldn't list the runs in acme:") already say.

## Covers

- cli.doctor-workspace
