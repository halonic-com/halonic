# studio.start-asks-trust

- Status: draft
- Since: unreleased
- Source: HAL-13135 (Routines › Run now); HAL-13143 (C144 RT1); `workspace.trust-asked`

Where the Studio runs as the desktop app, the Routines host (for Run now), the Workflows host (for the Run panel) and the run page's start host (for **Run again**) shall each offer `askTrust`, which opens the shown workspace's trust check through the window's trust badge (`workspace.trust-asked`) and answers how the person answered. A host built without that way to ask shall offer no `askTrust`, so a refusal only says why.

## Examples

- Given the Routines host was given the window's trust check,
  when Run now asks for trust and the person trusts the workspace,
  then the host answers "trusted".
- Given a Workflows host built without it,
  then it has no `askTrust`.
