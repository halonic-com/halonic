# Decision: Studio's Sandbox, Trust, Library, Plugins, Changes and About lines say what the code does

- Task: HAL-12642
- Approval: team decision under the HAL-2282 rule for small wording on approved screens; Liam reviews the pull request on HAL-12642 and signs this note
- Kind: user-visible

## What changes

The claims check C52 (HAL-12632) found lines in Studio that don't match `main`. This note covers the wording (W) and dead-string (D) items for Sandbox, Trust, Library, Plugins, Changes and About. Items 3.3, 7.1, 7.2 and 8.1 wait on the flow decision (HAL-12643), and 8.2 is done with 8.1 in HAL-12646.

- Sandbox: Settings says Claude Code and Codex agents run in a sandbox, write only to their own folders and reach only the sites you allow (3.1), and that without a sandbox those agents can't run here yet (3.2). The Inbox card no longer points to a per-agent setting that doesn't exist (3.4). The `windows` reason, which only MXC gives, says the sandbox needs Windows 11 and points to another sandbox in Settings (3.5), and `sign-in-needed` names no Docker service (3.6).
- Run view: the sandbox line and panel say "its own folders", "its own temp and settings folders" and "Can't change" (4.1 to 4.3). The phone fix and the blocked-site hint point to the agent's file and `allowedSites`, since Studio has no field for them (4.5, 4.6). "You added: …" reads "Also: …", since nothing lets a person add a hidden path, but the log still keeps denied paths that fit no group (4.4). The blocked-site lines of 4.8 stay until HAL-12648 makes the sandbox report network blocks and they are wired.
- Trust: the Trusted sources section lists workspaces and plugins, says "Nothing trusted yet." and that trust given with the `halonic` command shows here too, as Studio reads the same records (7.3, 7.4). A new workspace says it uses models on this computer, without naming Ollama, since it sets up no provider (7.5).
- Library: a writable knowledge source says "Agents can keep notes here.", as there is no Memory page (8.3). The unused `usedBy` words and `whatChanged` are gone, and the Trusted sources title uses its constant (8.4).
- Plugins: the line for an app that can't add a plugin is gone (9.1): the Plugins page always gets an installer. `plugins.plugin-list-no-installer` is retired with its one test.
- Changes: the empty page says "Keep versions of this workspace…" (10.5); the email hint says the address is saved with each version (10.3); a staged file says another program got it ready for a version (10.4); and when choosing item by item can't start because only one side is ahead by then, Get updates says the shared copy changed meanwhile (10.1). Unused `include` and `tryAgain` words, and the refusal reasons core never gives a skill or a connector, are gone, with a general fallback (10.6).
- About: an update that couldn't download promises another try only when automatic updates are on (11.5); Halonic checks when it starts and once a day (11.6); the `disk` reason says "something went wrong while downloading", since every IO error maps to it (11.7); and the unused `DOWNLOAD_BUSY` is gone (11.8).

The requirements `app.sandbox-start-words`, `settings.new-agents-run` (its first line only), `runs.run-view.sandbox-panel`, `workspace.trusted-sources`, `library.knowledge-page`, `source-control.get-updates` and `source-control.identity` change their quoted text to match; `app.sandbox-start-words` gains examples for `windows` and `sign-in-needed`, with two new tests. `plugins.plugin-list-no-installer` is retired, and its test in `packages/studio/features/plugins/src/list/plugins-list.test.tsx` is removed with it. The test of `whatChanged` in `packages/studio/features/library/src/listed-tools-words.test.ts` (`library.listed-tools-review`) is removed with the function, which no screen used. Every other changed test checks the new line the screen shows; none was skipped.

## Why

These lines promised more than the code does: an offline network that is allow-listed, a setting, a field, a page or a trash that doesn't exist, a separate trust store that is the same one, or another download try that never comes. Wording fixes on screens the board already approved are the team's call (HAL-2282).

## Covers

- app.sandbox-start-words
- settings.new-agents-run
- runs.run-view.sandbox-panel
- workspace.trusted-sources
- library.knowledge-page
- library.listed-tools-review
- source-control.get-updates
- source-control.identity
- plugins.plugin-list-no-installer
- packages/studio/features/plugins/src/list/plugins-list.test.tsx
- packages/studio/features/library/src/listed-tools-words.test.ts
