# Decision: the plugin trust check shows a backend's sign-ins

- Approval: the Sign-ins section is the team's decision with the designer on HAL-13419 (HAL-2282 rule), with the words the board approved on HAL-8619; the build is HAL-8613; Liam approves this note in review
- Kind: user-visible

## What changes

A plugin's trust content keeps its backend's sign-ins, by name, and lists a sign-in's client secret under its secrets with the token and revoke hosts it may go to. The trust check of `halonic plugin add` and of Studio gets a Sign-ins section after Secrets: each sign-in's name, purpose, the approved trust line and, when the hosts differ, the token host warning. Studio's **Review** marks a new, changed or removed sign-in. `app.plugin-trust-sections` gains the heading "Sign-ins", `app.plugin-trust-content` the sign-ins and client secrets, and `app.plugin-trust-changes` the sign-in changes; two tests that listed every section now leave Sign-ins to their own tests, which use a plugin that signs in.

After a check of the built Studio (HAL-14004, decided by the team): Sign-ins starts open when a sign-in has the token host warning, so nobody presses Trust without seeing it; a changed sign-in whose scopes changed adds the trust line's "It can: …" as it is now to its row on **Review**; and the line under Secrets says "You enter its value in this plugin's settings." instead of "*name*'s settings", which read "Acme Projects's".

A plugin without sign-ins gets no `signIns` in its content and no new secret, so no existing fingerprint changes and nobody has to trust a plugin again.

## Why

The plugin page shows a sign-in's hosts only right before **Sign in**. The person decides trust in the trust check, so every address the plugin sends something to has to be there first (HAL-13419). The format and the loader keep refusing a backend's sign-ins until the agent host runs them; that is the next pull request.

## Covers

- app.plugin-trust-sections
- app.plugin-trust-content
- app.plugin-trust-changes
- packages/core/app/src/plugin-trust-sections.test.ts
- packages/studio/features/plugins/src/trust/plugin-trust-dialog.test.tsx
